'use strict';
/**
 * Load config from zookeeper for sails app
 * @author Wenjun Xiao
 */

const _ = require('lodash');
const debug = require('debug')('sails:hook:zkConfig');

function hostsToString(hosts) {
  return _.isArray(hosts) ? hosts.join(',') : hosts;
}

function keysToArray(keys) {
  if (_.isString(keys)) {
    keys = keys.split(',');
  } else if (!_.isArray(keys)) {
    keys = [keys];
  }
  keys = _.reduce(keys, function (r, key) {
    if (_.isString(key)) {
      r.push(key);
    } else if (_.isPlainObject(key)) {
      _.map(key, function (v, k) {
        r.push(k);
        if (sails.config[k] === undefined) {
          sails.config[k] = v;
        }
      });
    }
    return r;
  }, []);
  return keys;
}

function runConfig(fn, config) {
  if (_.isFunction(fn)) {
    fn(config);
  }
}

const listeners = {};

/**
 * Watch config path(s)'s changes
 * @param {string|Array.<string>} path
 * @param {function(data: string|Array.<string>, path: string,...)} cb
 */
const watchConfig = (path, cb) => {
  let paths = _.isArray(path) ? path : [path];
  _.forEach(paths, (path) => {
    (listeners[path] || (listeners[path] = [])).push(cb);
  });
};

/**
 * Remove config path(s)'s watcher
 * @param {string|Array.<string>} path
 * @param {function(data: string|Array.<string>, path: string,...)} [cb]
 */
const removeConfigWatcher = (path, cb) => {
  let paths = _.isArray(path) ? path : [path];
  _.forEach(paths, (path) => {
    if (cb) {
      let a = listeners[path];
      if (a && a.indexOf(cb)) {
        a.splice(a.indexOf(cb), 1);
      }
      if (a && a.length === 0) {
        delete listeners[path];
      }
    } else {
      delete listeners[path];
    }
  });
};

const zkWatch = (data, path, configPath) => {
  let sailsPath = 'sails.config' + configPath;
  let affects = 0;
  _.forEach(listeners, (cbs, key) => {
    if (sailsPath.startsWith(key)) {
      affects += cbs.length;
      cbs.forEach(cb => cb(data, key, path, configPath));
    }
  });
  debug('sails.config changed => %s %d', sailsPath, affects);
};

module.exports = function (sails) {
  sails.watchConfig = watchConfig;
  sails.removeConfigWatcher = removeConfigWatcher;
  return {
    defaults: {
      __configKey__: {
        enabled: true,
        timeout: 30000,
        zkObjKey: 'zkPath',
        zkKeys: [],
        zkBase: '/',
        zkCache: require('./lib/cache'),
        zkWatcher: {
          enabled: false,
          watch: (data, path) => {

          }
        }
      }
    },
    configure: function configure() {
      let configKey = this.configKey;
      let config = sails.config[this.configKey];
      let reg = new RegExp('^' + configKey.toLowerCase() + '$', 'i');
      let keys = Object.keys(sails.config).filter(k => reg.test(k) && k !== configKey);
      keys.forEach(function (key) {
        _.merge(config, sails.config[key]);
      });
      if (!config.enabled) {
        debug('load zkConfig disabled.');
        return;
      }
      let zkHost = hostsToString(sails.config.zkHost || config.zkHost);
      let zkBase = sails.config.zkBase || config.zkBase;
      let zkKeys = keysToArray(sails.config.zkKeys || config.zkKeys);
      let zkObjKey = sails.config.zkObjKey || config.zkObjKey;
      let zkWatcher = config.zkWatcher;
      zkWatcher.zkWatch = zkWatch;
      debug('load zkConfig start: %s %s %s %s', zkHost, zkKeys, zkObjKey, config.timeout, zkBase);
      try {
        runConfig(config.before, sails.config);
        require('./lib/load')(sails.config, zkHost, zkKeys, zkObjKey, config.timeout, sails, config.zkCache, zkWatcher, zkBase);
        runConfig(config.after, sails.config);
      } catch (err) {
        /* istanbul ignore next */
        throw new Error('load zkConfig failed\n' + (err.stack || err.message || err));
      }
      debug('load zkConfig finished.');
    },
    watchConfig: watchConfig,
    removeConfigWatcher: removeConfigWatcher
  };
};
