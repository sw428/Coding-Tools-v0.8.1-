'use strict';
const assert = require('node:assert/strict');
const { htmlCopyContext } = require('../src/html-context');
const { workflowOptions, selectedCopyInformation, COPY_FIELDS, PASTE_FIELDS, DEFAULT_COMMENT_TEMPLATE } = require('../src/workflow-options');
const { helpAt, registerInlineHelp } = require('../src/inline-help');
const policy = require('../src/paste-policy');
const placement = require('../src/placement');
const safety = require('../src/safe-placement');

function editor(text, languageId = 'html', name = 'target') {
  const at = text.indexOf(name);
  const document = { uri: 'file:///source.' + languageId, version: 1, languageId,
    getText: () => text, offsetAt: p => p.offset, lineAt: () => ({ range: { end: { offset: text.length } } }) };
  const point = { offset: at + 1, line: 0 };
  return { document, selection: { active: point, anchor: point, start: point, end: point, isEmpty: true },
    get selections() { return [this.selection]; }, calls: [], setDecorations(type, items) { this.calls.push(items); } };
}
const source = '<main><section id="news" class="news"><h2 class="heading"></h2><p class="target"><b></b></p><a class="link"></a></section></main>';
const raw = htmlCopyContext(source, { name: 'target', start: source.indexOf('target'), source: 'file:///source.html' });
assert.equal(raw.structure.parent.id, 'news');
const reduced = selectedCopyInformation(raw, ['roles']);
assert.equal(reduced.source, undefined);
assert.equal(reduced.structure.parent, undefined);
assert.equal(reduced.structure.sectioning, undefined);
assert.deepEqual(reduced.structure.placementRole, { kind: 'container', basis: 'html-source', cssLayout: null });
assert.deepEqual(selectedCopyInformation(raw, []), { schemaVersion: 1, name: 'target' });
assert.deepEqual(selectedCopyInformation(raw, COPY_FIELDS), JSON.parse(JSON.stringify(raw)));
const config = new Map();
const vs = { workspace: { getConfiguration: () => ({ get: (k, f) => config.has(k) ? config.get(k) : f }) } };
assert.equal(workflowOptions(vs).helpSeconds, 2);
assert.equal(workflowOptions(vs).helpEnabled, true);
assert.equal(workflowOptions(vs).requireCommentGroup, true);
config.set('help.durationSeconds', 0); assert.equal(workflowOptions(vs).helpSeconds, 0.5);
config.set('help.durationSeconds', NaN); assert.equal(workflowOptions(vs).helpSeconds, 2);
config.set('help.durationSeconds', 50); assert.equal(workflowOptions(vs).helpSeconds, 30);
config.set('copyInformation', ['roles', 'unknown']); assert.deepEqual(workflowOptions(vs).copyFields, ['roles']);
config.set('pasteInformation', []); assert.deepEqual(workflowOptions(vs).pasteFields, []);
config.clear();

