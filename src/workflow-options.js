'use strict';

const COPY_FIELDS = ['source', 'neighbors', 'relations', 'sectioning', 'roles', 'overview'];
const PASTE_FIELDS = ['neighbors', 'siblings', 'parent', 'section', 'naming', 'overview'];
const DEFAULT_COMMENT_TEMPLATE = '/* {name}\n--------------------------------*/';
function workflowOptions(vscode, uri) {
  const config = vscode.workspace.getConfiguration?.('codingTools', uri);
  const read = (key, fallback) => config?.get(key, fallback) ?? fallback;
  const list = (key, values) => {
    const found = read(key, values);
    return Array.isArray(found) ? found.filter(x => values.includes(x)) : [...values];
  };
  const seconds = read('help.durationSeconds', 2);
  const comments = read('sectionComments', {});
  return {
    helpEnabled: read('help.enabled', true) !== false,
    helpSeconds: typeof seconds === 'number' && Number.isFinite(seconds) ? Math.min(30, Math.max(0.5, seconds)) : 2,
    copyFields: list('copyInformation', COPY_FIELDS),
    pasteFields: list('pasteInformation', PASTE_FIELDS),
    addComments: read('addSectionComments', true) !== false,
    requireCommentGroup: read('requireCommentGroup', true) !== false,
    automaticPaste: read('automaticPaste', true) !== false,
    comments: comments && typeof comments === 'object' && !Array.isArray(comments) ? comments : {},
    commentTemplate: typeof read('sectionCommentTemplate', DEFAULT_COMMENT_TEMPLATE) === 'string'
      ? read('sectionCommentTemplate', DEFAULT_COMMENT_TEMPLATE) : DEFAULT_COMMENT_TEMPLATE,
    provisionalTemplate: typeof read('provisionalCommentTemplate', '') === 'string'
      ? read('provisionalCommentTemplate', '') : '',
  };
}

function selectedCopyInformation(context, fields) {
  if (!context) return null;
  const keep = new Set(fields);
  const result = { schemaVersion: context.schemaVersion, name: context.name };
  if (context.kind === 'id') result.kind = 'id';
  if (keep.has('source')) for (const key of ['source', 'languageId', 'documentVersion', 'token']) {
    if (Object.hasOwn(context, key)) result[key] = context[key];
  }
  if (keep.has('neighbors')) { result.before = context.before; result.after = context.after; }
  const s = context.structure;
  if (s && ['relations', 'sectioning', 'roles', 'overview'].some(key => keep.has(key))) {
    const structure = result.structure = { status: s.status, basis: s.basis, issues: s.issues };
    if (keep.has('relations')) for (const key of ['element', 'parent', 'ancestors', 'children', 'childCount', 'childrenTruncated', 'siblings']) {
      if (Object.hasOwn(s, key)) structure[key] = s[key];
    }
    if (keep.has('sectioning') && s.sectioning) structure.sectioning = s.sectioning;
    if (keep.has('overview') && s.overview) structure.overview = s.overview;
    if (keep.has('roles') && s.placementRole) {
      structure.placementRole = { kind: s.placementRole.kind, basis: s.placementRole.basis, cssLayout: null };
      if (keep.has('sectioning')) {
        structure.placementRole.section = s.placementRole.section;
        structure.placementRole.region = s.placementRole.region;
      }
      if (keep.has('relations')) {
        structure.placementRole.siblingIndex = s.placementRole.siblingIndex;
        structure.placementRole.siblingCount = s.placementRole.siblingCount;
      }
    }
  }
  // Copy settings also apply when consuming old saved slots: disabled metadata
  // cannot remain an accidental source of placement decisions.
  return JSON.parse(JSON.stringify(result));
}

module.exports = { COPY_FIELDS, PASTE_FIELDS, DEFAULT_COMMENT_TEMPLATE, workflowOptions, selectedCopyInformation };
