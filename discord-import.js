'use strict';

// Funkcje pomocnicze do importu serwerów Discord.
// Ten plik nie wykonuje żadnych żądań sieciowych — dzięki temu można go testować osobno.

const TEMPLATE_CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;
const TEMPLATE_HOSTS = new Set([
  'discord.new',
  'www.discord.new',
  'discord.com',
  'www.discord.com',
  'discordapp.com',
  'www.discordapp.com',
]);
const CHANNEL_TYPE_MAP = new Map([
  [0, 'text'], // GUILD_TEXT
  [2, 'voice'], // GUILD_VOICE
  [5, 'text'], // GUILD_ANNOUNCEMENT
  [13, 'voice'], // GUILD_STAGE_VOICE
  [15, 'text'], // GUILD_FORUM
  [16, 'text'], // GUILD_MEDIA
]);
const MAX_CHANNEL_NAME = 32;
const MAX_IMPORTED_CHANNELS = 100;

function parseTemplateCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (TEMPLATE_CODE_RE.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:') return '';
  if (!TEMPLATE_HOSTS.has(url.hostname.toLowerCase())) return '';

  const path = url.pathname.replace(/\/+$/, '');
  const match = path.match(/^\/(?:template\/)?([A-Za-z0-9_-]{4,64})$/);
  return match ? match[1] : '';
}

function guildIconUrl(guildId, iconHash) {
  const id = String(guildId ?? '');
  const hash = String(iconHash ?? '');
  if (!/^\d{16,21}$/.test(id)) return '';
  if (!/^(?:a_)?[a-f0-9]{32}$/i.test(hash)) return '';
  return `https://cdn.discordapp.com/icons/${encodeURIComponent(id)}/${hash}.png?size=128`;
}

function filterOwnedGuilds(guilds) {
  if (!Array.isArray(guilds)) return [];
  const seen = new Set();
  const out = [];
  for (const guild of guilds) {
    if (!guild || guild.owner !== true) continue;
    const id = String(guild.id ?? '');
    if (!/^\d{16,21}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(guild.name || 'Serwer Discord').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Serwer Discord',
      iconUrl: guildIconUrl(id, guild.icon),
      memberCount: Math.max(0, Number(guild.approximate_member_count) || 0),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

function normalizeChannelName(value) {
  const name = String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_.-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, MAX_CHANNEL_NAME);
  return name || 'kanał';
}

function fitChannelName(base, suffix) {
  const tail = String(suffix ?? '');
  const room = Math.max(1, MAX_CHANNEL_NAME - tail.length);
  return `${base.slice(0, room)}${tail}`;
}

function mapTemplateChannels(template, limit = MAX_IMPORTED_CHANNELS) {
  const raw = template?.serialized_source_guild?.channels;
  if (!Array.isArray(raw)) {
    return { channels: [], total: 0, truncated: false, skipped: 0 };
  }

  const max = Math.max(1, Math.min(MAX_IMPORTED_CHANNELS, Number(limit) || MAX_IMPORTED_CHANNELS));
  const categories = new Map();
  for (const channel of raw) {
    if (channel && Number(channel.type) === 4) categories.set(String(channel.id), channel);
  }

  const sorted = [...raw].sort((a, b) => (Number(a?.position) || 0) - (Number(b?.position) || 0));
  const children = new Map();
  for (const channel of sorted) {
    if (!channel || Number(channel.type) === 4) continue;
    const parent = channel.parent_id == null ? '' : String(channel.parent_id);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(channel);
  }

  const emitted = [];
  const seen = new Set();
  const push = (channel) => {
    if (!channel || seen.has(String(channel.id))) return;
    const type = CHANNEL_TYPE_MAP.get(Number(channel.type));
    if (!type) return;
    seen.add(String(channel.id));
    emitted.push({ name: normalizeChannelName(channel.name), type });
  };

  const topLevel = sorted.filter((channel) => {
    if (!channel) return false;
    if (Number(channel.type) === 4) return true;
    return channel.parent_id == null || !categories.has(String(channel.parent_id));
  });

  for (const channel of topLevel) {
    if (Number(channel.type) === 4) {
      for (const child of children.get(String(channel.id)) || []) push(child);
    } else {
      push(channel);
    }
  }

  // Kanały z nieistniejącą kategorią nadrzędną (np. uszkodzony szablon).
  for (const channel of sorted) {
    if (channel && Number(channel.type) !== 4) push(channel);
  }

  const total = emitted.length;
  const channels = emitted.slice(0, max);
  const used = new Set();
  for (const channel of channels) {
    let name = channel.name;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      name = fitChannelName(channel.name, `-${suffix++}`);
    }
    used.add(name.toLowerCase());
    channel.name = name;
  }

  return {
    channels,
    total,
    truncated: total > channels.length,
    skipped: Math.max(0, raw.length - total),
  };
}

function normalizeServerName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return name.length >= 2 ? name : 'Serwer Discord';
}

function buildAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
  const params = [
    ['response_type', 'code'],
    ['client_id', clientId],
    ['scope', 'identify guilds'],
    ['state', state],
    ['redirect_uri', redirectUri],
    ['code_challenge', codeChallenge],
    ['code_challenge_method', 'S256'],
    ['prompt', 'consent'],
  ];
  return `https://discord.com/oauth2/authorize?${params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')}`;
}

module.exports = {
  MAX_IMPORTED_CHANNELS,
  buildAuthorizationUrl,
  filterOwnedGuilds,
  guildIconUrl,
  mapTemplateChannels,
  normalizeChannelName,
  normalizeServerName,
  parseTemplateCode,
};
