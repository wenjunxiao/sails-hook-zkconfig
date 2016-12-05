'use strict';

const _ = require('lodash');
const childProcess = require('child_process');
const debug = require('debug')('sails:hook:zkConfig.load');
const MAX_DEPTH = 20;

/**
 * Extract the key which need to load from zookeeper from config array
 *
 * @param {Object} result Zookeeper path need to load
 * @param {String} path   Current search config path
 * @param {Array} configs Config array
 * @param {Array} keys    Config keys expected to be loaded
 * @param {String} objKey Config key expected to be loaded and overwritten parent value
 * @param {Number} depth Current search depth
 * @param rootObj
 * @private
 */
function extractArrayConfig(result, path, configs, keys, objKey, depth, rootObj) {
  depth++;
  /* istanbul ignore if */
  if (depth > MAX_DEPTH) return;
  let parentPath = path ? path : '';
  _.forEach(configs, function(config, index) {
    path = parentPath + '[' + index + ']';
    if (_.isArray(config)) {
      extractArrayConfig(result, path, config, keys, objKey, depth, rootObj);
    } else if (_.isObject(config) && config !== rootObj) {
      extractConfig(result, path, config, keys, objKey, depth, rootObj);
    }
  });
}

/**
 * Extract the key which need to load from zookeeper from config array
 *
 * @param {Object} result Zookeeper path need to load
 * @param {String} path   Current search config path
 * @param {Object} config Config object
 * @param {Array} keys    Config keys expected to be loaded
 * @param {String} objKey Config key expected to be loaded and overwritten parent value
 * @param {Number} depth Current search depth
 * @param rootObj
 * @private
 */
function extractConfig(result, path, config, keys, objKey, depth, rootObj) {
  depth++;
  /* istanbul ignore if */
  if (depth > MAX_DEPTH) return;
  _.forEach(config, function(v, k) {
    if (_.isString(v) && keys.indexOf(k.toLowerCase()) > -1) {
      let expr = '';
      if(config['zkOverride']){
        expr += 'if(_.isObject(val)){' +
          '  val = _.merge(val, configs' + path + '.zkOverride)' +
          '}' +
          'delete(configs' + path + '.zkOverride);';
      }
      if (k.toLowerCase() === objKey) {
        expr += 'delete(configs' + path + '.' + k + ');' +
          'if(_.isObject(val)){' +
          '  _.assign(configs' + path + ', val);' +
          '} else  { ' +
          '  configs' + path + ' = val;' +
          '}';
      } else {
        expr += 'configs' + path + '.' + k + ' = val;';
      }
      // Generate function to update config value
      (result[v] || (result[v] = [])).push(new Function('configs', 'val', '_', expr));
    } else if (_.isString(k) && k.trim()[0] !== '_') {
      if (_.isArray(v)) {
        extractArrayConfig(result, path + '.' + k, v, keys, objKey, depth, rootObj);
      } else if (_.isObject(v) && v !== rootObj) {
        extractConfig(result, path + '.' + k, v, keys, objKey, depth, rootObj);
      }
    }
  });
}

/**
 * Load config from zookeeper Synchronously
 *
 * @param {Object || Array} config Config object or array
 * @param {String} servers Zookeeper server list seperated by comma
 * @param {Array} keys Config keys expected to be loaded
 * @param {String} objKey Config key expected to be loaded and overwritten parent value. Defaults to `zkPath`. For example, config = {zkPath: '/test', c: 3}, if the value of path `/test` is {a: 1, b: 2}，config={a:0, b:1, c: 3}
 * @param {Number} timeout Timeout to load config
 * @param rootObj
 * @return {*} Config after updated
 */
module.exports = function loadConfig(config, servers, keys, objKey, timeout, rootObj) {
  objKey = objKey ? objKey.toLowerCase() : 'zkpath';
  keys = keys ? keys : objKey;
  keys = _.isArray(keys) ? keys.map(k => k.toLowerCase()) : [keys.toLowerCase()];
  keys.indexOf(objKey) < 0 && keys.push(objKey);
  let configs = _.isArray(config) ? config : [config];
  let inputs = {};
  extractArrayConfig(inputs, null, configs, keys, objKey, 0, rootObj);
  if (_.keys(inputs).length > 0) {
    let req = JSON.stringify({
      servers: servers,
      keys: _.keys(inputs)
    });
    debug('load-request: %s', req);
    let res = childProcess.spawnSync(process.execPath, [require.resolve('./worker.js')], {
      input: req,
      timeout: timeout
    });
    if (res.status !== 0) {
      throw new Error(res.stderr.toString());
    }
    if (res.error) {
      /* istanbul ignore next */
      if (typeof res.error === 'string') res.error = new Error(res.error);
      throw res.error;
    }
    let response = JSON.parse(res.stdout);
    if (response.success) {
      _.forEach(_.keys(response.data), function(key) {
        let v = response.data[key];
        _.forEach(inputs[key], function(f) {
          f(configs, v, _);
        });
      });
      if (response.warn && _.keys(response.warn).length > 0) {
        debug('load-warn: %j', response.warn);
      }
    } else {
      throw new Error(response.error.message || /* istanbul ignore next */ response.error || /* istanbul ignore next */ response);
    }
  }
  return config;
};