const e = editor(source);
assert.match(helpAt(e, false).text, /Ctrl\+2: 次/);
assert.match(helpAt(e, false).text, /Ctrl\+Shift\+Tab: 同名の前/);
assert.match(helpAt(editor('.target {}', 'css'), true).text, /Ctrl\+Tab: 同名の次/);
assert.match(helpAt(editor('.target {}', 'css'), true).text, /Cmd\+1: 前 \/ Cmd\+2: 次/);
assert.equal(helpAt(editor('ordinary text', 'plaintext'), false), null);
assert.equal(helpAt(editor('<div className={styles.target}></div>', 'typescriptreact', 'target'), false), null);
const handlers = {}, timers = new Map(); let sequence = 0, decorationDisposed = false;
const disposable = { dispose() {} };
const mock = { ...vs,
  ThemeColor: class {}, Range: class {},
  window: { activeTextEditor: e,
    createTextEditorDecorationType: () => ({ dispose() { decorationDisposed = true; } }),
    onDidChangeTextEditorSelection: cb => { handlers.selection = cb; return disposable; },
    onDidChangeActiveTextEditor: cb => { handlers.active = cb; return disposable; },
  },
  workspace: { ...vs.workspace,
    onDidChangeTextDocument: cb => { handlers.text = cb; return disposable; },
    onDidChangeConfiguration: cb => { handlers.config = cb; return disposable; },
  },
};
const context = { subscriptions: [] };
registerInlineHelp(mock, context, false, {
  setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; },
  clearTimeout(id) { timers.delete(id); },
});
assert.equal(e.calls.at(-1).length, 1);
assert.equal([...timers.values()][0].ms, 2000);
handlers.selection({ textEditor: e }); assert.equal(timers.size, 1, 'Same class must not restart its timer');
const firstTimer = [...timers.values()][0]; firstTimer.fn(); assert.deepEqual(e.calls.at(-1), []);
config.set('help.enabled', false); handlers.config({ affectsConfiguration: () => true });
assert.equal(timers.size, 0);
handlers.selection({ textEditor: e }); assert.deepEqual(e.calls.at(-1), []);
config.set('help.enabled', true); config.set('help.durationSeconds', 5);
handlers.config({ affectsConfiguration: () => true }); assert.equal([...timers.values()][0].ms, 5000);
const previous = mock.window.activeTextEditor;
mock.window.activeTextEditor = editor('.target {}', 'css'); handlers.active();
assert.deepEqual(previous.calls.at(-1), []);
assert.match(mock.window.activeTextEditor.calls.at(-1)[0].renderOptions.after.contentText, /Ctrl\+1: 前/);
context.subscriptions[0].dispose(); assert.equal(timers.size, 0); assert.equal(decorationDisposed, true);

