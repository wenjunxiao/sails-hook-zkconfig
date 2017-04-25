/*global JSON*/
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');

function md5(s) {
  return crypto
    .createHash('md5')
    .update(s, 'utf8')
    .digest('hex');
}

function execProp(key, ctx) {
  if (_.isFunction(key)) {
    return key.call(ctx);
  }
  return key;
}

module.exports = {
  /**
   * Enable cache
   */
  enabled: false,
  /**
   * Expire time. Default 0, expire immediately.
   */
  expire: 0,
  /**
   * Where to store cahce data.
   */
  directory: process.env.HOME,
  /**
   * Cache filename.
   */
  filename: '.sails.zk.' + md5(__dirname),
  /**
   * Full path of cache file.
   */
  fullPath: function () {
    return path.join(execProp(this.directory, this), execProp(this.filename, this));
  },
  /**
   * Encryption and decryption key.
   */
  secret: ()=> '__sails_zk_config__',
  /**
   * Load from cache.
   * @returns {*}
   */
  load: function () {
    return this.decrypt(fs.readFileSync(path.join(execProp(this.directory, this), execProp(this.filename, this))));
  },
  /**
   * Save to cache.
   * @param data
   */
  save: function (data) {
    fs.writeFileSync(path.join(execProp(this.directory, this), execProp(this.filename, this)), this.encrypt(data));
  },
  /**
   * Encrypt the cache data
   * @param {{}} data
   * @returns {Progress|*|Object}
   */
  encrypt: function (data) {
    let cipher = crypto.createCipher('des3', execProp(this.secret, this));
    let crypted = cipher.update(JSON.stringify(data || ''), 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
  },
  /**
   * Decrypt the cache data
   * @param data
   * @returns {{}}
   */
  decrypt: function (data) {
    if (!data) return data;
    data = data.toString();
    let decipher = crypto.createDecipher('des3', execProp(this.secret, this));
    let dec = decipher.update(data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return JSON.parse(dec);
  }
};
