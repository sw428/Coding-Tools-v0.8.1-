'use strict';
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const settings = require('../src/settings');
const {storedIdentifier, plainSlotValue, SELECTOR_FORMAT, selectorKind, encodeSlot, decodeSlot} = require('../src/slot-values');
const {createExternalPaste, pipeName} = require('../src/external-paste');
class Socket extends EventEmitter {
  constructor() { super(); this.connecting = true; this.destroyed = false; this.writes = []; }
  write(value) { this.writes.push(JSON.parse(value)); }
  end(value) { if (value) this.write(value); this.destroy(); }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('close'); }
  ready() { this.connecting = false; this.emit('connect'); }
}
async function run() {
  for (const [kind, marker] of [['class', '.'], ['id', '#']]) {
    assert.equal(storedIdentifier('panel', kind), marker + 'panel');
    assert.equal(plainSlotValue(marker + 'panel', kind, SELECTOR_FORMAT), 'panel');
    assert.equal(plainSlotValue(marker + 'panel', null, SELECTOR_FORMAT), 'panel', 'new markers route even when separate kind metadata is unavailable');
    assert.equal(selectorKind(marker + 'panel', null, SELECTOR_FORMAT), kind);
    assert.equal(selectorKind(marker + 'panel', kind === 'id' ? 'class' : 'id', SELECTOR_FORMAT), kind, 'new stored marker takes precedence over stale metadata');
    assert.equal(plainSlotValue('.literal', kind, undefined), '.literal', 'legacy punctuation stays intact');
    assert.equal(plainSlotValue('panel', kind, undefined), 'panel');
  }
  for (const kind of ['class','id',null]) {
    const stored = kind ? storedIdentifier('panel',kind) : '.ordinary text';
    const record = encodeSlot(stored,kind,123);
    assert.deepEqual(decodeSlot(record,'id',undefined,999), {stored,text:kind?'panel':stored,kind,format:kind?'selector-v1':'text-v1',version:123});
  }
  assert.equal(decodeSlot('legacy','class').text,'legacy');
  assert.equal(plainSlotValue('.ordinary text', null, SELECTOR_FORMAT), '.ordinary text');
  assert.equal(plainSlotValue(undefined, 'class', SELECTOR_FORMAT), undefined);
  assert.equal(pipeName('C:/Users/example'), pipeName('c:/users/example'));
  assert.match(pipeName('C:/Users/example'), /^coding-tools-slot-paste-[a-f0-9]{24}$/);
  assert.notEqual(pipeName('a'), pipeName('b'));
  const state = new Map();
  const context = {extensionPath: __dirname, extensionMode: 1, globalState: {
    get: (key, fallback) => state.has(key) ? state.get(key) : fallback,
    update: async (key, value) => state.set(key, value)
  }};
  const warnings = [];
  const vscode = {window: {showWarningMessage: message => warnings.push(message)}};
  let connects = 0, spawns = 0, socket;
  const options = {platform: 'win32',
    connect() {connects++; socket = new Socket(); return socket;},
    spawn() {spawns++; return new EventEmitter();}
  };
  let slots = [{n: 1, text: 'panel', version: 10}, {n: 2, text: 'region', version: 11}];
  const testHost = createExternalPaste(vscode, {...context, extensionMode: 3}, () => slots, options);
  assert.equal(connects, 0, 'VS Code extension tests must not launch global hotkeys');
  testHost.dispose();
  const mac = createExternalPaste(vscode, context, () => slots, {...options, platform: 'darwin'});
  assert.equal(mac.supported, false); assert.equal(connects, 0); mac.dispose();
  const helper = createExternalPaste(vscode, context, () => slots, options);
  assert.equal(connects, 1); socket.ready();
  assert.deepEqual(socket.writes.at(-1), {type: 'slots', slots});
  slots = [{n: 1, text: 'new-name', version: 12}, slots[1]];
  helper.sync(); assert.deepEqual(socket.writes.at(-1).slots, slots);
  const first = socket;
  await settings.setEnabled(context, 'externalPaste', false);
  helper.refresh();
  assert.deepEqual(first.writes.at(-1), {type: 'disable'});
  assert.equal(first.destroyed, true);
  await settings.setEnabled(context, 'externalPaste', true);
  helper.refresh(); socket.ready();
  socket.emit('data', Buffer.from('{"type":"disabled"}\n'));
  await Promise.resolve();
  assert.equal(settings.enabled(context, 'externalPaste'), false);
  assert.equal(socket.destroyed, true);
  helper.dispose(); first.emit('error', new Error('closed'));
  assert.equal(spawns, 0, 'dispose must not restart a helper');
  assert.equal(warnings.length, 0);
  console.log('external-paste-tests: marked/legacy slots, local IPC, isolation, synchronization and disable passed');
}
run().catch(error => {console.error(error); process.exitCode = 1;});
