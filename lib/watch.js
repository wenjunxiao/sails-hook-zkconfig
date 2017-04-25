'use strict';

const _ = require('lodash');
const zookeeper = require('node-zookeeper-client');
const debug = require('debug')('sails:hook:zkConfig.watch');

/**
 * Get key value from client
 * @param client
 * @param key
 * @param {function(data, version, orig: string)} callback
 */
function getData(client, key, callback) {
  client.getData(key, (evt)=> {
    getData(client, evt.path, callback);
  }, (err, data, info)=> {
    /* istanbul ignore else */
    if (!err) {
      let val = data;
      try {
        val = val.toString('utf-8');
        val = JSON.parse(val);
      } catch (e) {
        /*ignore*/
      }
      callback(val, info.version, data);
    }
  });
}

const validFunc = function () {
  for (let func of arguments) {
    if (_.isFunction(func)) {
      return func;
    }
  }
  return ()=> {
  };
};

/**
 * Watch key data
 * @param servers
 * @param configs
 * @param inputs
 * @param watchConfig
 * @returns {boolean}
 */
module.exports = function (servers, configs, inputs, watchConfig) {
  if (!watchConfig || !watchConfig.enabled) return false;
  debug('watcher starting...');
  const _cache = {};
  const zkWatch = validFunc(watchConfig.zkWatch);
  const client = zookeeper.createClient(servers);
  client.on('connected', ()=> {
    debug('watcher started.');
    _.forEach(_.keys(inputs), (key)=> {
      debug('watch => %s', key);
      getData(client, key, (data, version)=> {
        let ds = JSON.stringify(data);
        if (_cache[key] !== ds && _cache[key] !== undefined) {
          _cache[key] = ds;
          let affects = inputs[key];
          debug('changed => %s %d %d', key, version, affects.length);
          _.forEach(affects, function (f) {
            f(configs, data, _);
            zkWatch.call(watchConfig, data, key, f.path);
            f.watch && f.watch(data, key, f.path);
          });
          let watchKey = validFunc(watchConfig[key], watchConfig.watch);
          watchKey.call(watchConfig, data, key);
        } else {
          _cache[key] = ds;
        }
      });
    });
  });
  client.connect();
  return true;
};