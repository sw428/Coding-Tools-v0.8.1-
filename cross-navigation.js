'use strict';

const path = require('node:path');
const { findCssClasses, findHtmlClasses } = require('./selectors');
const placement = require('./placement');

const CSS = new Set(['css','scss','less']);
const HTML = new Set(['html','vue','php','javascriptreact','typescriptreact']);

/** Return the exact class under a caret or full-class selection, never a substring. */
function classAt(text, languageId, start, end = start) {
  const candidates = CSS.has(languageId) ? findCssClasses(text) :
    HTML.has(languageId) ? findHtmlClasses(text) : [];
  const isSelection = end !== start;
  return candidates.find(c => isSelection
    ? (start === c.start && end === c.end) ||
      (CSS.has(languageId) && start === c.start + 1 && end === c.end)
    : c.start <= start && start < c.end) || null;
}

function matchesAt(text, offset, name) {
  return findCssClasses(text).filter(x => x.name === name)
    .map(x => ({name:x.name, start:offset+x.start, end:offset+x.end,
      scope:cssScopeAt(text,x.start)}));
}

function cssScopeAt(text, offset) {
  try {
    const parsed = placement.parseCss(text);
    if (parsed.invalid) return 'CSSルール（解析要確認）';
    const containing = placement.rules(parsed).filter(rule => rule.start <= offset && offset < rule.brace)
      .sort((a,b) => a.end - a.start)[0];
    if (!containing) return 'CSSルール';
    const label = placement.scopeLabel(containing);
    return `${label} / ${containing.prelude.replace(/\s+/g,' ').slice(0,100)}`;
  } catch (_) {return 'CSSルール';}
}

/** Finds exact class-token occurrences; does not perform edits. */
function findTargets(text, filename, destination, name) {
  const ext = path.extname(filename).toLowerCase();
  if (destination === 'css') {
    if (['.css','.scss','.less'].includes(ext)) return matchesAt(text,0,name);
    return [];
  }
  if (!['.html','.htm','.vue','.php','.jsx','.tsx'].includes(ext)) return [];
  return findHtmlClasses(text).filter(x => x.name === name)
    .map(x => ({...x, scope:'HTML class属性'}));
}

function lineAt(text, offset) {
  const before = text.slice(0,offset);
  const line = before.split('\n').length;
  const start = text.lastIndexOf('\n',offset-1)+1;
  const end = text.indexOf('\n',offset);
  return {line,text:text.slice(start,end<0?text.length:end).trim()};
}

// Prefer contextual neighbors first and then files near the source. Ordering is
// intentionally heuristic: all results stay available through Tab / Shift+Tab.
function classNeighbors(text, languageId, at, radius=6) {
  const tokens = CSS.has(languageId) ? findCssClasses(text) :
    HTML.has(languageId) ? findHtmlClasses(text) : [];
  let idx = tokens.findIndex(t => t.start <= at && at < t.end);
  if (idx < 0) idx = tokens.findIndex(t => t.start >= at);
  if (idx < 0) idx = tokens.length;
  return {
    before: tokens.slice(Math.max(0,idx-radius),idx).map(t=>t.name).reverse(),
    after: tokens.slice(idx+1,idx+1+radius).map(t=>t.name)
  };
}

function scoreCandidate(source, candidate) {
  let score=0;
  const srcDir=path.dirname(source.filename);
  const targetDir=path.dirname(candidate.filename);
  if (targetDir===srcDir) score+=36;
  else if (targetDir.startsWith(srcDir+path.sep) || srcDir.startsWith(targetDir+path.sep)) score+=15;
  // Similar nearby class names indicate the same component and document order.
  const from=classNeighbors(source.text,source.languageId,source.start);
  const to=classNeighbors(candidate.content,candidate.languageId,candidate.start);
  for (const side of ['before','after']) {
    for (let i=0;i<from[side].length;i++) {
      const near=to[side].indexOf(from[side][i]);
      if (near>=0) score+=Math.max(0, 45-7*i-5*near);
    }
  }
  // When HTML does not imply a particular breakpoint, favor base CSS rule.
  if (candidate.destination==='css' && !candidate.scope?.includes('@media')) score+=9;
  return score;
}

function rankCandidates(source, candidates) {
  return candidates.map((candidate,index) => ({...candidate, rankScore:scoreCandidate(source,candidate),originalIndex:index}))
    .sort((a,b)=>b.rankScore-a.rankScore || a.filename.localeCompare(b.filename) || a.start-b.start);
}

module.exports = {classAt,findTargets,lineAt,classNeighbors,scoreCandidate,rankCandidates};