const options = { pasteFields: PASTE_FIELDS, comments: { section: '/* Section */', '.news': '/* Class */', '#news': '/* ===== News ===== */' }, addComments: true };
const comment = policy.registeredComment(raw, options);
assert.equal(comment.key, '#news');
assert.equal(comment.text, '/* ===== News ===== */');
const css = '/* ===== News ===== */\n.heading {}\n.link {}\n/* Footer */\n.footer {}\n';
const plan = placement.candidates(css, '.target', policy.placementOptions(raw, options, 0, css));
assert.equal(plan.anchor.offset, css.indexOf('.heading {}') + '.heading {}'.length);
assert.match(plan.reason, /兄弟/);
const root = placement.parseCss(css).root;
assert.equal(policy.withSectionComment(css, placement.formatInsert(css, '.target', plan.anchor), root, comment).commentText, null, 'Reuse existing section marker');
const blank = placement.parseCss('').root;
const prepared = policy.withSectionComment('', placement.formatInsert('', '.target', { offset: 0, container: blank }), blank, comment);
const check = safety.preflight('', '.target', prepared.insertion, 'css', prepared.commentText);
assert.equal(check.ok, true, JSON.stringify(check));
assert.equal(check.after, '/* ===== News ===== */\n\n.target {\n}\n');
assert.equal(safety.preflight('', '.target', prepared.insertion).ok, false, 'Unregistered extra comments must be rejected');
assert.equal(safety.preflight('', '.target', prepared.insertion, 'css', 'different').ok, false);
assert.equal(safety.preflight('', '.target', { offset: 0, text: '/* ===== News ===== */\n.target {color:red}' }, 'css', comment.value).ok, false);
assert.equal(safety.preflight('', '.target', { offset: 0, text: '/* ===== News ===== */\n/* another */\n.target {}' }, 'css', comment.value).ok, false);
const media = '@media (min-width: 800px) {\r\n}\r\n';
const at = placement.atRules(placement.parseCss(media), 'media')[0];
const mediaInsert = policy.withSectionComment(media, placement.formatInsert(media, '.target', { offset: at.end - 1, container: at }), at, comment);
assert.equal(safety.preflight(media, '.target', mediaInsert.insertion, 'css', mediaInsert.commentText).ok, true);
assert.ok(!/(?<!\r)\n/.test(mediaInsert.insertion.text), 'Preserve CRLF');
assert.equal((mediaInsert.insertion.text.match(/@media/g) || []).length, 0, 'Never generate queries');
assert.equal(policy.registeredComment(raw, { ...options, comments: {} }), null);
assert.ok(policy.registeredComment(raw, { ...options, comments: { section: '.bad {color:red}' } }).error);
assert.ok(policy.registeredComment(raw, { ...options, comments: { section: '/* a */ /* b */' } }).error);
const partial = JSON.parse(JSON.stringify(raw)); partial.structure.status = 'partial';
assert.equal(policy.registeredComment(partial, options), null);
assert.equal(policy.placementOptions(partial, options, 0, css).siblingClasses, null);
const disabled = policy.placementOptions(raw, { ...options, pasteFields: [] }, 0, css);
assert.deepEqual(disabled.neighbors, {}); assert.equal(disabled.siblingClasses, null);
assert.deepEqual(disabled.parentClasses, []); assert.equal(disabled.sectionRange, null); assert.equal(disabled.useNaming, false);
const parentPlan = placement.candidates('.news {}\n.other {}', '.target', policy.placementOptions(raw, { ...options, pasteFields: ['parent'] }, 0, ''));
assert.equal(parentPlan.anchor.offset, '.news {}'.length);
assert.match(parentPlan.reason, /親要素/);
assert.equal(policy.commentGroup('@media screen { /* ===== News ===== */ .a{} }', comment, '' )?.exists, false);
assert.deepEqual(policy.existingCommentGroups('/* Header */\n.h {}\n/* Footer */\n.f {}').map(g=>g.label),['Header','Footer']);
assert.deepEqual(policy.existingCommentGroups('@media screen { /* Inner */ .a{} }'),[]);
const templateOptions={...options,comments:{},commentTemplate:DEFAULT_COMMENT_TEMPLATE};
assert.equal(policy.registeredComment(raw,templateOptions).text,'/* news\n--------------------------------*/');
const header='<main><header class="mv"><a class="brand"></a></header></main>';
const headerContext=htmlCopyContext(header,{name:'brand',start:header.indexOf('brand')});
assert.equal(policy.registeredComment(headerContext,templateOptions).text,'/* header\n--------------------------------*/');
const nested='<section class="feature"><section id="feature01" class="curriculum"><p class="copy"></p></section></section>';
const nestedContext=htmlCopyContext(nested,{name:'copy',start:nested.indexOf('copy')});
assert.equal(policy.registeredComment(nestedContext,templateOptions).text,'/* curriculum\n--------------------------------*/');
const featureComment=policy.registeredComment(htmlCopyContext('<section class="feature"></section>',{name:'feature',start:16}),templateOptions);
assert.equal(policy.commentGroup('/* Feature\r\n--------------------------------*/\r\n.feature {}',featureComment,'').exists,true);
assert.ok(policy.registeredComment(raw,{...templateOptions,commentTemplate:'/* {name} */ .bad {}'}).error);
assert.equal(policy.registeredComment(raw,{...templateOptions,commentTemplate:''}),null);
const multiline=policy.registeredComment(raw,templateOptions);
const multilineMedia=policy.withSectionComment(media,placement.formatInsert(media,'.target',{offset:at.end-1,container:at}),at,multiline);
assert.equal(safety.preflight(media,'.target',multilineMedia.insertion,'css',multilineMedia.commentText).ok,true,'Multiline templates must remain valid after CRLF and indentation conversion');
const multilineRoot=policy.withSectionComment('.existing {}\r\n',placement.formatInsert('.existing {}\r\n','.target',{offset:14,container:placement.parseCss('.existing {}\r\n').root}),placement.parseCss('.existing {}\r\n').root,multiline);
assert.equal(safety.preflight('.existing {}\r\n','.target',multilineRoot.insertion,'css',multilineRoot.commentText).ok,true);
const asideSource='<section class="course"><aside class="sidebar"><p class="hint"></p></aside></section>';
const asideContext=htmlCopyContext(asideSource,{name:'hint',start:asideSource.indexOf('hint')});
assert.equal(asideContext.structure.parent.tag,'aside');
assert.deepEqual(asideContext.structure.sectioning.ancestors.map(n=>n.tag),['section','aside']);
assert.equal(policy.registeredComment(asideContext,templateOptions).text,'/* course\n--------------------------------*/','Aside classes belong under the containing section heading');
const asideOnly='<aside class="sidebar"><p class="hint"></p></aside>';
assert.equal(policy.registeredComment(htmlCopyContext(asideOnly,{name:'sidebar',start:asideOnly.indexOf('sidebar')}),templateOptions),null,'Aside itself is an ordinary class rule, not an automatic heading');
console.log('workflow-tests: timed inline help, field selection, placement bases, registered CSS comments, deduplication and safety passed');
