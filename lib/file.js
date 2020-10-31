'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const EventEmitter = require('events');

/* istanbul ignore next */
function getLogger (name) {
  /* eslint-disable no-console */
  if (process.send) {
    const emtpy = function () { };
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
function readFile (path, suffix) {
  return new Promise((resolve, reject) => {
    return fs.readFile(path, (err, data) => {
      if (suffix && err && err.code === 'ENOENT') {
        return resolve(readFile(path + suffix));
      } else if (err) return reject(err);
      return resolve(data);
    });
  });
}

/* istanbul ignore next */
function unlink (path) {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

/* istanbul ignore next */
function writeFile (path, data, options) {
  return new Promise((resolve, reject) => {
    return fs.writeFile(path, data, options || {}, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

/* istanbul ignore next */
function pathResolve () {
  return path.resolve.apply(path, arguments);
}

/* istanbul ignore next */
function pathDirname () {
  return path.dirname.apply(path, arguments);
}

function tryParse (data, defVal) {
  try {
    return JSON.parse(data);
  } catch (ununsed) {
    return defVal;
  }
}

/* istanbul ignore next */
class FileAdapter extends EventEmitter {

  constructor(servers) {
    super();
    this.servers = servers;
    this.logger = getLogger('file');
    this.watchers = [];
    this.tempfiles = [];
    this.connectionManager = {
      socket: {
        address () {
          return {
            address: '127.0.0.1',
            port: process.pid
          };
        }
      }
    };
  }

  connect () {
    this.emit('connected');
  }

  _full (p) {
    return this.servers + p;
  }

  watch (path, watcher) {
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
                listener({ path: path });
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

  getChildren (path, ...args) {
    const cb = args.pop();
    const full = this._full(path);
    fs.readdir(full, (err, files) => {
      if (err) {
        return wrapError.call(this, cb, err);
      }
      return cb(null, files.map(file => file.replace(/\.json$/, '')));
    });
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
      const data = tryParse(bs, { data: bs });
      if (watcher) {
        self.watch(path, watcher);
      }
      if (typeof data.data === 'string') {
        data.data = Buffer.from(data.data, 'utf-8');
      } else if (data.data) {
        data.data = Buffer.from(JSON.stringify(data.data), 'utf-8');
      } else {
        return cb(new Error('Invalid config data:' + buffer.toString()));
      }
      return cb(null, data.data, { version: data.version || 0 });
    }).catch(wrapError.bind(this, cb));
  }

  create (path, data, ...args) {
    if (args.length === 0) {
      const full = this._full(path);
      return fs.mkdir(full, (err) => {
        if (err) {
          return wrapError.call(this, data, err);
        }
        return data(null, full);
      });
    }
    const cb = args.pop();
    const persistent = args.pop();
    const meta = args.pop() || {};
    const full = this._full(path) + '.json';
    const d = {
      data: typeof data === 'object' ? data : data && data.toString(),
      version: 1,
      meta
    };
    if (!persistent) {
      this.tempfiles.push(full);
      d.pid = process.pid;
      d.temp = true;
    }
    return writeFile(full, JSON.stringify(d), { flag: 'wx' }).then(() => {
      return cb(null, path);
    }).catch(wrapError.bind(this, cb));
  }

  setData (path, data, ...args) {
    const cb = args.pop();
    const version = args.pop() || 1;
    const meta = args.pop() || {};
    const full = this._full(path) + '.json';
    const d = {
      data: typeof data === 'object' ? data : data && data.toString(),
      version,
      meta
    };
    return writeFile(full, JSON.stringify(d)).then(() => {
      return cb(null, path);
    }).catch(wrapError.bind(this, cb));
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

class HttpAdapter extends EventEmitter {
  constructor(servers) {
    super();
    this.servers = servers;
    this.watchers = [];
    this.connectionManager = {
      socket: {
        address () {
          return {
            address: '127.0.0.1',
            port: process.pid
          };
        }
      }
    };
  }

  connect () {
    this.emit('connected');
  }

  getData (path, ...args) {
    const cb = args.pop();
    const watcher = args.pop();
    const self = this;
    http.get(this.servers + '/api/getData?path=' + path, res => {
      const chunks = [];
      res.on('error', err => {
        cb(err);
      });
      res.on('data', chunk => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (data.error) {
          return cb(data.error);
        }
        if (watcher) {
          self.watch(path, watcher);
        }
        if (typeof data.data === 'string') {
          data.data = Buffer.from(data.data, 'utf-8');
        } else if (data.data) {
          data.data = Buffer.from(JSON.stringify(data.data), 'utf-8');
        } else {
          return cb(new Error('Invalid config data:' + data.toString()));
        }
        return cb(null, data.data, data.info);
      });
    });
  }

  getChildren (path, ...args) {
    const cb = args.pop();
    const watcher = args.pop();
    const self = this;
    http.get(this.servers + '/api/getChildren?path=' + path, res => {
      const chunks = [];
      res.on('error', err => {
        cb(err);
      });
      res.on('data', chunk => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        let data = Buffer.concat(chunks).toString('utf8');
        try {
          data = JSON.parse(data);
        } catch (err) {
          err.data = data;
          return cb(err);
        }
        if (data.error) {
          return cb(data.error);
        }
        if (watcher) {
          self.watch(path, watcher);
        }
        return cb(null, data.data);
      });
    });
  }

  create (path, data, ...args) {
    const cb = args.pop();
    const persistent = args.pop();
    return http.request(this.servers + '/api/create', {
      method: 'POST',
    }, res => {
      const chunks = [];
      res.on('error', err => {
        cb(err);
      });
      res.on('data', chunk => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return cb(data.error, data.path);
      });
    }).end(JSON.stringify({
      path,
      data: Buffer.isBuffer(data) ? data.toString('utf8') : data,
      persistent
    }));
  }

  setData (path, data, ...args) {
    const cb = args.pop();
    const version = args.pop();
    return http.request(this.servers + '/api/update', {
      method: 'POST',
    }, res => {
      const chunks = [];
      res.on('error', err => {
        cb(err);
      });
      res.on('data', chunk => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return cb(data.error, data.path);
      });
    }).end(JSON.stringify({
      path,
      data: Buffer.isBuffer(data) ? data.toString('utf8') : data,
      version
    }));
  }

  watch (path, watcher) {
    http.get(this.servers + '/api/watch?path=' + path, res => {
      const chunks = [];
      res.on('error', error => {
        watcher({ path, error });
      });
      res.on('data', chunk => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        watcher(data);
      });
    });
  }
}

/* istanbul ignore next */
function wrapError (cb, err) {
  if (err.code === 'ENOENT') {
    err.code = FileAdapter.prototype.NO_NODE;
    err.name = 'NO_NODE';
    err.message = 'Exception: NO_NODE[' + err.code +']';
  } else if (err.code === 'EEXIST') {
    err.code = FileAdapter.prototype.NODE_EXISTS;
    err.name = 'NODE_EXISTS';
    err.message = 'Exception: NODE_EXISTS[' + err.code +']';
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
      } else if (/^(http:\/\/.*)$/.test(servers)) {
        return new HttpAdapter(RegExp.$1);
      } else {
        let client = zkCreateClient(servers);
        client.NO_NODE = zk.Exception.NO_NODE;
        client.NODE_EXISTS = zk.Exception.NODE_EXISTS;
        return client;
      }
    };
  }
  return zk;
}

module.exports.FileAdapter = FileAdapter;
module.exports.wrap = wrap;
