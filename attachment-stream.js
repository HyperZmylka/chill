'use strict';

const fs = require('node:fs');
const { Transform, pipeline } = require('node:stream');

// Zapisuje ciało żądania na dysk, pilnując limitu po drodze.
// Dzięki temu duże pliki nie są buforowane w pamięci procesu.
function writeBodyToFile(req, limit, destination) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    let failure = null;
    let pipelineDone = false;
    let fileClosed = false;
    const cleanup = () => {
      try {
        fs.rmSync(destination, { force: true });
      } catch {
        fs.rm(destination, { force: true }, () => {});
      }
    };
    const finish = () => {
      if (settled || !pipelineDone || !fileClosed) return;
      settled = true;
      if (failure) {
        cleanup();
        reject(failure);
        return;
      }
      resolve(size);
    };
    const out = fs.createWriteStream(destination, { flags: 'wx' });
    out.on('close', () => {
      fileClosed = true;
      finish();
    });
    out.on('error', (error) => {
      failure = failure || error;
    });
    const meter = new Transform({
      transform(chunk, encoding, callback) {
        size += chunk.length;
        if (size > limit) {
          callback(Object.assign(new Error('too-large'), { code: 'too-large' }));
          return;
        }
        callback(null, chunk);
      },
    });
    req.on('aborted', () => {
      failure = failure || Object.assign(new Error('aborted'), { code: 'aborted' });
      req.destroy();
    });
    pipeline(req, meter, out, (error) => {
      if (error) failure = failure || error;
      pipelineDone = true;
      finish();
    });
  });
}

module.exports = { writeBodyToFile };
