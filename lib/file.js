'use strict';

const fs = require('fs');
const EventEmitter = require('events');

function getLogger() {
  /* eslint-disable no-console */
  return {
    error: console.error.bind(console),
    warn: console.error.bind(console),
    info: console.error.bind(console),
    debug: console.error.bind(console),
    trace: console.error.bind(console)
  };
}

function readFile(path) {
  return new Promise((resolve, reject) => {
    return fs.readFile(path, (err, data) => {
      if (err) return reject(err);
      return resolve(data);
    });
  });
}

function unlink(path) {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

function writeFile(path, data) {
  return new Promise((resolve, reject) => {
    return fs.writeFile(path, data, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

class FileAdapter extends EventEmitter {

  constructor(servers) {
    super();
    this.servers = servers;
    this.logger = getLogger('zk.local.file');
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
      let watchPath = full;
      do {
        try {
          this.logger.trace('watch path =>', full, watchPath);
          watchers.watcher = fs.watch(watchPath, {
            recursive: watchPath !== full
          }, (evt, filename) => {
            const watchFile = path.resolve(watchPath, filename);
            this.logger.trace('watched =>', full, evt, watchFile);
            if (!watchFile.startsWith(full)) {
              return;
            }
            watchers.watcher = null;
            while (watchers.listeners.length > 0) {
              const listener = watchers.listeners.shift();
              if (listener) {
                listener({});
              }
            }
          });
        } catch (err) {
          this.logger.trace('watch error =>', full, err);
          if (err.code === 'ENOENT') {
            watchPath = path.dirname(watchPath);
            continue;
          }
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
    return readFile(full).then((buffer) => {
      const data = JSON.parse(buffer.toString() || '{}');
      if (watcher) {
        self._startWatcher(path, watcher);
      }
      return cb([data.data, data.version]);
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
      return cb(path);
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
  }
  return zk;
}

module.exports.wrap = wrap;
