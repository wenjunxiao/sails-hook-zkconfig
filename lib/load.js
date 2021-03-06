'use strict';

const _ = require('lodash');
const childProcess = require('child_process');
const debug = require('debug')('sails:hook:zkConfig.load');
const watch = require('./watch');
const MAX_DEPTH = 20;

function decoder(v) {
  try {
    return JSON.parse(v);
  } catch (_) {
    return v;
  }
}

function parseResponse(data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    err.message = err.message + ':' + data;
    throw err;
  }
}

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
 * @param zkBase
 * @private
 */
function extractArrayConfig(result, path, configs, keys, objKey, depth, rootObj, zkBase) {
  depth++;
  /* istanbul ignore if */
  if (depth > MAX_DEPTH) return;
  let parentPath = path ? path : '';
  _.forEach(configs, function (config, index) {
    path = parentPath + '[' + index + ']';
    if (_.isArray(config)) {
      extractArrayConfig(result, path, config, keys, objKey, depth, rootObj, zkBase);
    } else if (_.isObject(config) && config !== rootObj) {
      extractConfig(result, path, config, keys, objKey, depth, rootObj, zkBase);
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
 * @param zkBase
 * @private
 */
function extractConfig(result, path, config, keys, objKey, depth, rootObj, zkBase) {
  depth++;
  /* istanbul ignore if */
  if (depth > MAX_DEPTH) return;
  /* istanbul ignore if */
  if (isIgnore(config['zkIgnore'])) {
    const delKeys = ['zkIgnore', 'zkDefault', 'zkOverride', 'zkDecoder', 'zkRequired', 'zkWatch', objKey].reduce((r, key)=> {
      r[key.toLowerCase()] = true;
      return r;
    }, {});
    Object.keys(config).forEach(key=> {
      if (delKeys[key.toLowerCase()]) {
        delete config[key];
      }
    });
    return;
  }
  delete config['zkIgnore'];
  _.forEach(config, function (v, k) {
    if (_.isString(v) && keys.indexOf(k.toLowerCase()) > -1) {
      let expr = '';
      if (config['zkDefault']) {
        expr += 'if(_.isObject(configs' + path + '.zkDefault)){' +
          '  val = _.merge(configs' + path + '.zkDefault, val);' +
          '} else if(val === undefined){' +
          '  val = configs' + path + '.zkDefault;' +
          '}' +
          'delete(configs' + path + '.zkDefault);';
      }
      if (config['zkOverride']) {
        expr += 'if(_.isObject(val)){' +
          '  val = _.merge(val, configs' + path + '.zkOverride)' +
          '}' +
          'delete(configs' + path + '.zkOverride);';
      }
      expr += 'if (after) {' +
        '  val = after(val);' +
        '}';
      if (k.toLowerCase() === objKey) {
        expr += 'delete(configs' + path + '.' + k + ');' +
          'if(_.isObject(val)){' +
          '  _.assign(configs' + path + ', val);' +
          '} else if(val !== undefined && val !== null) { ' +
          '  configs' + path + ' = val;' +
          '}';
      } else {
        expr += 'configs' + path + '.' + k + ' = val;';
      }
      expr += `  return '${path}'`;
      // Generate function to update config value
      let fn = new Function('configs', 'val', '_', 'after', expr);
      fn.path = path;
      fn.watch = config['zkWatch'];
      fn.init = config['zkInit'];
      fn.reload = config['zkReload'];
      fn.decoder = config['zkDecoder'] || decoder;
      fn.after = config['zkAfter'];
      fn.required = isRequired(config['zkRequired']) && !config['zkDefault'];
      fn.dependencies = config['zkDependencies'] || [];
      delete(config['zkWatch']);
      delete(config['zkRequired']);
      delete(config['zkDecoder']);
      delete(config['zkAfter']);
      delete(config['zkInit']);
      delete(config['zkReload']);
      delete(config['zkDependencies']);
      if (v[0] !== '/' && v[0] !== '$') v = zkBase + v;
      (result[v] || (result[v] = [])).push(fn);
      for(let dep of fn.dependencies) {
        /* istanbul ignore next */
        if (dep[0] !== '/' && dep[0] !== '$') dep = zkBase + dep;
        /* istanbul ignore else */
        if (!result[dep]) {
          result[dep] = [];
        }
      }
    } else if (_.isString(k) && k.trim()[0] !== '_') {
      if (_.isArray(v)) {
        extractArrayConfig(result, path + '.' + k, v, keys, objKey, depth, rootObj, zkBase);
      } else if (_.isObject(v) && v !== rootObj) {
        extractConfig(result, path + '.' + k, v, keys, objKey, depth, rootObj, zkBase);
      }
    }
  });
}

function isIgnore(zkIgnore) {
  if (zkIgnore === true) {
    return true;
  } else if (zkIgnore && /^(!)?(.+)$/.test(zkIgnore)) {
    let op = RegExp.$1;
    let env = RegExp.$2;
    return !!((env === process.env.NODE_ENV) ^ (op === '!'));
  }
}

/**
 * Check is required
 * @param zkRequired
 * @returns {boolean}
 */
function isRequired(zkRequired) {
  return zkRequired === true || zkRequired === process.env.NODE_ENV;
}

/**
 * Update changes to cache.
 * @param config
 * @param cache
 */
function wrapWatchWithCache(config, cache) {
  if (config && cache) {
    let _watch = config.watch;
    config.watch = function (val, key) {
      let data = cache.load.call(cache);
      data[key] = val;
      debug('update-cache: %s', cache.fullPath.call(cache));
      data['__zk_cache_time__'] = Date.now();
      cache.save.call(cache, data);
      return _watch && _watch.apply(this, arguments);
    };
  }
}

function loadFromServer(servers, inputs, timeout) {
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
  /* istanbul ignore if */
  if (res.stderr && res.stderr.length > 0) {
    console.error(res.stderr.toString('utf-8'));
  }
  let response = parseResponse(res.stdout);
  if (response.success) {
    if (response.warn && _.keys(response.warn).length > 0) {
      debug('load-warn: %j', response.warn);
      let inits = {};
      for(let key in response.warn) {
        for(let fn of inputs[key]) {
          if (fn.init) {
            let deps = fn.dependencies.map(k => response.data[k]);
            inits[key] = fn.init(deps, response.data);
          }
        }
      }
      if (_.keys(inits).length > 0) {
        let res1 = childProcess.spawnSync(process.execPath, [require.resolve('./worker.js')], {
          input: JSON.stringify({
            servers,
            inits
          }),
          timeout: timeout
        });
        let rsp1 = parseResponse(res1.stdout);
        if (rsp1.success && rsp1.data) {
          for(let key in rsp1.data) {
            response.data[key] = rsp1.data[key];
            delete response.warn[key];
          }
        }
      }
    }
    return response.data;
  } else {
    throw new Error(response.error.message || /* istanbul ignore next */ response.error || /* istanbul ignore next */ response);
  }
}

/**
 * Load config from zookeeper Synchronously
 *
 * @param {Object || Array} config Config object or array
 * @param {String} servers Zookeeper server list seperated by comma
 * @param {Array|String} keys Config keys expected to be loaded
 * @param {String} objKey Config key expected to be loaded and overwritten parent value. Defaults to `zkPath`. For example, config = {zkPath: '/test', c: 3}, if the value of path `/test` is {a: 1, b: 2}，config={a:0, b:1, c: 3}
 * @param {Number} timeout Timeout to load config
 * @param rootObj
 * @param cache
 * @param watchConfig
 * @param zkBase
 * @param reloader
 * @return {*} Config after updated
 */
module.exports = function loadConfig(config, servers, keys, objKey, timeout, rootObj, cache, watchConfig, zkBase, reloader) {
  objKey = objKey ? objKey.toLowerCase() : 'zkpath';
  keys = keys ? keys : objKey;
  keys = _.isArray(keys) ? keys.map(k => k.toLowerCase()) : [keys.toLowerCase()];
  keys.indexOf(objKey) < 0 && keys.push(objKey);
  let inputs = {};
  const extract = {true: extractArrayConfig, false: extractConfig}[_.isArray(config)];
  extract(inputs, '', config, keys, objKey, 0, rootObj, zkBase);
  if (_.keys(inputs).length > 0) {
    let data;
    if (cache && cache.enabled) { // 启用缓存
      debug('load-from-cache: %s', cache.fullPath.call(cache));
      data = cache.load.call(cache);
      wrapWatchWithCache(watchConfig, cache);
    }
    if (!data || Date.now() - data['__zk_cache_time__'] > cache.expire) {
      try {
        data = loadFromServer(servers, inputs, timeout);
        if (cache && cache.enabled) {
          debug('save-to-cache: %s', cache.fullPath.call(cache));
          data['__zk_cache_time__'] = Date.now();
          cache.save.call(cache, data);
        }
      } catch (err) {
        debug('load-error: %j', err);
        if (data) { // 启用缓存
          debug('use-expire-cache: %s', Date.now(), data['__zk_cache_time__']);
        } else {
          throw err;
        }
      }
    } else {
      debug('use-valid-cache: %s', Date.now(), data['__zk_cache_time__']);
    }
    _.forEach(_.keys(inputs), function (key) {
      let v = data[key];
      _.forEach(inputs[key], function (f) {
        if (v === undefined && f.required) {
          throw {code: 'MISSING', message: 'Missing required config "' + key + '"'};
        }
        f(config, f.decoder(v), _, f.after);
        /* istanbul ignore next */
        if (reloader && f.reload) {
          reloader.register(f, key);
        }
      });
      /* istanbul ignore next */
      if (key[0] === '$') {
        delete inputs[key];
      }
    });
    watch(servers, config, inputs, watchConfig);
  }
  return config;
};
module.exports.parseResponse = parseResponse;