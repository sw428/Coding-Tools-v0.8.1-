'use strict';
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const cp = require('node:child_process');
const settings = require('./settings');

// Local named pipes only: no HTTP listener, network service, or clipboard files.
function pipeName(home = os.homedir()) {
  return 'coding-tools-slot-paste-' + crypto.createHash('sha256').update(home.toLowerCase()).digest('hex').slice(0, 24);
}
function createExternalPaste(vscode, context, getSlots, options = {}) {
  const platform = options.platform || process.platform;
  const supported = platform === 'win32' && (options.allowTest || [1, 2].includes(context.extensionMode));
  const connect = options.connect || (name => net.connect('\\\\.\\pipe\\' + name));
  const spawn = options.spawn || cp.spawn;
  const name = pipeName(options.home);
  let socket, retry, child, disposed = false, starting = false, connecting = false;
  let attempts = 0, announced = false, buffer = '', forcedOff = false;
  const on = () => !disposed && !forcedOff && supported && settings.enabled(context, 'externalPaste');
  const warn = message => {
    if (!announced) { announced = true; vscode.window.showWarningMessage('Coding Tools: ' + message); }
  };
  function send() {
    if (!socket || socket.destroyed || socket.connecting) return;
    socket.write(JSON.stringify({type: 'slots', slots: getSlots()}) + '\n');
  }
  function launch() {
    if (starting || child || !on()) return;
    starting = true;
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    try {
      child = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(context.extensionPath, 'src', 'native', 'windows-slot-paste.ps1'), '-PipeName', name],
      {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
      child.stderr?.on('data', () => {}); // Never record slot or clipboard content.
      child.on('error', () => { child = undefined; starting = false; warn('外部貼り付けの補助処理を起動できませんでした。'); });
      child.on('exit', () => { child = undefined; starting = false; });
      child.unref?.();
    } catch (_) { child = undefined; starting = false; }
  }
  function schedule() {
    if (!on() || retry) return;
    if (++attempts > 40) { warn('外部貼り付けに接続できませんでした。設定をOFF→ONで再試行できます。'); return; }
    retry = setTimeout(() => { retry = undefined; open(); }, 250);
    retry.unref?.();
  }
  function open() {
    if (!on() || socket || connecting) return;
    connecting = true;
    const client = connect(name);
    socket = client;
    client.once('connect', () => { connecting = false; attempts = 0; starting = false; buffer = ''; send(); });
    client.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 65536) { buffer = ''; return; }
      let i;
      while ((i = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        try {
          const message = JSON.parse(line);
          if (message.type === 'disabled') { forcedOff = true; void settings.setEnabled(context, 'externalPaste', false); socket?.destroy(); }
          if (message.type === 'error') warn('外部貼り付けを完了できませんでした。入力先や通常のコピー内容を確認してください。');
        } catch (_) {}
      }
    });
    client.on('error', () => { launch(); });
    client.on('close', () => {
      if (socket !== client) return;
      socket = undefined; connecting = false;
      schedule();
    });
  }
  function refresh() {
    forcedOff = false;
    if (!on()) { clearTimeout(retry); retry = undefined;
      if (socket && !socket.connecting && !socket.destroyed) socket.end(JSON.stringify({type: 'disable'}) + '\n');
      else socket?.destroy();
      socket = undefined; connecting = false; return; }
    if (socket) send();
    else { attempts = 0; announced = false; open(); }
  }
  function dispose() { disposed = true; clearTimeout(retry); retry = undefined; socket?.destroy(); socket = undefined; }
  refresh();
  return {refresh, sync: send, dispose, supported};
}
module.exports = {createExternalPaste, pipeName};
