#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const urlParse = require('url').parse;
const qsParse = require('querystring').parse;
const qsStringify = require('querystring').stringify;
const FileAdapter = require('../lib/file').FileAdapter;
const zookeeper = require('../lib/file').wrap(require('node-zookeeper-client'));

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
      console.error('create => %j', body);
      if (body.data || body.node === 'data') {
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
  'POST /api/update': function (req, res) {
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
      adapter.setData(body.path, body.data || '', {
        ip: req.socket.remoteAddress
      }, (err, path) => {
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
    });
  },
  'GET /api/watch': function (req, res) {
    adapter.watch(req.query.path, (event) => {
      return res.end(JSON.stringify(event));
    });
  },
  'GET /api/delete': function (req, res) {
    const full = path.resolve(base, '.' + req.query.path);
    console.error('delete =>', full + '.json');
    fs.unlink(full + '.json', err => {
      if (err) {
        console.error('delete =>', full);
        return fs.unlink(full, err => {
          if (err) {
            return res.end(JSON.stringify({
              error: { message: err.message },
            }));
          }
          return res.writeHead(302, {
            location: req.query.redirect
          }).end();
        });
      }
      return res.writeHead(302, {
        location: req.query.redirect
      }).end();
    });
  },
  'GET /api/rmdir': function (req, res) {
    const full = path.resolve(base, '.' + req.query.path);
    console.error('rmdir =>', full);
    fs.rmdir(full, err => {
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
  },
  'POST /api/sync': function (req, res) {
    let servers = req.query.servers;
    let node = req.query.node;
    let force = req.query.force === 'true';
    let full = path.resolve(base, '.' + node);
    const client = zookeeper.createClient(servers);
    client.on('connected', () => {
      fs.readdir(full, (err, files) => {
        if (err) { // file
          return adapter.getData(node, (err, data) => {
            if (err) {
              return res.end(JSON.stringify({
                error: { message: err.message },
              }));
            } else {
              client.create(node, data, true, function (err) {
                if (err) {
                  if (err.code === client.NODE_EXISTS) {
                    if (!force) {
                      return res.end(JSON.stringify({
                        nodes: []
                      }));
                    }
                    console.error('sync node =>', node);
                    return client.setData(node, data, function (err) {
                      if (err) {
                        return res.end(JSON.stringify({
                          error: { message: err.message },
                        }));
                      }
                      return res.end(JSON.stringify({
                        nodes: [node]
                      }));
                    });
                  }
                  return res.end(JSON.stringify({
                    error: { message: err.message },
                  }));
                }
                console.error('sync node =>', node);
                return res.end(JSON.stringify({
                  nodes: [node]
                }));
              });
            }
          });
        } else {
          Promise.all(files.map(function (file) {
            return new Promise((resolve, reject) => {
              let fullNode = path.resolve(node, file.replace(/\.json$/, ''));
              adapter.getData(fullNode, (err, data) => {
                if (err) {
                  if (err.code === 'EISDIR') {
                    return resolve();
                  }
                  return reject(err);
                }
                client.create(fullNode, data, true, function (err) {
                  if (err) {
                    if (err.code === client.NODE_EXISTS) {
                      return resolve();
                    }
                    return reject(err);
                  }
                  console.error('sync node =>', fullNode);
                  return resolve(fullNode);
                });
              });
            });
          })).then((nodes) => {
            return res.end(JSON.stringify({
              nodes: nodes.filter(s => s)
            }));
          }).catch(err => {
            console.error('sync error =>', err);
            return res.end(JSON.stringify({
              error: { message: err.message },
            }));
          });
        }
      });
    });
    client.connect();
  },
};

function renderNode (node, req, res) {
  let full = path.resolve(base, '.' + node);
  fs.readdir(full, (err, files) => {
    if (!err && !node.endsWith('/')) {
      return res.writeHead(302, {
        location: '/node' + node + '/'
      }).end();
    }
    files = files || [];
    res.writeHead(200, {
      'Content-Type': 'text/html;charset=utf-8'
    });
    let query = qsStringify(req.query);
    if (query) {
      query = '?' + query;
    }
    res.write(`<html><head><title>${node}</title></head><body>`);
    res.write(`<h1>Index of ${node}</h1><hr><pre>`);
    if (err) {
      if (node !== '/') {
        res.write(`<br/><a href="./${query}">../</a><br/>`);
      }
      res.write('</pre><hr>');
      return adapter.getData(node, (err, data) => {
        if (err) {
          console.error('error =>', err);
          return res.end(`${err.message}</body></html>`);
        }
        res.write('<form method="post" action="/api/update">');
        res.write(`<input type="hidden" name="redirect" value="/node${node}${query}" />`);
        res.write(`<input type="hidden" name="path" value="${node}" />`);
        res.write(`<textarea name="data" style="width:100%;" rows="5">${data.toString('utf8')}</textarea>`);
        res.write('<input type="submit" value="Update" />');
        if (req.query.delete === 'on') {
          res.write(`<a href="/api/delete?path=${node}&redirect=/node${path.dirname(node)}/${query}" style="float:right;">Delete</a>`);
        }
        return res.end('</form></body></html>');
      });
    }
    res.write(`<br/><a href="../${query}">../</a><br/>`);
    for (let file of files) {
      let fullName = path.resolve(full, file);
      let stat = fs.statSync(fullName);
      if (stat.isDirectory()) {
        res.write(`<a href="${file}/${query}">${file}/</a><br/>`);
      } else {
        let name = file.replace(/\.json$/, '');
        res.write(`<a href="${name}${query}">${name}</a>`);
        res.write('<br/>');
      }
    }
    res.write('</pre><hr>');
    res.write('<form method="post" action="/api/create">');
    res.write(`<input type="hidden" name="redirect" style="width:100%;" value="/node${node}${query}" />`);
    res.write(`<input type="hidden" name="parent" style="width:100%;" value="${node}" />`);
    res.write('<input type="hidden" name="persistent" value="true" checked />');
    res.write('<input type="text" name="path" style="width:100%;" required placeholder="node name" />');
    res.write('<textarea name="data" placeholder="fill data if this is data node else keep it empty" style="width:100%;"></textarea><br/>');
    res.write('<input type="submit" value="Add" />');
    if (req.query.delete === 'on' && files.length === 0) {
      res.write(`<a href="/api/rmdir?path=${node}&redirect=/node${path.dirname(node)}/${query}" style="float:right;">Delete</a>`);
    }
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