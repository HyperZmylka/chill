// Chill — wygląd i dostępność.
// Wspólny moduł dla interfejsu i testów: presety, walidacja kolorów i opcji.
(function (root) {
  'use strict';

  const THEMES = Object.freeze(['system', 'black', 'white', 'gradient', 'discord']);
  const SHAPES = Object.freeze(['soft', 'rounded', 'square']);
  const BACKGROUNDS = Object.freeze(['default', 'aurora', 'sunset', 'ocean', 'forest', 'mono']);
  const MESSAGE_STYLES = Object.freeze(['bubbles', 'flat']);
  const FONT_SCALES = Object.freeze(['small', 'normal', 'large']);
  const DEFAULT_ACCENT = '#3ee0a3';
  const INK_LIGHT = '#ffffff';
  const INK_DARK = '#05271c';

  const PRESETS = Object.freeze({
    chill: Object.freeze({
      theme: 'system',
      accent: '#3ee0a3',
      shape: 'soft',
      background: 'default',
      messageStyle: 'bubbles',
      fontScale: 'normal',
      reduceMotion: false,
      highContrast: false,
    }),
    discord: Object.freeze({
      theme: 'discord',
      accent: '#5865f2',
      shape: 'square',
      background: 'default',
      messageStyle: 'flat',
      fontScale: 'normal',
      reduceMotion: false,
      highContrast: false,
    }),
    minimal: Object.freeze({
      theme: 'black',
      accent: '#b8c0bb',
      shape: 'square',
      background: 'mono',
      messageStyle: 'flat',
      fontScale: 'normal',
      reduceMotion: true,
      highContrast: false,
    }),
    aurora: Object.freeze({
      theme: 'gradient',
      accent: '#b8a1ff',
      shape: 'rounded',
      background: 'aurora',
      messageStyle: 'bubbles',
      fontScale: 'normal',
      reduceMotion: false,
      highContrast: false,
    }),
    sunset: Object.freeze({
      theme: 'gradient',
      accent: '#ffa46b',
      shape: 'rounded',
      background: 'sunset',
      messageStyle: 'bubbles',
      fontScale: 'normal',
      reduceMotion: false,
      highContrast: false,
    }),
    ocean: Object.freeze({
      theme: 'gradient',
      accent: '#7cc8ff',
      shape: 'soft',
      background: 'ocean',
      messageStyle: 'bubbles',
      fontScale: 'normal',
      reduceMotion: false,
      highContrast: false,
    }),
  });

  const PRESET_IDS = Object.freeze(Object.keys(PRESETS));

  function oneOf(values, value, fallback) {
    return values.includes(value) ? value : fallback;
  }

  function normalizeColor(value, fallback = DEFAULT_ACCENT) {
    const text = String(value ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    const short = text.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (short) {
      return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    }
    return fallback;
  }

  function colorChannels(color) {
    const hex = normalizeColor(color);
    return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  }

  function relativeLuminance(color) {
    const channels = colorChannels(color).map((value) => (
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(a, b) {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function readableInk(color) {
    const value = normalizeColor(color);
    return contrastRatio(value, INK_LIGHT) >= contrastRatio(value, INK_DARK) ? INK_LIGHT : INK_DARK;
  }

  function normalizeAppearance(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      theme: oneOf(THEMES, source.theme, 'system'),
      accent: normalizeColor(source.accent),
      shape: oneOf(SHAPES, source.shape, 'soft'),
      background: oneOf(BACKGROUNDS, source.background, 'default'),
      messageStyle: oneOf(MESSAGE_STYLES, source.messageStyle, 'bubbles'),
      fontScale: oneOf(FONT_SCALES, source.fontScale, 'normal'),
      reduceMotion: source.reduceMotion === true,
      highContrast: source.highContrast === true,
    };
  }

  function preset(id) {
    const entry = PRESETS[id];
    return entry ? { ...entry } : null;
  }

  function matchPreset(input = {}) {
    const values = normalizeAppearance(input);
    for (const id of PRESET_IDS) {
      const candidate = PRESETS[id];
      const same = Object.keys(candidate).every((key) => candidate[key] === values[key]);
      if (same) return id;
    }
    return 'custom';
  }

  const api = Object.freeze({
    THEMES,
    SHAPES,
    BACKGROUNDS,
    MESSAGE_STYLES,
    FONT_SCALES,
    DEFAULT_ACCENT,
    PRESETS,
    PRESET_IDS,
    normalizeColor,
    readableInk,
    contrastRatio,
    normalizeAppearance,
    preset,
    matchPreset,
  });

  root.CHILL_APPEARANCE = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
