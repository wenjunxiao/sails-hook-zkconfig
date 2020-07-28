'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/* istanbul ignore next */
function getLogger(name) {
  /* eslint-disable no-console */
  if (process.send) {
    const emtpy = function () {};
    return {
      error: emtpy,
      warn: emtpy,
      info: emtpy,
      debug: emtpy,
      trace: emtpy
    };
  }
  const debug = require('debug')('sails:hook:zkConfig.' + name);
  return {
    error: debug,
    warn: debug,
    info: debug,
    debug: debug,
    trace: debug
  };
}

/* istanbul ignore next */
function readFile(path, suffix) {
  return new Promise((resolve, reject) => {
    return fs.readFile(path, (err, data) => {
      if (suffix && err.code === 'ENOENT') {
        return resolve(readFile(path + suffix));
      } else if (err) return reject(err);
      return resolve(data);
    });
  });
}

/* istanbul ignore next */
function unlink(path) {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

/* istanbul ignore next */
function writeFile(path, data) {
  return new Promise((resolve, reject) => {
    return fs.writeFile(path, data, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

/* istanbul ignore next */
function pathResolve() {
  return path.resolve.apply(path, arguments);
}

/* istanbul ignore next */
function pathDirname (){
  return path.dirname.apply(path, arguments);
}

/* istanbul ignore next */
class FileAdapter extends EventEmitter {

  constructor(servers) {
    super();
    this.servers = servers;
    this.logger = getLogger('file');
    this.watchers = [];
  }

  connect () {
    this.emit('connected');
  }

  _full (p) {
    return this.servers + p;
  }

  _startWatcher (path, watcher) {
    const self = this;
    const full = this._full(path);
    let watchers = self.watchers[full];
    if (!watchers) {
      watchers = self.watchers[full] = {
        listeners: []
      };
    }
    watchers.listeners.push(watcher);
    this.logger.trace('watch =>', full, watchers.listeners.length);
    if (!watchers.watcher) {
      let suffix = '.json';
      let watchPath = full;
      do {
        try {
          this.logger.trace('watch path =>', full, watchPath);
          watchers.watcher = fs.watch(watchPath, {
            recursive: watchPath !== full
          }, (evt, filename) => {
            const watchFile = pathResolve(watchPath, filename);
            this.logger.trace('watched =>', full, evt, watchFile, watchFile.startsWith(full), watchers.listeners.length);
            if (!watchFile.startsWith(full)) {
              return;
            }
            watchers.watcher.close();
            watchers.watcher = null;
            while (watchers.listeners.length > 0) {
              const listener = watchers.listeners.shift();
              if (listener) {
                listener({path: path});
              }
            }
          });
        } catch (err) {
          if (err.code === 'ENOENT') {
            if (suffix) {
              watchPath = full + suffix;
              suffix = null;
            } else {
              watchPath = pathDirname(watchPath);
            }
            continue;
          }
          this.logger.trace('watch error =>', full, err);
          throw err;
        }
      } while (!watchers.watcher && watchPath !== this.servers);
    }
  }

  getData (path, ...args) {
    const cb = args.pop();
    const watcher = args.pop();
    const self = this;
    const full = this._full(path);
    return readFile(full, '.json').then((buffer) => {
      const bs = buffer.toString()
        .replace(/(^|\n)\s*\/\/.*/img, '')
        .replace(/,\s*(\n\s*})/img, '$1');
      const data = JSON.parse(bs);
      if (watcher) {
        self._startWatcher(path, watcher);
      }
      if (typeof data.data === 'string') {
        data.data = Buffer.from(data.data, 'utf-8');
      } else if (data.data) {
        data.data = Buffer.from(JSON.stringify(data.data), 'utf-8');
      } else {
        return cb(new Error('Invalid config data:' + buffer.toString()));
      }
      return cb(null, data.data, {version: data.version || 0});
    }).catch(wrapError.bind(this, cb));
  }

  create (path, data, ...args) {
    const cb = args.pop();
    const persistent = args.pop();
    const full = this._full(path);
    const d = {
      data: data && data.toString(),
      version: 1
    };
    if (!persistent) {
      this.tempfiles.push(full);
      d.pid = process.pid;
      d.temp = true;
    }
    return writeFile(full, JSON.stringify(d)).then(() => {
      return cb(null, path);
    }).catch(wrapError.bind(this, cb));
  }

  address () {
    return {
      address: '127.0.0.1',
      port: process.pid
    };
  }

  close () {
    const self = this;
    return Promise.all(this.tempfiles.map(filename => {
      return unlink(filename);
    })).then(() => {
      return self;
    });
  }
}

FileAdapter.prototype.NO_NODE = 1;
FileAdapter.prototype.NODE_EXISTS = 2;

/* istanbul ignore next */
function wrapError (cb, err) {
  if (err.code === 'ENOENT') {
    err.code = FileAdapter.prototype.NO_NODE;
  }
  err.getCode = () => err.code;
  if (cb) {
    return cb(err);
  }
  return Promise.reject(err);
}

function createClient (servers) {
  return new FileAdapter(servers);
}

function wrap (zk) {
  if (process.env.LOCAL_ZKCONFIG_PATH) {
    zk.createClient = createClient.bind(zk, process.env.LOCAL_ZKCONFIG_PATH);
  } else {
    const zkCreateClient = zk.createClient.bind(zk);
    zk.createClient = function (servers) {
      if (/^(?:file:\/\/)?(\/.*)$/.test(servers)) {
        return createClient(RegExp.$1);
      } else {
        return zkCreateClient(servers);
      }
    };
  }
  return zk;
}

module.exports.FileAdapter = FileAdapter;
module.exports.wrap = wrap;
