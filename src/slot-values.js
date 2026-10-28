'use strict';
const SELECTOR_FORMAT = 'selector-v1';
const TEXT_FORMAT = 'text-v1';
function storedIdentifier(name, kind) { return (kind === 'id' ? '#' : '.') + name; }
function selectorKind(value, kind, format) {
  if (format === SELECTOR_FORMAT && typeof value === 'string' && /^[.#]\S+$/.test(value)) {
    if (value.startsWith('.')) return 'class';
    if (value.startsWith('#')) return 'id';
  }
  return ['class', 'id'].includes(kind) ? kind : null;
}
function plainSlotValue(value, kind, format) {
  if (typeof value !== 'string') return undefined;
  kind = selectorKind(value, kind, format);
  if (format !== SELECTOR_FORMAT || !kind) return value;
  const marker = kind === 'id' ? '#' : '.';
  return value.startsWith(marker) ? value.slice(1) : value;
}
function encodeSlot(text, kind, version) {
  return {format: kind ? SELECTOR_FORMAT : TEXT_FORMAT, text, kind: kind || null, version};
}
function decodeSlot(value, legacyKind, legacyFormat, legacyVersion = 0) {
  const record = value && typeof value === 'object' &&
    [SELECTOR_FORMAT, TEXT_FORMAT].includes(value.format) && typeof value.text === 'string';
  const stored = record ? value.text : typeof value === 'string' ? value : undefined;
  const format = record ? value.format : legacyFormat;
  const kind = record && format === TEXT_FORMAT ? null : selectorKind(stored, record ? value.kind : legacyKind, format);
  const version = record ? value.version : legacyVersion;
  return {stored, text: plainSlotValue(stored, kind, format), kind, format,
    version: Number.isSafeInteger(version) && version >= 0 ? version : 0};
}
module.exports = {SELECTOR_FORMAT, TEXT_FORMAT, storedIdentifier, plainSlotValue, selectorKind, encodeSlot, decodeSlot};
