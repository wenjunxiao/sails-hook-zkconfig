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
   * 启用缓存
   */
  enabled: false,
  /**
   * 缓存目录
   */
  directory: process.env.HOME,
  /**
   * 缓存文件
   */
  filename: '.sails.zk.' + md5(__dirname),
  /**
   * 加密密钥
   */
  secret: ()=> '__sails_zk_config__',
  /**
   * 加载缓存
   * @returns {*}
   */
  load: function () {
    return this.decrypt(fs.readFileSync(path.join(execProp(this.directory, this), execProp(this.filename, this))));
  },
  /**
   * 保存到缓存
   * @param data
   */
  save: function (data) {
    fs.writeFileSync(path.join(execProp(this.directory, this), execProp(this.filename, this)), this.encrypt(data));
  },
  /**
   * 加密缓存数据
   * @param {{}} data
   * @returns {Progress|*|Object}
   */
  encrypt: function (data) {
    let cipher = crypto.createCipher('des3', execProp(this.secret, this));
    let crypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
  },
  /**
   * 解密缓存数据
   * @param data
   * @returns {{}}
   */
  decrypt: function (data) {
    data = data.toString();
    let decipher = crypto.createDecipher('des3', execProp(this.secret, this));
    let dec = decipher.update(data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return JSON.parse(dec);
  }
};
