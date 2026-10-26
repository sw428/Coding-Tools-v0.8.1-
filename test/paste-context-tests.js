'use strict';
const assert=require('node:assert/strict');
const {cssPasteContext}=require('../paste-context');
const cases=[
  [
    "",
    "structure"
  ],
  [
    "  ¦\n.a {}",
    "structure"
  ],
  [
    "/* ¦ */",
    "plain"
  ],
  [
    "/* closed */\n¦",
    "structure"
  ],
  [
    "// note ¦",
    "plain"
  ],
  [
    "// note\n¦",
    "structure"
  ],
  [
    ".a { content: \"¦\"; }",
    "plain"
  ],
  [
    ".a { content: '¦'; }",
    "plain"
  ],
  [
    ".a { color: ¦; }",
    "plain"
  ],
  [
    ".a { --name: ¦; }",
    "plain"
  ],
  [
    ".a { background: url(https://example.com/¦); }",
    "plain"
  ],
  [
    ".a { color: var(--¦); }",
    "plain"
  ],
  [
    "@media (min-width: ¦) {}",
    "plain"
  ],
  [
    "@media screen {\n  ¦\n}",
    "structure"
  ],
  [
    "@supports (display:grid) {\n¦\n}",
    "structure"
  ],
  [
    ".a, ¦ {}",
    "selector"
  ],
  [
    ".¦",
    "selector"
  ],
  [
    ".a:has(¦)",
    "selector"
  ],
  [
    ":is(¦)",
    "selector"
  ],
  [
    ".a[data-x=¦] {}",
    "plain"
  ],
  [
    ".a {\n ¦\n}",
    "plain"
  ],
  [
    ".a {\n & > ¦ {}\n}",
    "selector"
  ],
  [
    "@font-face { font-family: ¦; }",
    "plain"
  ]
];
for(const [example,expected] of cases){const at=example.includes('¦')?example.indexOf('¦'):example.length;const text=example.replace('¦','');assert.equal(cssPasteContext(text,at),expected,example);}
console.log('paste-context-tests: '+cases.length+' insertion contexts passed');
