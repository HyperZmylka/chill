'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { writeBodyToFile } = require('../attachment-stream.js');

async function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chill-upload-test-'));
  try {
    await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('zapis przyjmuje dokładny limit i zapisuje całe ciało', async () => {
  await withTempDir(async (dir) => {
    const destination = path.join(dir, 'dokladny.part');
    const req = new PassThrough();
    const result = writeBodyToFile(req, 1024, destination);
    req.end(Buffer.alloc(1024, 7));
    assert.equal(await result, 1024);
    const saved = fs.readFileSync(destination);
    assert.equal(saved.length, 1024);
    assert.equal(saved[0], 7);
    assert.equal(saved[1023], 7);
  });
});

test('zapis odrzuca ciało o jeden bajt większe i usuwa plik tymczasowy', async () => {
  await withTempDir(async (dir) => {
    const destination = path.join(dir, 'zaduzy.part');
    const req = new PassThrough();
    const result = writeBodyToFile(req, 1024, destination);
    req.write(Buffer.alloc(600));
    req.write(Buffer.alloc(425));
    req.end();
    await assert.rejects(result, (error) => error?.code === 'too-large');
    assert.equal(fs.existsSync(destination), false);
  });
});

test('zapis zwraca zero dla pustego ciała, a sprzątanie należy do trasy', async () => {
  await withTempDir(async (dir) => {
    const destination = path.join(dir, 'pusty.part');
    const req = new PassThrough();
    const result = writeBodyToFile(req, 1024, destination);
    req.end();
    assert.equal(await result, 0);
    assert.equal(fs.statSync(destination).size, 0);
  });
});

test('przerwane połączenie usuwa plik tymczasowy', async () => {
  await withTempDir(async (dir) => {
    const destination = path.join(dir, 'przerwany.part');
    const req = new PassThrough();
    const result = writeBodyToFile(req, 1024, destination);
    req.write(Buffer.alloc(512));
    req.emit('aborted');
    req.destroy();
    await assert.rejects(result);
    assert.equal(fs.existsSync(destination), false);
  });
});
