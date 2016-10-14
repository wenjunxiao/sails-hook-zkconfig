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
  keys = _.reduce(keys, function(r, key) {
    if (_.isString(key)) {
      r.push(key);
    } else if (_.isPlainObject(key)) {
      _.map(key, function(v, k) {
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

module.exports = function(sails) {
  return {
    defaults: {
      __configKey__: {
        enabled: true,
        timeout: 30000,
        zkObjKey: 'zkPath',
        zkKeys: []
      }
    },
    configure: function configure() {
      let configKey = this.configKey;
      let config = sails.config[this.configKey];
      let reg = new RegExp('^' + configKey.toLowerCase() + '$', 'i');
      let keys = Object.keys(sails.config).filter(k => reg.test(k) && k !== configKey);
      keys.forEach(function(key) {
        _.assign(config, sails.config[key]);
      });
      if (!config.enabled) {
        debug('load zkConfig disabled.');
        return;
      }
      let zkHost = hostsToString(sails.config.zkHost || config.zkHost);
      let zkKeys = keysToArray(sails.config.zkKeys || config.zkKeys);
      let zkObjKey = sails.config.zkObjKey || config.zkObjKey;
      debug('load zkConfig start: %s %s %s %s', zkHost, zkKeys, zkObjKey, config.timeout);
      try {
        require('./lib/load')(sails.config, zkHost, zkKeys, zkObjKey, config.timeout, sails);
      } catch (err) {
        /* istanbul ignore next */
        throw new Error('load zkConfig failed\n' + (err.stack || err.message || err));
      }
      debug('load zkConfig finished.');
    }
  };
};
