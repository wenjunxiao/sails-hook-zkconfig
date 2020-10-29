#!/usr/bin/env node
/* eslint-disable */
'use strict';
const pathResolve = require('path').resolve;
const readline = require('readline');
const zookeeper = require('../lib/file').wrap(require('node-zookeeper-client'));
const pkg = require('../package.json');

function getArg (name, dv) {
  let pos = process.argv.indexOf('--' + name);
  if (pos > 0) {
    dv = process.argv[pos + 1];
    if (typeof dv === 'undefined') {
      return true;
    }
    return dv;
  } else if (process.argv.indexOf('--no-' + name) < 0) {
    return dv;
  }
}
if (getArg('version')) {
  console.error(pkg.version);
  process.exit(0);
}

const server = getArg('server') || 'localhost:2181';
const delay = parseInt(getArg('delay', '500'), 10) || 0;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.setPrompt(`zk:${server}(CONNECTING)> `);
rl.prompt();
const client = zookeeper.createClient(server);
client.on('connected', () => {
  client.connected = true;
  rl.setPrompt(`zk:${server}(CONNECTED)> `);
  rl.prompt();
});
let returnAt = 0;
let lines = [];
let timer;
rl.on('line', (line) => {
  if (!client.connected) {
    return rl.prompt();
  }
  if (delay > 0) {
    let now = Date.now();
    let cost = returnAt > 0 ? now - returnAt : 0;
    returnAt = now;
    if (timer) clearTimeout(timer);
    lines.push(line);
    if (!line && cost > delay) {
      handler(lines.join('\n'));
      lines = [];
    } else if (!line || lines.length === 1) {
      timer = setTimeout(function () {
        handler(lines.join('\n'));
        lines = [];
      }, delay);
    }
  } else {
    handler(line);
  }
}).on('close', () => {
  process.exit(0);
});

function handler (line) {
  if (/^\s*(\w+)(?:\s+([\s\S]*))?$/m.test(line)) {
    let cmd = RegExp.$1;
    let args = RegExp.$2;
    let fn = cmds[cmd];
    if (!fn) {
      console.error('Unsupport command[%s]', cmd);
      rl.prompt();
    } else {
      fn(args);
    }
  } else {
    rl.prompt();
  }
}

let pwd = '';
const cmds = {
  help () {
    console.log([
      'zk-console --server host:port [--delay ms]',
      'cd [path]',
      'create path [data]',
      'delete path',
      'get path',
      'ls path',
      'set path data',
    ].join('\n\t'));
    rl.prompt();
  },
  cd (path) {
    if (!path) {
      pwd = '';
    } else if (!pwd){
      pwd = path;
    } else {
      pwd = pathResolve(pwd, path);
    }
    if (pwd && !pwd.startsWith('/')) {
      pwd = '/' + pwd
    }
    if (pwd) {
      rl.setPrompt(`zk:${server}(CONNECTED):${pwd}> `);
    } else {
      rl.setPrompt(`zk:${server}(CONNECTED)> `);
    }
    rl.prompt();
  },
  create (args) {
    if (/^(\S+)\s+([\s\S]*)$/m.test(args)) {
      let path = pathResolve(pwd, RegExp.$1);
      let data = RegExp.$2.replace(/^"([\s\S]*)"$/m, '$1').trim();
      try {
        data = JSON.stringify(JSON.parse(data));
      } catch (_) { }
      client.create(path, Buffer.from(data, 'utf-8'), (err, path) => {
        if (err) {
          console.error(err);
          return rl.prompt();
        }
        console.log('Data created %s %s', path, data);
        return rl.prompt();
      });
    } else {
      client.create(pathResolve(pwd, args), (err, path) => {
        if (err) {
          console.error(err);
          return rl.prompt();
        }
        console.log('Path created %s', path);
        return rl.prompt();
      });
    }
  },
  delete (path) {
    client.remove(pathResolve(pwd, path), (err) => {
      if (err) {
        console.error(err);
        return rl.prompt();
      }
      return rl.prompt();
    });
  },
  get (path) {
    client.getData(pathResolve(pwd, path), (err, data) => {
      if (err) {
        console.error(err);
        return rl.prompt();
      }
      if (data) {
        console.log(data.toString('utf-8'));
      } else {
        console.log(data);
      }
      return rl.prompt();
    });
  },
  ls (path) {
    path = pathResolve(pwd, path);
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    client.getChildren(path || '/', (err, children) => {
      if (err) {
        console.error(err);
        return rl.prompt();
      }
      console.log(`[${children.join(',')}]`);
      return rl.prompt();
    });
  },
  set (args) {
    if (/^(\S+)\s+([\s\S]*)\s*$/m.test(args)) {
      let path = pathResolve(pwd, RegExp.$1);
      let data = RegExp.$2.replace(/^"([\s\S]*)"$/, '$1').trim();
      try {
        data = JSON.stringify(JSON.parse(data));
      } catch (_) { }
      client.setData(path, Buffer.from(data, 'utf-8'), (err, stat) => {
        if (err) {
          console.error(err);
          return rl.prompt();
        }
        console.log('Data updated %j', stat);
        return rl.prompt();
      });
    } else {
      rl.prompt();
    }
  }
};
client.connect();
