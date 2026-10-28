'use strict';
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function until(check, message) {
  const deadline = Date.now() + 12000;
  do {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 60));
  } while (Date.now() < deadline);
  throw new Error(message);
}
exports.run = async () => {
  const report = {version: vscode.version, checks: []};
  const output = process.env.CODING_TOOLS_TEST_REPORT || path.join(os.tmpdir(), 'coding-tools-search-input-result.json');
  try {
    const root = path.resolve(__dirname, 'fixtures', 'search-input');
    assert.equal(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, root, 'Launch against test/fixtures/search-input in an isolated profile');
    const api = await vscode.extensions.getExtension('elliotveyne.coding-tools').activate();
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'index.html')));
    const original = doc.getText();
    const clipboard = await vscode.env.clipboard.readText();
    const names = ['ct_probe_a', 'ct_probe_b'];
    for (const [i, name] of names.entries()) {
      const editor = await vscode.window.showTextDocument(doc, {preview: false});
      const start = original.indexOf(name);
      editor.selection = new vscode.Selection(doc.positionAt(start), doc.positionAt(start + name.length));
      await until(() => vscode.window.activeTextEditor?.document === doc && vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection) === name, 'Source selection not active');
      const copied = await vscode.commands.executeCommand('codingTools.copy' + (i + 1));
      assert.equal(copied?.text, '.' + name, 'copy command result');
      assert.equal(await vscode.env.clipboard.readText(), clipboard);
      report.slots = report.slots || []; report.slots.push(api?.slotForTest(i + 1));
      assert.equal(api?.slotForTest(i + 1)?.stored, '.' + name, 'new prefixed storage');
      assert.equal(api?.slotForTest(i + 1)?.text, name, 'bare routing value');
    }
    for (const [i, name] of names.entries()) {
      const editor = await vscode.window.showTextDocument(doc, {preview: false});
      await vscode.commands.executeCommand('codingTools.paste' + (i + 1), {target: 'editorSearch'});
      await vscode.commands.executeCommand('editor.action.nextMatchFindAction');
      await until(() => { const active = vscode.window.activeTextEditor; return active && active.document.getText(active.selection) === name; }, 'Editor find did not receive ' + name + ' / selection: ' + vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection));
      assert.equal(doc.getText(), original);
      assert.equal(await vscode.env.clipboard.readText(), clipboard);
      report.checks.push('Editor find / slot ' + (i + 1));
      await vscode.commands.executeCommand('workbench.action.findInFiles', {query: 'ct_probe_no_results', triggerSearch: true});
      await vscode.commands.executeCommand('codingTools.paste' + (i + 1), {target: 'workspaceSearch'});
      const other = names[1 - i];
      await until(async () => {
        const results = String(await vscode.commands.executeCommand('search.action.getSearchResults'));
        return results.includes('.' + name + ' {}') && !results.includes('.' + other + ' {}');
      }, 'Workspace search did not receive ' + name);
      assert.equal(doc.getText(), original);
      assert.equal(await vscode.env.clipboard.readText(), clipboard);
      report.checks.push('Workspace search / slot ' + (i + 1));
    }
    // Verify the ID marker is stored, kept for CSS, and removed for HTML.
    const id = 'ct_probe_id';
    const source = await vscode.window.showTextDocument(doc, {preview: false});
    const at = original.indexOf(id);
    source.selection = new vscode.Selection(doc.positionAt(at), doc.positionAt(at + id.length));
    await until(() => vscode.window.activeTextEditor?.document === doc &&
      vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection) === id, 'ID source not active');
    const copiedId = await vscode.commands.executeCommand('codingTools.copy2');
    assert.equal(copiedId.text, '#' + id);
    assert.equal(api.slotForTest(2).stored, '#' + id);
    for (const [language, text, position, expected] of [
      ['css', 'article ', 8, 'article #' + id],
      ['html', '<div id=""></div>', 9, '<div id="' + id + '"></div>']
    ]) {
      const target = await vscode.workspace.openTextDocument({language, content: text});
      const editor = await vscode.window.showTextDocument(target, {preview: false});
      editor.selection = new vscode.Selection(target.positionAt(position), target.positionAt(position));
      await until(() => vscode.window.activeTextEditor?.document === target, 'Paste target not active');
      await vscode.commands.executeCommand('codingTools.paste2');
      assert.equal(target.getText(), expected);
      assert.equal(await vscode.env.clipboard.readText(), clipboard);
      report.checks.push('ID marker / ' + language);
    }
    assert.equal(doc.getText(), original);
    report.passed = true;
    await fs.writeFile(output, JSON.stringify(report, null, 2));
  } catch (error) {
    report.passed = false; report.error = String(error); report.stack = error.stack;
    await fs.writeFile(output, JSON.stringify(report, null, 2));
    throw error;
  }
};
