'use strict';

// Classify the insertion point without requiring an already complete stylesheet.
// Comments, strings and declaration values receive the unmodified class name.
function cssPasteContext(text, offset) {
  const prefix = text.slice(0, offset);
  const clean = prefix.split('');
  const blocks = [];
  let comment = false, lineComment = false, quote = '', escaped = false;
  let round = 0, square = 0, from = 0;
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i], next = prefix[i + 1];
    if (lineComment) {
      if (c === '\n' || c === '\r') lineComment = false;
      else clean[i] = ' ';
      continue;
    }
    if (comment) {
      clean[i] = ' ';
      if (c === '*' && next === '/') { clean[++i] = ' '; comment = false; }
      continue;
    }
    if (quote) {
      clean[i] = ' ';
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && next === '*') { clean[i] = clean[++i] = ' '; comment = true; continue; }
    // Accept // as a comment boundary for SCSS/Less and incomplete editor text.
    // Slashes in unquoted url(...) are not line comments.
    if (c === '/' && next === '/' && !round) { clean[i] = clean[++i] = ' '; lineComment = true; continue; }
    if (c === '"' || c === "'") { quote = c; clean[i] = ' '; continue; }
    if (c === '(') round++;
    if (c === ')' && round) round--;
    if (c === '[') square++;
    if (c === ']' && square) square--;
    if (round || square) continue;
    if (c === '{') {
      const prelude = clean.slice(from, i).join('').trim();
      const group = /^@(media|supports|container|layer|scope|starting-style)\b/i.test(prelude);
      blocks.push(group ? 'group' : 'declarations');
      from = i + 1;
    } else if (c === '}') { blocks.pop(); from = i + 1; }
    else if (c === ';') from = i + 1;
  }
  if (comment || lineComment || quote) return 'plain';
  const fragment = clean.slice(from).join('').trim();
  if (square) return 'plain';
  if (round) return /^[.#&>+~:]/.test(fragment) && !fragment.includes(': ') ? 'selector' : 'plain';
  if (blocks.at(-1) === 'declarations') {
    return /^[.#&>+~]/.test(fragment) ? 'selector' : 'plain';
  }
  if (fragment.startsWith('@')) return 'plain';
  if (fragment) return 'selector';
  const tail = text.slice(offset).split(/[\r\n]/, 1)[0].trim();
  if (tail && !tail.startsWith('}') && !tail.startsWith('/*') && !tail.startsWith('//')) return 'selector';
  return 'structure';
}

module.exports = { cssPasteContext };
