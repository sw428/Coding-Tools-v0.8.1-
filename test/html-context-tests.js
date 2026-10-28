'use strict';
const assert = require('node:assert/strict');
const { htmlCopyContext } = require('../src/html-context');

function copy(text, name, occurrence = 0, options = {}) {
  let at = -1;
  for (let i = 0; i <= occurrence; i++) at = text.indexOf(name, at + 1);
  return htmlCopyContext(text, { name, start: at, end: at + name.length,
    source: 'file:///example.html', documentVersion: 7, ...options });
}

const html = '<main class="page"><section id="news" class="news">' +
  '<h2 class="news__title">News</h2> text <!-- skipped -->' +
  '<article class="news__card selected"><img class="thumb"><p class="summary">Text</p></article>' +
  '<a class="news__link">More</a></section></main>';
const ctx = copy(html, 'news__card');
assert.equal(ctx.schemaVersion, 1);
assert.equal(ctx.name, 'news__card');
assert.equal(ctx.before, 'news__title');
assert.equal(ctx.after, 'news__link');
assert.equal(ctx.source, 'file:///example.html');
assert.equal(ctx.documentVersion, 7);
assert.equal(ctx.structure.status, 'source');
assert.equal(ctx.structure.element.tag, 'article');
assert.deepEqual(ctx.structure.element.classes, ['news__card', 'selected']);
assert.equal(ctx.structure.parent.id, 'news');
assert.deepEqual(ctx.structure.ancestors.map(n => n.tag), ['main', 'section']);
assert.deepEqual(ctx.structure.children.map(n => n.tag), ['img', 'p']);
assert.equal(ctx.structure.childCount, 2);
assert.equal(ctx.structure.siblings.previous.tag, 'h2');
assert.equal(ctx.structure.siblings.next.tag, 'a');
assert.equal(ctx.structure.siblings.index, 1);
assert.equal(ctx.structure.siblings.count, 3);
assert.deepEqual(ctx.structure.sectioning.ancestors.map(n => n.tag), ['section', 'article']);
assert.equal(ctx.structure.sectioning.current.tag, 'article');
assert.equal(ctx.structure.placementRole.kind, 'section');
assert.equal(ctx.structure.placementRole.region.tag, 'main');
assert.equal(ctx.structure.placementRole.cssLayout, null);
assert.deepEqual(JSON.parse(JSON.stringify(ctx)), ctx, 'Snapshot must be persistable without cycles');

const plain = copy('<main><div class="card"><span class="label"></span></div></main>', 'card');
assert.equal(plain.before, null);
assert.equal(plain.structure.parent.tag, 'main', 'Names without BEM prefixes retain structure too');
assert.equal(plain.structure.placementRole.kind, 'container');
assert.equal(plain.structure.sectioning.current, null, 'main is not sectioning content');
const heading = copy('<header><h1 class="title">T</h1></header>', 'title');
assert.equal(heading.structure.placementRole.kind, 'heading');
assert.equal(heading.structure.placementRole.region.tag, 'header');
assert.deepEqual(heading.structure.sectioning.ancestors, []);

const duplicates = '<section id="first"><p class="same"></p></section>' +
  '<aside id="second"><p class="same"></p></aside>';
assert.equal(copy(duplicates, 'same', 1).structure.parent.id, 'second');
const pos = duplicates.lastIndexOf('same');
assert.equal(htmlCopyContext(duplicates, { name: 'same', start: pos + 2 }).structure.parent.id, 'second');
assert.equal(htmlCopyContext(duplicates, { name: 'same', start: pos + 4 }), null, 'Caret at token end must not select a neighboring occurrence');

const escaped = '<div title="a > b" class="multi\n next"><input class="field"></div>';
assert.equal(copy(escaped, 'next').structure.element.tag, 'div');
assert.equal(copy(escaped, 'field').structure.parent.tag, 'div');
assert.equal(copy('<div><img class=photo><br><p class=text></p></div>', 'text').structure.siblings.previous.tag, 'br');
const ignored = '<!-- <section class="ghost"></section> -->' +
  '<script>const x = \'<div class="ghost"></div>\';</script>' +
  '<style>.x { content: \'<p class="ghost">\'; }</style>' +
  '<textarea><div class="ghost"></div></textarea>' +
  '<nav><a class="real">Link</a></nav>';
assert.equal(copy(ignored, 'real').structure.parent.tag, 'nav');
assert.equal(copy(ignored, 'ghost'), null);

const jsx = copy('<div className="wrap"><p className="item" data-x={a > 1 ? "x" : "y"}/></div>', 'item', 0, { languageId: 'typescriptreact' });
assert.equal(jsx.structure.parent.classes[0], 'wrap');
assert.equal(jsx.structure.status, 'partial');
assert.ok(jsx.structure.issues.includes('template-source'));
const dynamic = copy('<div className={styles.card}></div>', '{styles.card}', 0, { languageId: 'typescriptreact' });
assert.equal(dynamic.structure.status, 'unavailable', 'Dynamic expressions must not become proven DOM classes');
assert.equal(copy('<section><p class="unfinished">', 'unfinished').structure.status, 'partial');
assert.equal(copy('<section><p class="broken"></section>', 'broken').structure.status, 'partial');
assert.equal(copy('<table><tr><td class="cell"></td></tr></table>', 'cell').structure.status, 'partial');
const large = '<div class="parent">' + '<i></i>'.repeat(40) + '</div>';
assert.equal(copy(large, 'parent').structure.children.length, 32);
assert.equal(copy(large, 'parent').structure.childCount, 40);
assert.equal(copy(large, 'parent').structure.childrenTruncated, true);
assert.equal(copy('<div class="big"></div>' + ' '.repeat(2_000_000), 'big').structure.issues[0], 'source-limit');
assert.equal(copy('<div class="deep">' + '<div>'.repeat(140), 'deep').structure.issues[0], 'structure-limit');
console.log('html-context-tests: source relationships, sectioning, roles, duplicate classes, templates, malformed markup and limits passed');
