'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const renderer = read('renderer.js');
const index = read('index.html');
const css = read('style.css');
const model = read(path.join('rust', 'chill-server', 'src', 'model.rs'));
const ws = read(path.join('rust', 'chill-server', 'src', 'ws.rs'));
const workflow = read(path.join('.github', 'workflows', 'release-build.yml'));

test('własna wiadomość ma pasek akcji z szybkimi reakcjami', () => {
  assert.match(renderer, /const QUICK_REACTIONS = \['❤️', '✅', '🔥'\];/);
  assert.match(renderer, /function buildMessageActions\(message\)/);
  assert.match(renderer, /if \(own\) main\.appendChild\(buildMessageActions\(message\)\);/);
  assert.match(renderer, /actions\.className = 'msg-actions';/);
  assert.match(renderer, /function openReactionPicker\(anchor, onPick\)/);
  assert.match(renderer, /function openMessageMenu\(anchor, message\)/);
});

test('pasek akcji zawiera reakcje, emoji, edycję, odpowiedź i menu', () => {
  assert.match(renderer, /for \(const emoji of QUICK_REACTIONS\)/);
  assert.match(renderer, /t\('Edytuj wiadomość'\), MSG_ICON_EDIT/);
  assert.match(renderer, /t\('Odpowiedz'\), MSG_ICON_REPLY/);
  assert.match(renderer, /t\('Więcej akcji'\), MSG_ICON_MORE/);
  assert.match(renderer, /function beginMessageEdit\(message\)/);
  assert.match(renderer, /function startReply\(message\)/);
  assert.match(renderer, /function deleteMessage\(message\)/);
  assert.match(renderer, /Potwierdź usunięcie/);
});

test('odpowiedź i edycja są zapisywane przez serwer', () => {
  for (const type of [
    'server:reaction',
    'server:edit',
    'server:delete',
    'server:dm:reaction',
    'server:dm:edit',
    'server:dm:delete',
    'dm:reaction',
    'dm:edit',
    'dm:delete',
  ]) {
    assert.match(ws, new RegExp(`"${type}"`), type);
  }
  assert.match(ws, /fn handle_server_reaction\(/);
  assert.match(ws, /fn handle_server_edit\(/);
  assert.match(ws, /fn handle_server_delete\(/);
  assert.match(ws, /fn handle_server_dm_reaction\(/);
  assert.match(ws, /fn handle_server_dm_edit\(/);
  assert.match(ws, /fn handle_server_dm_delete\(/);
  assert.match(ws, /fn handle_dm_reaction\(/);
  assert.match(ws, /fn handle_dm_edit\(/);
  assert.match(ws, /fn handle_dm_delete\(/);
  assert.match(ws, /replyToId/);
  assert.match(ws, /replyToClientId/);
  assert.match(ws, /edited_at = Some\(now_ms\(\)\)/);
  assert.match(model, /rename_all = "camelCase"/);
});

test('model wiadomości przechowuje reakcje, edycję i odpowiedź', () => {
  assert.match(model, /pub reactions: BTreeMap<String, Vec<String>>/);
  assert.match(model, /pub edited_at: Option<u64>/);
  assert.match(model, /pub reply_to: Option<ReplyPreview>/);
  assert.match(model, /pub struct ReplyPreview/);
  assert.match(model, /pub client_id: Option<String>/);
  assert.match(ws, /fn toggle_reaction\(/);
  assert.match(ws, /fn message_index\(/);
  assert.match(ws, /fn sanitize_reaction_emoji\(/);
  assert.match(ws, /reactions_toggle_per_member_and_clean_up/);
  assert.match(ws, /reply_preview_points_at_original_message/);
});

test('interfejs odpowiedzi jest widoczny nad polem wiadomości', () => {
  assert.match(index, /id="composerReply"/);
  assert.match(index, /id="composerReplyAuthor"/);
  assert.match(index, /id="composerReplyText"/);
  assert.match(index, /id="composerReplyCancel"/);
  assert.match(renderer, /function setPendingReply\(message\)/);
  assert.match(renderer, /function clearPendingReply\(/);
  assert.match(renderer, /payload\.replyToId = reply\.id/);
  assert.match(renderer, /payload\.replyToClientId = reply\.clientId/);
  assert.match(renderer, /clearPendingReply\(\{ focus: false \}\)/);
});

test('styl paska akcji, reakcji i menu jest spójny z motywem', () => {
  assert.match(css, /\.msg-actions \{/);
  assert.match(css, /\.msg\.own:hover \.msg-actions/);
  assert.match(css, /\.msg\.own:focus-within \.msg-actions/);
  assert.match(css, /\.reaction-pill\.mine \{/);
  assert.match(css, /\.msg-reply-ref \{/);
  assert.match(css, /\.msg-edit textarea \{/);
  assert.match(css, /\.reaction-pop \{/);
  assert.match(css, /\.msg-menu \{/);
  assert.match(css, /\.composer-reply \{/);
  assert.match(css, /@media \(hover: none\)/);
});

test('akcje wiadomości mają polskie i angielskie teksty', () => {
  assert.match(renderer, /'Odpowiedz': 'Reply'/);
  assert.match(renderer, /'Edytuj wiadomość': 'Edit message'/);
  assert.match(renderer, /'Więcej akcji': 'More actions'/);
  assert.match(renderer, /'Zareaguj': 'React'/);
  assert.match(renderer, /'Usuń wiadomość': 'Delete message'/);
  assert.match(renderer, /'Skopiuj tekst': 'Copy text'/);
  assert.match(renderer, /'edytowano': 'edited'/);
  assert.match(renderer, /'Anuluj odpowiedź': 'Cancel reply'/);
});

test('test akcji wiadomości jest uruchamiany w wydaniu', () => {
  assert.match(workflow, /test\/message-actions\.test\.js/);
});
