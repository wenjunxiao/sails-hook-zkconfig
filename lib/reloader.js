'use strict';

const _ = require('lodash');
const co = require('co');
const pify = require('promise.ify');
const zookeeper = require('./file').wrap(require('node-zookeeper-client'));

function Reloader (servers) {
  if (!(this instanceof Reloader)) return new Reloader(servers);
  this.servers = servers;
  this.reloaders = {};
}

Reloader.prototype.register = function (fn, key) {
  this.reloaders['sails.config' + fn.path] = {
    fn,
    key
  };
};

Reloader.prototype.reload = function (path, cb) {
  const client = zookeeper.createClient(this.servers);
  client.getDataAsync = pify(client.getData);
  const reloaders = this.reloaders;
  client.on('connected', function () {
    co(function* () {
      if (_.isArray(path)) {
        let ds = [];
        try {
          for (let p of path) {
            let cfg = reloaders[p];
            if (cfg) {
              let v = cfg.fn.decoder((yield client.getDataAsync(cfg.key))[0].toString('utf-8'));
              ds.push(v);
            }
          }
          cb(null, ds);
        } catch (err) {
          cb(err, ds);
        }
      } else if (reloaders[path]) {
        let cfg = reloaders[path];
        try {
          let v = cfg.fn.decoder((yield client.getDataAsync(cfg.key))[0].toString('utf-8'));
          cb(null, v);
        } catch (err) {
          cb(err);
        }
      }
      client.close();
    });
  });
  client.connect();
};

module.exports = Reloader;