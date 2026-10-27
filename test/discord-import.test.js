'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAuthorizationUrl,
  filterOwnedGuilds,
  guildIconUrl,
  mapTemplateChannels,
  normalizeChannelName,
  normalizeServerName,
  parseTemplateCode,
} = require('../discord-import');

test('parseTemplateCode akceptuje linki i sam kod', () => {
  assert.equal(parseTemplateCode('https://discord.new/hgM48av5Q69A'), 'hgM48av5Q69A');
  assert.equal(parseTemplateCode('https://discord.com/template/hgM48av5Q69A'), 'hgM48av5Q69A');
  assert.equal(parseTemplateCode('https://discordapp.com/template/hgM48av5Q69A/'), 'hgM48av5Q69A');
  assert.equal(parseTemplateCode('  hgM48av5Q69A  '), 'hgM48av5Q69A');
});

test('parseTemplateCode odrzuca zaproszenia i obce adresy', () => {
  assert.equal(parseTemplateCode('https://discord.gg/abcdef'), '');
  assert.equal(parseTemplateCode('https://example.com/template/abcdef'), '');
  assert.equal(parseTemplateCode('http://discord.new/abcdef'), '');
  assert.equal(parseTemplateCode(''), '');
});

test('filterOwnedGuilds zostawia tylko serwery z owner: true', () => {
  const guilds = [
    { id: '111111111111111111', name: 'Moje', owner: true, icon: 'a'.repeat(32) },
    { id: '222222222222222222', name: 'Cudze', owner: false },
    { id: '333333333333333333', name: 'Bez flagi' },
    { id: '111111111111111111', name: 'Duplikat', owner: true },
    { id: 'bad', name: 'Zły', owner: true },
  ];
  const owned = filterOwnedGuilds(guilds);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].id, '111111111111111111');
  assert.equal(owned[0].name, 'Moje');
  assert.match(owned[0].iconUrl, /^https:\/\/cdn\.discordapp\.com\/icons\//);
});

test('guildIconUrl waliduje hash i id', () => {
  assert.equal(guildIconUrl('111111111111111111', 'a'.repeat(32)), `https://cdn.discordapp.com/icons/111111111111111111/${'a'.repeat(32)}.png?size=128`);
  assert.equal(guildIconUrl('111111111111111111', 'nieprawidlowy'), '');
  assert.equal(guildIconUrl('x', 'a'.repeat(32)), '');
});

test('normalizeChannelName czyści nazwę i pilnuje 32 znaków', () => {
  assert.equal(normalizeChannelName('  Ogólny  '), 'Ogólny');
  assert.equal(normalizeChannelName('Stream Room'), 'Stream-Room');
  assert.equal(normalizeChannelName('zażółć gęślą jaźń'), 'zażółć-gęślą-jaźń');
  assert.equal(normalizeChannelName('🎮 gry'), 'gry');
  assert.equal(normalizeChannelName('...'), 'kanał');
  assert.equal(normalizeChannelName('x'.repeat(80)).length, 32);
});

test('normalizeServerName pilnuje nazwy 2–40 znaków', () => {
  assert.equal(normalizeServerName('  Moja Ekipa  '), 'Moja Ekipa');
  assert.equal(normalizeServerName('x'), 'Serwer Discord');
  assert.equal(normalizeServerName('x'.repeat(80)).length, 40);
});

test('mapTemplateChannels zachowuje kolejność kategorii i mapuje typy', () => {
  const template = {
    serialized_source_guild: {
      channels: [
        { id: 1, type: 4, name: 'Tekstowe', position: 1, parent_id: null },
        { id: 2, type: 0, name: 'general', position: 1, parent_id: 1 },
        { id: 3, type: 5, name: 'ogloszenia', position: 2, parent_id: 1 },
        { id: 4, type: 15, name: 'forum', position: 3, parent_id: 1 },
        { id: 5, type: 4, name: 'Głosowe', position: 2, parent_id: null },
        { id: 6, type: 2, name: 'Lounge', position: 1, parent_id: 5 },
        { id: 7, type: 13, name: 'Stage', position: 2, parent_id: 5 },
        { id: 8, type: 0, name: 'bez-kategorii', position: 3, parent_id: null },
        { id: 9, type: 14, name: 'katalog', position: 4, parent_id: null },
      ],
    },
  };
  const result = mapTemplateChannels(template);
  assert.deepEqual(result.channels.map((channel) => channel.name), [
    'general',
    'ogloszenia',
    'forum',
    'Lounge',
    'Stage',
    'bez-kategorii',
  ]);
  assert.deepEqual(result.channels.map((channel) => channel.type), [
    'text',
    'text',
    'text',
    'voice',
    'voice',
    'text',
  ]);
  assert.equal(result.total, 6);
  assert.equal(result.skipped, 3);
  assert.equal(result.truncated, false);
});

test('mapTemplateChannels deduplikuje nazwy i respektuje limit', () => {
  const channels = [
    { id: 1, type: 0, name: 'ogólny', position: 1, parent_id: null },
    { id: 2, type: 0, name: 'Ogólny', position: 2, parent_id: null },
    { id: 3, type: 2, name: 'ogólny', position: 3, parent_id: null },
    { id: 4, type: 0, name: 'trzeci', position: 4, parent_id: null },
  ];
  const result = mapTemplateChannels({ serialized_source_guild: { channels } }, 2);
  assert.equal(result.channels.length, 2);
  assert.deepEqual(result.channels.map((channel) => channel.name), ['ogólny', 'Ogólny-2']);
  assert.equal(result.total, 4);
  assert.equal(result.truncated, true);
});

test('buildAuthorizationUrl zawiera PKCE i odpowiednie scope', () => {
  const url = new URL(buildAuthorizationUrl({
    clientId: '123456789012345678',
    redirectUri: 'http://localhost:47831/callback',
    state: 'state-123',
    codeChallenge: 'challenge-123',
  }));
  assert.equal(url.origin, 'https://discord.com');
  assert.equal(url.pathname, '/oauth2/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), '123456789012345678');
  assert.equal(url.searchParams.get('scope'), 'identify guilds');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:47831/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state-123');
});
