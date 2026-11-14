// Chill — załączniki w wiadomościach.
// Wspólny moduł dla procesu głównego i interfejsu: tokeny, nazwy i typy plików.
(function (root) {
  'use strict';

  const scheme = 'chill-file';
  const MAX_BYTES = 12 * 1024 * 1024;
  const MAX_NAME = 120;
  const TOKEN_RE = /^chill-file:\/\/([a-f0-9]{32})\?([^\s]*)$/;
  const MIME_EXTENSIONS = Object.freeze({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'weba',
    'audio/mp4': 'm4a',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'text/plain': 'txt',
  });
  const INLINE_IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const INLINE_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
  const INLINE_AUDIO = new Set(['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4']);

  function isValidId(value) {
    return /^[a-f0-9]{32}$/.test(String(value || ''));
  }

  function safeName(value) {
    const name = String(value || '')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NAME);
    return name || 'plik';
  }

  function normalizeMime(value) {
    const base = String(value || '').split(';', 1)[0].trim().toLowerCase();
    return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(base) ? base.slice(0, 100) : 'application/octet-stream';
  }

  function extensionForMime(mime, name = '') {
    const normalized = normalizeMime(mime);
    if (MIME_EXTENSIONS[normalized]) return MIME_EXTENSIONS[normalized];
    const match = /\.([a-z0-9]{1,8})$/i.exec(String(name || ''));
    return match ? match[1].toLowerCase() : 'bin';
  }

  function clampSize(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(MAX_BYTES, Math.round(number));
  }

  function token(id, name, mime, size) {
    if (!isValidId(id)) return '';
    const params = new URLSearchParams();
    params.set('n', safeName(name));
    params.set('m', normalizeMime(mime));
    params.set('s', String(clampSize(size)));
    return `${scheme}://${id}?${params.toString()}`;
  }

  function parse(text) {
    const value = String(text ?? '');
    const newline = value.indexOf('\n');
    const first = (newline >= 0 ? value.slice(0, newline) : value).trim();
    const match = first.match(TOKEN_RE);
    if (!match) return null;
    let params;
    try {
      params = new URLSearchParams(match[2]);
    } catch {
      return null;
    }
    return {
      id: match[1],
      name: safeName(params.get('n')),
      mime: normalizeMime(params.get('m')),
      size: clampSize(params.get('s')),
      caption: newline >= 0 ? value.slice(newline + 1).trim().slice(0, 2000) : '',
    };
  }

  function kind(mime) {
    const normalized = normalizeMime(mime);
    if (INLINE_IMAGE.has(normalized)) return 'image';
    if (INLINE_VIDEO.has(normalized)) return 'video';
    if (INLINE_AUDIO.has(normalized)) return 'audio';
    return 'file';
  }

  function inlineMime(mime) {
    return kind(mime) !== 'file';
  }

  function formatSize(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const api = Object.freeze({
    scheme,
    MAX_BYTES,
    MAX_NAME,
    isValidId,
    safeName,
    normalizeMime,
    extensionForMime,
    clampSize,
    token,
    parse,
    kind,
    inlineMime,
    formatSize,
  });

  root.CHILL_ATTACHMENTS = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
