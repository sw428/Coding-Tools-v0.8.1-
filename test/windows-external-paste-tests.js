'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const cp = require('node:child_process');
const {pipeName} = require('../src/external-paste');
const root = path.resolve(__dirname, '..');
const name = pipeName(root + '/ipc-test');
const endpoint = '\\\\.\\pipe\\' + name;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const socket = net.connect(endpoint);
    try {
      await new Promise((resolve, reject) => {socket.once('connect', resolve); socket.once('error', reject);});
      socket.on('error', () => {});
      return socket;
    } catch {socket.destroy(); await sleep(100);}
  }
  throw new Error('Native pipe did not start');
}
async function run() {
  const child = cp.spawn(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(root, 'src/native/windows-slot-paste.ps1'), '-PipeName', name, '-ProbeIpc'],
    {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
  let stderr = '';
  child.stderr.on('data', data => {stderr += data.toString();});
  const exited = new Promise(resolve => child.once('exit', resolve));
  let first, second;
  try {
    first = await connect(); second = await connect();
    first.write(JSON.stringify({type: 'slots', slots: [{n: 1, text: 'probe-one', version: 100}]}) + '\n');
    second.write(JSON.stringify({type: 'slots', slots: [{n: 2, text: 'probe-two', version: 101}]}) + '\n');
    const received = socket => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Disable notification missing')), 4000);
      let buffer = '';
      socket.on('data', chunk => {
        buffer += chunk.toString();
        if (buffer.includes('"disabled"')) {clearTimeout(timeout); resolve(true);}
      });
    });
    const notifications = Promise.all([received(first), received(second)]);
    first.write('{"type":"disable"}\n');
    assert.deepEqual(await notifications, [true, true]);
    first.destroy(); second.destroy();
    const result = await Promise.race([exited, sleep(10000).then(() => 'timeout')]);
    assert.equal(result, 0, 'Helper must exit after its clients disconnect. ' + stderr.slice(0, 500));
    console.log('WINDOWS_IPC_TESTS_PASSED: two local clients, slot messages, global OFF, automatic exit');
  } finally {
    first?.destroy(); second?.destroy();
    if (child.exitCode === null) child.kill();
  }
}
run().catch(error => {console.error(error); process.exitCode = 1;});
