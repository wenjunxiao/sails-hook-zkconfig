#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const urlParse = require('url').parse;
const qsParse = require('querystring').parse;
const FileAdapter = require('../lib/file').FileAdapter;

function getArg (name) {
  let pos = process.argv.indexOf('--' + name);
  if (pos > 0) return process.argv[pos + 1];
}

const base = getArg('base');
const adapter = new FileAdapter(base);

const routes = {
  'GET /api/getData': function (req, res) {
    adapter.getData(req.query.path, (err, data, info) => {
      if (err) {
        return res.end(JSON.stringify({
          error: {
            message: err.message || err.toString()
          }
        }));
      }
      return res.end(JSON.stringify({
        error: null,
        data: data.toString('utf-8'),
        info
      }));
    });
  },
  'POST /api/create': function (req, res) {
    let chunks = [];
    req.on('data', chunk => {
      chunks.push(chunk);
    });
    req.on('end', chunk => {
      if (chunk) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks).toString('utf8');
      let body = {};
      if (/x-www-form-urlencoded/.test(req.headers['content-type'])) {
        body = qsParse(data);
      } else {
        body = JSON.parse(data || '{}');
      }
      if (body.parent) {
        body.path = path.resolve(body.parent, body.path);
      }
      if (body.data || body.node === 'data') {
        if (!body.node) {
          body.path += '.json';
        }
        adapter.create(body.path, body.data || '', {
          ip: req.socket.remoteAddress
        }, ['true', true].includes(body.persistent), (err, path) => {
          if (err) {
            return res.end(JSON.stringify({
              error: { message: err.message },
              path,
            }));
          }
          if (body.redirect) {
            return res.writeHead(302, {
              location: body.redirect
            }).end();
          }
          return res.end(JSON.stringify({
            error: err && { message: err.message },
            path,
          }));
        });
      } else {
        fs.mkdir(path.resolve(base, '.' + body.path), err => {
          if (err) {
            return res.end(JSON.stringify({
              error: { message: err.message },
              path: body.path,
            }));
          }
          if (body.redirect) {
            return res.writeHead(302, {
              location: body.redirect
            }).end();
          }
          return res.end(JSON.stringify({
            error: err && { message: err.message },
            path: body.path,
          }));
        });
      }
    });
  },
  'GET /api/watch': function (req, res) {
    adapter.watch(req.query.path, (event) => {
      return res.end(JSON.stringify(event));
    });
  },
  'GET /api/delete': function (req, res) {
    fs.unlink(path.resolve(base, '.' + req.query.path), err => {
      if (err) {
        return res.end(JSON.stringify({
          error: { message: err.message },
        }));
      }
      return res.writeHead(302, {
        location: req.query.redirect
      }).end();
    });
  },
  'GET /favicon.ico': function (req, res) {
    return res.writeHead(200, {
      'Content-Type': 'image/x-icon'
    }).end();
  },
  'GET /': function (req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/html;charset=utf-8'
    });
    res.write('<html><head><title>Local File ZK</title></head><body>');
    res.write('<h1>Local File Zookeeper</h1><hr><pre>');
    res.write('<a href="node/">node</a><br/>');
    return res.end('</body></html>');
  }
};

function renderNode (node, req, res) {
  let full = path.resolve(base, '.' + node);
  fs.readdir(full, (err, files) => {
    files = files || [];
    res.writeHead(200, {
      'Content-Type': 'text/html;charset=utf-8'
    });
    res.write(`<html><head><title>${node}</title></head><body>`);
    res.write(`<h1>Index of ${node}</h1><hr><pre>`);
    if (err) {
      if (node !== '/') {
        res.write('<br/><a href="./">../</a><br/>');
      }
      res.write('</pre><hr>');
      return adapter.getData(node, (err, data) => {
        if (err) {
          console.error('error =>', err);
          return res.end(`${err.message}</body></html>`);
        }
        res.write('<form method="post" action="/api/create">');
        res.write(`<input type="hidden" name="redirect" value="/node${node}" />`);
        res.write(`<input type="hidden" name="path" value="${node}" />`);
        res.write('<input type="hidden" name="persistent" value="true" checked />');
        res.write('<input type="hidden" name="node" value="data" />');
        res.write(`<textarea name="data" style="width:100%;" rows="5">${data.toString('utf8')}</textarea>`);
        res.write('<input type="submit" value="Update" />');
        return res.end('</form></body></html>');
      });
    }
    res.write('<br/><a href="../">../</a><br/>');
    for (let file of files) {
      let fullName = path.resolve(full, file);
      let stat = fs.statSync(fullName);
      if (stat.isDirectory()) {
        res.write(`<a href="${file}/">${file}/</a><br/>`);
      } else {
        let name = file.replace(/\.json$/, '');
        res.write(`<a href="${name}">${name}</a>`);
        if (req.query.delete === 'on') {
          res.write(`<a href="/api/delete?path=${node}/${file}&redirect=/node${node}" style="float:right;">Delete</a>`);
        }
        res.write('<br/>');
      }
    }
    res.write('</pre><hr>');
    res.write('<form method="post" action="/api/create">');
    res.write(`<input type="hidden" name="redirect" style="width:100%;" value="/node${node}" />`);
    res.write(`<input type="hidden" name="parent" style="width:100%;" value="${node}" />`);
    res.write('<input type="hidden" name="persistent" value="true" checked />');
    res.write('<input type="text" name="path" style="width:100%;" required placeholder="node name" />');
    res.write('<textarea name="data" placeholder="fill data if this is data node else keep it empty" style="width:100%;"></textarea><br/>');
    res.write('<input type="submit" value="Add" />');
    return res.end('</form></body></html>');
  });
}

const app = http.createServer(function (req, res) {
  let url = urlParse(req.url);
  req.query = qsParse(url.query || '');
  const key = req.method + ' ' + url.pathname;
  const fn = routes[key];
  console.error('request =>', req.method, req.url, req.socket.remoteAddress);
  if (fn) {
    return fn(req, res);
  } else if (/^\/node(\/.*)?$/.test(url.pathname)) {
    if (!RegExp.$1) {
      return res.writeHead(302, {
        location: '/node/'
      }).end();
    }
    return renderNode(RegExp.$1, req, res);
  }
  res.statusCode = 404;
  return res.end();
});

app.listen(parseInt(getArg('port'), 10) || 5181, '0.0.0.0', function () {
  console.error('zk local listen => %j', app.address());
});