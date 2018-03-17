'use strict';

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const mime = require('mime');
const config = require('config');

module.exports = http.createServer((req, res) => {

  let pathname = decodeURI(url.parse(req.url).pathname);
  let filename = pathname.slice(1);

  if (filename.includes('/') || filename.includes('..')) {
    res.statusCode = 400;
    res.end('Nested paths are not allowed');
    return;
  }

  if (req.method === 'GET') {
    if (pathname === '/') {
      sendFile(config.get('publicRoot') + '/index.html', res);
    } else {
      let filepath = path.join(config.get('filesRoot'), filename);
      sendFile(filepath, res);
    }
  }

  if (req.method === 'POST') {
    if (!filename) {
      res.statusCode = 404;
      res.end('File not found');
    }

    receiveFile(path.join(config.get('filesRoot'), filename), req, res);
  }

});


function receiveFile(filepath, req, res) {

  let size = 0;

  let writeStream = new fs.WriteStream(filepath, {flags: 'wx'});

  req
    .on('data', chunk => {
      size += chunk.length;

      if (size > config.get('limitFileSize')) {
        res.statusCode = 413;
        res.setHeader('Connection', 'close');

        writeStream.destroy();
        fs.unlink(filepath, err => {
          res.end('File is incorrect or too large');
        });

      }
    })
    .on('close', () => {
      writeStream.destroy();
      fs.unlink(filepath, err => {
      });
    })
    .pipe(writeStream);

  writeStream
    .on('error', err => {
      if (err.code === 'EEXIST') {
        res.statusCode = 409;
        res.end('File exists');
      } else {
        console.error(err);
        if (!res.headersSent) {
          res.writeHead(500, {'Connection': 'close'});
          res.end('Internal error');
        } else {
          res.end();
        }
        fs.unlink(filepath, err => { // eslint-disable-line
          /* ignore error */
        });
      }
      res.destroy();
    })
    .on('close', () => {
      res.end('OK');
    });
}


function sendFile(filepath, res) {
  let fileStream = fs.createReadStream(filepath);
  fileStream.pipe(res);

  fileStream
    .on('error', err => {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('Not found');
      } else {
        console.error(err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Internal error');
        } else {
          res.end();
        }

      }
    })
    .on('open', () => {
      res.setHeader('Content-Type', mime.lookup(filepath));
    });

  res
    .on('close', () => {
      fileStream.destroy();
    });

}
