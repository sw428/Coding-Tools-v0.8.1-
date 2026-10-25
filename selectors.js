'use strict';

// A small dependency-free selector scanner. It intentionally finds common .class
// selectors in CSS, SCSS and Less, including nested rules and media queries.
// It is not a full CSS parser (e.g. escaped identifiers are not supported).
function maskCommentsAndStrings(source) {
  const characters = source.split('');
  let quote = null;
  let comment = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (comment) {
      if (ch === '*' && next === '/') {
        characters[i] = characters[i + 1] = ' ';
        i++;
        comment = false;
      } else if (ch !== '\n' && ch !== '\r') characters[i] = ' ';
      continue;
    }
    if (quote) {
      if (ch === '\\' && i + 1 < source.length) {
        characters[i] = characters[i + 1] = ' ';
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      if (ch !== '\n' && ch !== '\r') characters[i] = ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      characters[i] = characters[i + 1] = ' ';
      i++;
      comment = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      characters[i] = ' ';
    }
  }
  return characters.join('');
}

function findCssClasses(source) {
  const clean = maskCommentsAndStrings(source);
  const found = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '(') parentheses++;
    else if (ch === ')' && parentheses) parentheses--;
    else if (ch === '[') brackets++;
    else if (ch === ']' && brackets) brackets--;
    if (parentheses || brackets) continue;

    if (ch === '{') {
      const prelude = clean.slice(start, i);
      const trimmed = prelude.trim();
      // At-rule preludes can contain selector(.class) but are not selectors.
      // Custom property objects / declaration-like values are not rules.
      if (trimmed && !trimmed.startsWith('@') && !/^(?:--)?[\w-]+\s*:\s+/.test(trimmed)) {
        const pattern = /\.(-?[_a-zA-Z\u0080-\uFFFF][-_a-zA-Z0-9\u0080-\uFFFF]*)/g;
        let match;
        while ((match = pattern.exec(prelude)) !== null) {
          found.push({ name: match[1], start: start + match.index, end: start + match.index + match[0].length });
        }
      }
      start = i + 1;
    } else if (ch === ';' || ch === '}') {
      start = i + 1;
    }
  }
  return found;
}

function nextClass(classes, cursor, direction) {
  if (classes.length === 0) return null;
  const underCursor = classes.find((item) => item.start <= cursor && cursor < item.end);
  const reference = underCursor ? underCursor.start : cursor;
  if (direction > 0) return classes.find((item) => item.start > reference) || classes[0];
  return [...classes].reverse().find((item) => item.start < reference) || classes[classes.length - 1];
}

// Find individual whitespace-separated class tokens in HTML opening tags.
// Parses class="..." and class='...' (including multiline attributes),
// skipping comments and <script>/<style> contents. For JSX, className is
// recognized as well. It is a lightweight scanner, not a full HTML parser.
function findHtmlClasses(source) {
  const results = [];
  const tokenPattern = /\S+/g;
  const length = source.length;
  let i = 0;

  function addTokens(value, valueOffset) {
    tokenPattern.lastIndex = 0;
    let match;
    while ((match = tokenPattern.exec(value)) !== null) {
      const start = valueOffset + match.index;
      results.push({ name: match[0], start, end: start + match[0].length });
    }
  }

  while (i < length) {
    const tagOpen = source.indexOf('<', i);
    if (tagOpen < 0) break;
    if (source.startsWith('<!--', tagOpen)) {
      const endComment = source.indexOf('-->', tagOpen + 4);
      i = endComment < 0 ? length : endComment + 3;
      continue;
    }
    // Closing tags, doctypes, and other constructs have no class attributes.
    const nameMatch = /^[a-zA-Z][\w:-]*/.exec(source.slice(tagOpen + 1));
    if (!nameMatch) {
      i = tagOpen + 1;
      continue;
    }
    const tagName = nameMatch[0].toLowerCase();
    let j = tagOpen + 1 + nameMatch[0].length;
    let selfClosing = false;

    while (j < length) {
      while (j < length && /\s/.test(source[j])) j++;
      if (source[j] === '>') { j++; break; }
      if (source[j] === '/' && source[j + 1] === '>') { j += 2; selfClosing = true; break; }
      if (j >= length) break;

      // Attributes end at spaces, '=', '/', or '>'. Quoted attribute values
      // are read separately, so spaces and > inside those values are safe.
      const attrStart = j;
      while (j < length && !/[\s=/>"']/.test(source[j])) j++;
      if (j === attrStart) { j++; continue; }
      const attr = source.slice(attrStart, j);
      while (j < length && /\s/.test(source[j])) j++;
      if (source[j] !== '=') continue; // Boolean attribute.
      j++;
      while (j < length && /\s/.test(source[j])) j++;

      let valueStart = j;
      let value;
      if (source[j] === '"' || source[j] === "'") {
        const quote = source[j++];
        valueStart = j;
        const close = source.indexOf(quote, j);
        const valueEnd = close < 0 ? length : close;
        value = source.slice(j, valueEnd);
        j = close < 0 ? length : close + 1;
      } else {
        // Also recognize valid unquoted class=foo (but not necessary for the
        // usual quoted form requested by the user).
        while (j < length && !/[\s>]/.test(source[j])) j++;
        value = source.slice(valueStart, j);
      }
      if (attr === 'class' || attr === 'className') addTokens(value, valueStart);
    }
    i = Math.max(j, tagOpen + 1);

    // Script/style bodies contain arbitrary strings with <div class="...">;
    // they should not be treated as HTML classes.
    if (!selfClosing && (tagName === 'script' || tagName === 'style')) {
      const closing = new RegExp(`</${tagName}\\b`, 'ig');
      closing.lastIndex = i;
      const close = closing.exec(source);
      i = close ? close.index + 1 : length;
    }
  }
  return results;
}

function htmlClassAtCursor(line, column) {
  const token = findHtmlClasses(line).find((item) => item.start <= column && column < item.end);
  return token ? token.name : null;
}

module.exports = { findCssClasses, nextClass, findHtmlClasses, htmlClassAtCursor };
