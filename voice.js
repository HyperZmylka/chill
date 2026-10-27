// Chill — wiadomości głosowe.
// Wspólny moduł dla procesu głównego i interfejsu: tokeny, czasy i typy nagrań.
(function (root) {
  'use strict';

  const scheme = 'chill-voice';
  const MAX_SECONDS = 120;
  const MAX_BYTES = 4 * 1024 * 1024;
  const MIN_SECONDS = 0.5;
  const TOKEN_RE = /^chill-voice:\/\/([a-f0-9]{32})(?:\?d=(\d{1,3}(?:\.\d{1,2})?))?$/;
  const MIME_EXTENSIONS = Object.freeze({
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
  });
  const SEARCH_TEXT = [
    'głosówka', 'glosowka', 'głosowa', 'glosowa',
    'wiadomość głosowa', 'wiadomosc glosowa', 'nagranie', 'audio',
    'voice message', 'voice note', 'voice', 'message', 'recording',
  ].join(' ');

  function isValidId(value) {
    return /^[a-f0-9]{32}$/.test(String(value || ''));
  }

  function normalizeMime(value) {
    const base = String(value || '').split(';', 1)[0].trim().toLowerCase();
    return MIME_EXTENSIONS[base] ? base : '';
  }

  function extensionForMime(value) {
    return MIME_EXTENSIONS[normalizeMime(value)] || '';
  }

  function clampSeconds(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(MAX_SECONDS, Math.round(number * 10) / 10);
  }

  function token(id, seconds) {
    if (!isValidId(id)) return '';
    const duration = clampSeconds(seconds);
    return `${scheme}://${id}${duration ? `?d=${duration}` : ''}`;
  }

  function parse(text) {
    const match = String(text ?? '').trim().match(TOKEN_RE);
    if (!match) return null;
    return { id: match[1], seconds: clampSeconds(match[2] || 0) };
  }

  function formatDuration(value) {
    const total = Math.max(0, Math.ceil(Number(value) || 0));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function searchable(value) {
    const parsed = typeof value === 'string' ? parse(value) : value;
    return parsed ? SEARCH_TEXT : '';
  }

  const api = Object.freeze({
    scheme,
    MAX_SECONDS,
    MAX_BYTES,
    MIN_SECONDS,
    MIME_EXTENSIONS,
    isValidId,
    normalizeMime,
    extensionForMime,
    clampSeconds,
    token,
    parse,
    formatDuration,
    searchText: SEARCH_TEXT,
    searchable,
  });

  root.CHILL_VOICE = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
