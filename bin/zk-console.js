#!/usr/bin/env node
/* eslint-disable */
'use strict';
const fs = require('fs');
const readline = require('readline');
const {
  resolve: pathResolve,
  basename: pathBasename,
} = require('path');
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
const delay = parseInt(getArg('delay', '100'), 10) || 0;
const verbose = getArg('verbose');
const short = getArg('short');
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
    console.error('Waiting for connection.');
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
const absPath = path => pathResolve(pwd || '/', path || '');
const cmds = {
  help () {
    console.log([
      'zk-console --server host:port [--delay ms]',
      'base64 file\n\t\tConver file content to base64',
      'cd [path]\n\t\tSwitch current node to specify path to simplify subsequent commands',
      'create path [--base64-FIELD_NAME=file] [data]\n\t\tCreate path or data path. ' +
      'Also the value of one or more fields comes from the base64 of the file',
      'delete path',
      'get path [>file]\n\t\tGet data of path. Also can save to specify file',
      'll [path]\n\t\tAlias of `ls -l`',
      'ls [-l] [path]',
      'omit path FIELD_NAME\n\t\tRemove field from json data',
      'set path [--base64-FIELD_NAME=file] data\n\t\tSet path data. ' +
      'Also the value of one or more fields comes from the base64 of the file',
    ].join('\n\t'));
    rl.prompt();
  },
  base64 (file) {
    console.log(fs.readFileSync(file).toString('base64'));
    rl.prompt();
  },
  cd (path) {
    if (!path) {
      pwd = '';
    } else if (!pwd) {
      pwd = path.trim().split(/\n/)[0];
    } else {
      pwd = pathResolve(pwd, path.trim().split(/\n/)[0]);
    }
    if (pwd && !pwd.startsWith('/')) {
      pwd = '/' + pwd
    }
    if (pwd && pwd.length > 1) {
      if (short) {
        rl.setPrompt(`zk:${server}:${pathBasename(pwd)}(CONNECTED)> `);
      } else {
        rl.setPrompt(`zk:${server}:${pwd}(CONNECTED)> `);
      }
    } else {
      rl.setPrompt(`zk:${server}(CONNECTED)> `);
    }
    rl.prompt();
  },
  create (args) {
    if (/^(\S+)\s+([\s\S]*)$/m.test(args)) {
      let path = absPath(RegExp.$1);
      let data = RegExp.$2.trim();
      let isFile = false;
      if (/^--base64-(\w+)=(\S+)\s*([\s\S]*)$/m.test(data)) {
        let field = RegExp.$1;
        let file = RegExp.$2;
        let next = RegExp.$3;
        let tmp = {};
        tmp[field] = fs.readFileSync(file, { encoding: 'base64' });
        while (/^--base64-(\w+)=(\S+)\s*([\s\S]*)$/m.test(next)) {
          field = RegExp.$1;
          file = RegExp.$2;
          next = RegExp.$3;
          tmp[field] = fs.readFileSync(file, { encoding: 'base64' });
        }
        if (next.trim()) {
          try {
            data = JSON.stringify(Object.assign(JSON.parse(next), tmp));
          } catch (_) { }
        } else {
          data = JSON.stringify(tmp);
        }
      } else {
        if (/^<\s*(.*)$/m.test(data)) {
          isFile = true;
          data = fs.readFileSync(RegExp.$1, 'utf-8');
        } else {
          data = data.replace(/^"([\s\S]*)"$/m, '$1').trim();
        }
        try {
          data = JSON.stringify(JSON.parse(data));
        } catch (_) { }
      }
      client.create(path, Buffer.from(data, 'utf-8'), (err, path) => {
        if (err) {
          console.error(err);
          return rl.prompt();
        }
        if (isFile) {
          console.log('Data created %s', path);
        } else {
          console.log('Data created %s %s', path, data);
        }
        return rl.prompt();
      });
    } else {
      client.create(absPath(args), (err, path) => {
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
    client.remove(absPath(path), (err) => {
      if (err) {
        console.error(err);
        return rl.prompt();
      }
      return rl.prompt();
    });
  },
  get (path) {
    let json = false;
    if (/^-j(?:\s+(.*))?$/.test(path)) {
      path = RegExp.$1 || '';
      json = true;
    }
    let dst;
    if (/^(\S+)\s+>\s*(.*)$/.test(path)) {
      path = RegExp.$1;
      dst = RegExp.$2;
    }
    client.getData(absPath(path), (err, data) => {
      if (err) {
        console.error(err);
        return rl.prompt();
      }
      if (data) {
        if (json) {
          data = Buffer.from(JSON.stringify(JSON.parse(data.toString('utf-8')), null, 2), 'utf-8');
        }
        if (dst) {
          fs.writeFileSync(dst, data, { flag: 'wx' });
        } else {
          console.log(data.toString('utf-8'));
        }
      } else {
        console.log(data);
      }
      return rl.prompt();
    });
  },
  ll (path) {
    return cmds.ls(`-l ${path || ''}`);
  },
  ls (path) {
    let list = false;
    if (/^-l(?:\s+(.*))?$/.test(path)) {
      path = RegExp.$1 || '';
      list = true;
    }
    path = absPath(path || '');
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    client.getChildren(path || '/', (err, children) => {
      if (err) {
        console.error(err);
        return rl.prompt();
      }
      if (list) {
        console.log(`[\n  ${children.join(',\n  ')}\n]`);
      } else {
        console.log(`[${children.join(',')}]`);
      }
      return rl.prompt();
    });
  },
  omit (args) {
    if (/^(\S+)\s+([\s\S]*)\s*$/m.test(args)) {
      let path = absPath(RegExp.$1);
      let fields = RegExp.$2.trim().split(/\s/).filter(s => s);
      if (fields.length === 0) {
        return rl.prompt();
      }
      client.getData(path, (err, data) => {
        if (err) {
          console.error(err);
          return rl.prompt();
        }
        data = JSON.parse(data.toString('utf-8'));
        for (let field of fields) {
          delete data[field];
        }
        client.setData(path, Buffer.from(JSON.stringify(data), 'utf-8'), (err, stat) => {
          if (err) {
            console.error(err);
            return rl.prompt();
          }
          if (verbose) {
            console.log('Data omitted %s %j', path, stat);
          } else {
            console.log('Data omitted %s', path);
          }
          return rl.prompt();
        });
      });
    } else {
      rl.prompt();
    }
  },
  pwd () {
    console.log(pwd || '/');
    rl.prompt();
  },
  set (args) {
    if (/^(\S+)\s+([\s\S]*)\s*$/m.test(args)) {
      let path = absPath(RegExp.$1);
      let data = RegExp.$2.trim();
      if (/^--base64-(\w+)=(\S+)\s*([\s\S]*)$/m.test(data)) {
        let field = RegExp.$1;
        let file = RegExp.$2;
        let next = RegExp.$3;
        let tmp = {};
        tmp[field] = fs.readFileSync(file, { encoding: 'base64' });
        while (/^--base64-(\w+)=(\S+)\s*([\s\S]*)$/m.test(next)) {
          field = RegExp.$1;
          file = RegExp.$2;
          next = RegExp.$3;
          tmp[field] = fs.readFileSync(file, { encoding: 'base64' });
        }
        if (next.trim()) {
          try {
            data = JSON.stringify(Object.assign(JSON.parse(next), tmp));
          } catch (_) { }
        } else {
          data = JSON.stringify(tmp);
        }
      } else {
        if (/^<\s*(.*)$/m.test(data)) {
          data = fs.readFileSync(RegExp.$1, 'utf-8');
        } else {
          data = data.replace(/^"([\s\S]*)"$/m, '$1').trim();
        }
        try {
          data = JSON.stringify(JSON.parse(data));
        } catch (_) { }
      }
      client.setData(path, Buffer.from(data, 'utf-8'), (err, stat) => {
        if (err) {
          console.error(err);
          return rl.prompt();
        }
        if (verbose) {
          console.log('Data updated %s %j', path, stat);
        } else {
          console.log('Data updated %s', path);
        }
        return rl.prompt();
      });
    } else {
      rl.prompt();
    }
  }
};
client.connect();
