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
const pkg = require('../package.json');

function getArg (name) {
  let pos = process.argv.indexOf('--' + name);
  if (pos > 0) return process.argv[pos + 1];
}

const base = getArg('base');
const adapter = new FileAdapter(base);

function redirectTo (res, location) {
  res.writeHead(302, {
    location
  });
  return res.end();
}

let icon = null;
let startup = new Date();
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
      if (body.data) {
        try {
          let data = JSON.parse(body.data);
          if (typeof data === 'object') {
            body.data = data;
          }
        } catch (unused) {/* ignore parse error */ }
      }
      console.error('[%s] create => %s', new Date().toISOString(), body.path);
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
            return redirectTo(res, body.redirect);
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
            return redirectTo(res, body.redirect);
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
      if (body.data) {
        try {
          let data = JSON.parse(body.data);
          if (typeof data === 'object') {
            body.data = data;
          }
        } catch (unused) {/* ignore parse error */ }
      }
      console.error('[%s] update => %s', new Date().toISOString(), body.path);
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
          return redirectTo(res, body.redirect);
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
    console.error('[%s] delete =>', new Date().toISOString(), full + '.json');
    fs.unlink(full + '.json', err => {
      if (err) {
        console.error('[%s] delete =>', new Date().toISOString(), full);
        return fs.unlink(full, err => {
          if (err) {
            return res.end(JSON.stringify({
              error: { message: err.message },
            }));
          }
          return redirectTo(res, req.query.redirect);
        });
      }
      return redirectTo(res, req.query.redirect);
    });
  },
  'GET /api/rmdir': function (req, res) {
    const full = path.resolve(base, '.' + req.query.path);
    console.error('[%s] rmdir =>', new Date().toISOString(), full);
    fs.rmdir(full, err => {
      if (err) {
        return res.end(JSON.stringify({
          error: { message: err.message },
        }));
      }
      return redirectTo(res, req.query.redirect);
    });
  },
  'POST /favicon.ico': function (req, res) {
    if (!icon && req.query.icon) {
      icon = Buffer.from(decodeURIComponent(req.query.icon).replace(/^.*;base64,/, ''), 'base64');
    }
    return res.end();
  },
  'GET /favicon.ico': function (req, res) {
    res.writeHead(200, {
      'Content-Type': 'image/x-icon'
    });
    return res.end(icon || '');
  },
  'GET /': function (req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/html;charset=utf-8'
    });
    res.write('<html><head><title>Local File Zookeeper</title></head><body>');
    res.write(`<h1>Local File Zookeeper - ${pkg.version}</h1>Started at <span id="time"></span><hr><pre>`);
    res.write(`<script>document.getElementById('time').innerText = new Date('${startup.toISOString()}').toLocaleString();</script>`);
    res.write('<a href="node/">node</a><br/>');
    createIcon(res, req);
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
                    console.error('[%s] sync node =>', new Date().toISOString(), node);
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
                console.error('[%s] sync node =>', new Date().toISOString(), node);
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
                  console.error('[%s] sync node =>', new Date().toISOString(), fullNode);
                  return resolve(fullNode);
                });
              });
            });
          })).then((nodes) => {
            return res.end(JSON.stringify({
              nodes: nodes.filter(s => s)
            }));
          }).catch(err => {
            console.error('[%s] sync error =>', new Date().toISOString(), err);
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

function createIcon (res) {
  if (!icon) {
    res.write('<script>');
    res.write('var canvas = document.createElement("canvas");');
    res.write('var ctx0 = canvas.getContext("2d");');
    res.write(`var font = ctx0.font = ctx0.font.split(' ').map(s => {
      if (/\\d+px/.test(s)) {
        return '30px';
      }
      return s;
    }).join(' ');
    canvas.width = ctx0.measureText("ZK").width;
    canvas.height = parseInt(font);
    var ctx = canvas.getContext("2d");
    ctx.font = font;
    ctx.fillStyle = "DodgerBlue";
    ctx.fillText("ZK", 0, canvas.height - 2);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/favicon.ico?icon=' + encodeURIComponent(canvas.toDataURL()));
    xhr.send();`);
    res.write('</script>');
  }
}

function renderNode (node, req, res) {
  let full = path.resolve(base, '.' + node);
  fs.readdir(full, (err, files) => {
    if (!err && !node.endsWith('/')) {
      return redirectTo(res, '/node' + node + '/');
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
          console.error('[%s] error =>', new Date().toISOString(), err);
          return res.end(`${err.message}</body></html>`);
        }
        res.write('<form method="post" action="/api/update">');
        res.write(`<input type="hidden" name="redirect" value="/node${node}${query}" />`);
        res.write(`<input type="hidden" name="path" value="${node}" />`);
        if (req.query.format === 'false') {
          res.write(`<textarea name="data" style="width:100%;" rows="5">${data.toString('utf8')}</textarea>`);
        } else {
          try {
            data = JSON.stringify(JSON.parse(data.toString('utf8')), null, 2);
          } catch (unused) {/* ignore error*/
            data = data.toString('utf8');
          }
          res.write(`<textarea name="data" style="width:100%;" rows="${data.split('\n').length * 2}">${data}</textarea>`);
        }
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
    createIcon(res);
    return res.end('</form></body></html>');
  });
}

let tokens = getArg('auth');
if (tokens) {
  if (tokens.split(':').length > 1) {
    tokens = tokens.split(',');
  } else {
    tokens = fs.readFileSync(tokens, 'utf-8').split('\n');
  }
  if (Array.isArray(tokens)) {
    tokens = tokens.reduce((r, d) => {
      let k = Buffer.from(d, 'utf-8').toString('base64');
      r[k] = d.split(':')[0];
      return r;
    }, {});
  }
}

const app = http.createServer(function (req, res) {
  req.ip = req.socket.remoteAddress;
  if (tokens) {
    let authorization = req.headers.authorization;
    if (authorization) {
      authorization = authorization.substring(authorization.indexOf(' ') + 1);
    }
    req.user = tokens[authorization];
    if (!req.user && req.ip !== '127.0.0.1' && !req.url.startsWith('/favicon.ico')) {
      res.writeHead(401, {
        'WWW-AUTHENTICATE': 'Basic realm="basic"'
      });
      createIcon(res);
      return res.end();
    } else if (!req.user) {
      req.user = 'anonymous';
    }
  } else {
    req.user = 'anonymous';
  }
  let url = urlParse(req.url);
  req.query = qsParse(url.query || '');
  const key = req.method + ' ' + url.pathname;
  const fn = routes[key];
  console.error('[%s] request =>', new Date().toISOString(), req.method, req.url, req.socket.remoteAddress, req.user);
  if (fn) {
    return fn(req, res);
  } else if (/^\/node(\/.*)?$/.test(url.pathname)) {
    if (!RegExp.$1) {
      return redirectTo(res, '/node/');
    }
    return renderNode(RegExp.$1, req, res);
  }
  res.statusCode = 404;
  return res.end();
});

app.listen(parseInt(getArg('port'), 10) || 5181, getArg('host') || '0.0.0.0', function () {
  console.error('[%s] zk local listen => %j %s', new Date().toISOString(), app.address(), !!tokens);
});