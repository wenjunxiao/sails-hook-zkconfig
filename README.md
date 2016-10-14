# sails-hook-zkconfig

[![NPM version](https://img.shields.io/npm/v/sails-hook-zkconfig.svg?style=flat-square)](https://www.npmjs.com/package/sails-hook-zkconfig)
[![Build status](https://img.shields.io/travis/wenjunxiao/sails-hook-zkconfig.svg?style=flat-square)](https://travis-ci.org/wenjunxiao/sails-hook-zkconfig)
[![Test coverage](https://img.shields.io/coveralls/wenjunxiao/sails-hook-zkconfig.svg?style=flat-square)](https://coveralls.io/github/wenjunxiao/sails-hook-zkconfig)
[![Downloads](http://img.shields.io/npm/dm/sails-hook-zkconfig.svg?style=flat-square)](https://npmjs.org/package/sails-hook-zkconfig)

  Sails hook，load config from zookeeper synchronously.

## Install

```bash
$ npm install sails-hook-zkconfig --save
```

## Usage

  If some of configuration in your sails app need to be loaded from zookeeper, such as,
  connections of mysql or redis in ``config/connections.js`` or ``config/env/*.js``,
  just add zookeeper config in ``config/env/*.js``. Configuration will be updated from
  zookeeper automatically, before orm, service use.

  Put `zkPath` in your config to be updated from zookeeper, and value is zookeeper path.

  First, if config is json, such as, `redis` config `{"host": "127.0.0.1", "port": 6379}` stored in zookeeper path `/config/redis`.
```js
module.exports = {
  zkHost: '127.0.0.1:2181,192.168.1.1:2181', // Zookeeper hosts, seperated by comma
  redisServer: {
    zkPath: '/config/redis'  // Zookeeper path for redis
  },

  redisServers: [{
    db: 0,
    zkPath: '/config/redis'  // Zookeeper path for redis
  }, {
    db: 1,
    zkPath: '/config/redis' // Zookeeper path for redis
  }]
};
```
  Configuration after updated.
```js
module.exports = {
  zkHost: '127.0.0.1:2181,192.168.1.1:2181',
  redisServer: {
    host: '127.0.0.1',
    port: 6379
  },

  redisServers: [{
    db: 0,
    host: '127.0.0.1',
    port: 6379
  }, {
    db: 1,
    host: '127.0.0.1',
    port: 6379
  }]
};
```

  Second, config is plaintext, such as, '__my_secret_key__' stored in zookeeper path `/config/secret`.
```javascript
module.exports = {
  zkHost: '127.0.0.1:2181,192.168.1.1:2181',
  appKey1: '/config/secret',
  appKey2: {
    zkPath: '/config/secret'
  },
  zkKeys: ['appKey1']
};
```
  Configuration after updated.
```javascript
module.exports = {
  zkHost: '127.0.0.1:2181,192.168.1.1:2181',
  appKey1: '__my_secret_key__',
  appKey2: '__my_secret_key__',
  zkKeys: ['appKey1']
};
```
  Use `zkKeys` to specify the key need to updated and the key's value is zookeeper path,
  it is the difference with `zkPath` is that the value just set to the key and won't be assigned to parent.
  `zkKeys`

## Configuration

  Change the default configuration by adding ``config/zkConfig.js`` under your sails project.
```js
module.exports.zkConfig = {
  timeout: 30000, // Get config timeout
  enabled: true, // Enable zkConfig. Defaults to `true`
  zkKeys: ['appKey1'], // Keys to be updated.
  zkObjKey: 'zkPath', // Change the default `zkPath`
  zkHost: '127.0.0.1:2181,192.168.0.1:2181' // Zookeeper server list
};
```
  You can also config ``zkKeys`` as follow
```javascript
module.exports.zkConfig = {
  zkKeys: {appKey1: '/config/same/key1', appKey2: '/config/same/key2'}
};
```
  or more complex config
```javascript
module.exports.zkConfig = {
  zkKeys: ['appKey1', {appKey2: '/config/same/key2'}]
};
```