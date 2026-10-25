'use strict';

const { randomBytes } = require('node:crypto');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

/**
 * A keyboard-controlled, *single-action* confirmation view.
 * Up/Down: move focus; Right: turn focused action ON (turn others OFF);
 * Left: turn focused action OFF; Enter: run only the ON action; Escape: cancel.
 * No action runs while simply changing selection or focus.
 */
function showConfirmation(vscode, { title, subtitle, items, defaultIndex = 0 }) {
  if (!Array.isArray(items) || items.length === 0) return Promise.resolve(null);
  const nonce = randomBytes(16).toString('base64');
  const safeTitle = escapeHtml(title || '操作の確認');
  const safeSubtitle = escapeHtml(subtitle || '実行する操作を選択してください');
  const initial = Math.max(-1, Math.min(items.length - 1, defaultIndex));
  const rows = items.map((item, i) => `
    <li class="item${i === initial ? ' on' : ''}${i === Math.max(initial, 0) ? ' focused' : ''}" role="radio" aria-checked="${i === initial}" data-id="${i}" tabindex="-1">
      <div class="top"><span class="indicator" aria-hidden="true">${i === initial ? 'ON' : 'OFF'}</span><span class="label">${escapeHtml(item.label)}</span></div>
      ${item.description ? `<div class="description">${escapeHtml(item.description)}</div>` : ''}
      ${item.detail ? `<div class="detail">${escapeHtml(item.detail)}</div>` : ''}
    </li>`).join('');
  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>${safeTitle}</title>
<style nonce="${nonce}">
  body { color:var(--vscode-foreground); background:var(--vscode-editor-background); font-family:var(--vscode-font-family); padding:20px; max-width:900px; margin:0 auto; }
  h2 { font-size:18px; margin:0 0 9px; }
  p { margin:0 0 18px; color:var(--vscode-descriptionForeground); }
  ul { padding:0; margin:0; list-style:none; }
  .item { border:1px solid var(--vscode-panel-border, #666); padding:12px 14px; margin-bottom:9px; border-radius:7px; cursor:pointer; }
  .item.focused { border:2px solid var(--vscode-focusBorder, #5799da); padding:11px 13px; outline:0; }
  .item.on { background:var(--vscode-list-activeSelectionBackground, #25436a); color:var(--vscode-list-activeSelectionForeground, #fff); }
  .top { display:flex; align-items:center; gap:10px; }
  .indicator { display:inline-block; font-weight:600; min-width:39px; font-size:11px; opacity:.85; }
  .label { font-weight:600; }
  .description { margin:6px 0 0 49px; font-size:12px; opacity:.82; }
  .detail { margin:4px 0 0 49px; font-size:12px; opacity:.73; }
  #help { margin-top:17px; font-size:13px; color:var(--vscode-descriptionForeground); }
  kbd { padding:1px 5px; border:1px solid var(--vscode-panel-border); border-radius:3px; font-family:inherit; }
  #status { margin-top:12px; min-height:22px; font-size:13px; }
</style></head>
<body tabindex="-1"><h2>${safeTitle}</h2><p>${safeSubtitle}</p>
<ul id="choices" role="radiogroup" aria-label="確認項目">${rows}</ul>
<div id="help"><kbd>↑</kbd><kbd>↓</kbd> 項目移動　<kbd>→</kbd> ON　<kbd>←</kbd> OFF　<kbd>Enter</kbd> 決定　<kbd>Esc</kbd> 中止</div>
<div id="status" role="status" aria-live="polite"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const rows = [...document.querySelectorAll('.item')];
  let focused = ${Math.max(initial, 0)};
  let selected = ${initial};
  function render() {
    rows.forEach((row, i) => {
      const isOn = selected === i;
      row.classList.toggle('on', isOn);
      row.classList.toggle('focused', focused === i);
      row.setAttribute('aria-checked', String(isOn));
      row.querySelector('.indicator').textContent = isOn ? 'ON' : 'OFF';
    });
    rows[focused]?.scrollIntoView({block:'nearest'});
    document.getElementById('status').textContent = selected === -1
      ? 'ONの項目がありません。→で項目をONにしてください。'
      : 'ONの項目をEnterで確定します。';
  }
  function handleKey(event) {
    if (event.key === 'ArrowDown') {focused = (focused+1)%rows.length; event.preventDefault();render();}
    else if (event.key === 'ArrowUp') {focused = (focused-1+rows.length)%rows.length;event.preventDefault();render();}
    else if (event.key === 'ArrowRight') {selected = focused;event.preventDefault();render();}
    else if (event.key === 'ArrowLeft') {if (selected===focused) selected=-1;event.preventDefault();render();}
    else if (event.key === 'Enter') { event.preventDefault();if(selected>=0)vscode.postMessage({type:'confirm',index:selected}); }
    else if (event.key === 'Escape') {event.preventDefault();vscode.postMessage({type:'cancel'});}
  }
  document.addEventListener('keydown',handleKey,true);
  rows.forEach((row,i)=>row.addEventListener('click',()=>{focused=i;selected=i;render();}));
  document.body.focus();
  render();
</script></body></html>`;

  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel('codingToolsConfirm', title || 'Coding Tools：操作の確認',
      vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: false });
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
      panel.dispose();
    }
    panel.onDidDispose(() => finish(null));
    panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'cancel') return finish(null);
      if (message?.type === 'confirm' && Number.isInteger(message.index) && message.index >= 0 && message.index < items.length) {
        finish(items[message.index]);
      }
    });
    panel.webview.html = html;
  });
}

module.exports = {showConfirmation, escapeHtml};
