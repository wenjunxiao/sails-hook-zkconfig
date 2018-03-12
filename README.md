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
  `zkKeys`.

  When use `zkPath` and the value is json object, there is a way to override some key's value. Such as,
  `/config/mysql` set as `{"adapter": "sails-mysql", "host": "127.0.0.1", "database": "test"}`, and want to
  use a special adapter `sails-mysql-override` in one project.
```javascript
module.exports = {
  mysql: {
    zkPath: '/config/mysql',
    zkOverride: {
      adapter: 'sails-mysql-override'
    }
  }
};
```
  Configuration after updated.
```javascript
module.exports = {
  mysql: {
   adapter: 'sails-mysql-override',
   host: '127.0.0.1',
   database: 'test'
  }
};
```
  Use `zkDefault` to specify default config.
```js
module.exports = {
  mysql: {
    zkPath: '/config/mysql',
    zkDefault: {
      adapter: 'sails-mysql-default',
      password: 'default_pwd'
    }
  },
  secret: {
    zkPath: '/config/secret',
    zkDefault: '__this_is_default_secret__'
  }
};
```
  Configuration after updated when `/config/mysql` set as `{"host": "127.0.0.1", database: "test"}`.
```javascript
module.exports = {
  mysql: {
   adapter: 'sails-mysql-default',
   host: '127.0.0.1',
   database: 'test',
   password: 'default_pwd'
  },
  secret: '__this_is_default_secret__'
};
```
  Of course, you can also use hook in `zkConfig.js` to change key value before/after load.

  Use `zkRequired` to check if the config exists.
```js
module.exports = {
  mysql: {
   zkPath: '/config/mysql',
   zkRequired: true // Or `production` to check only in production environment
  },
  secret: '__this_is_default_secret__'
};
```

  Use `zkIgnore` to skip config key.
```js
module.exports = {
  mysql: {
   zkPath: '/config/mysql',
   zkIgnore: true
  }
};
```

## Configuration

  Change the default configuration by adding ``config/zkConfig.js`` under your sails project.
```js
module.exports.zkConfig = {
  timeout: 30000, // Get config timeout
  enabled: true, // Enable zkConfig. Defaults to `true`
  zkKeys: ['appKey1'], // Keys to be updated.
  zkObjKey: 'zkPath', // Change the default `zkPath`
  zkHost: '127.0.0.1:2181,192.168.0.1:2181', // Zookeeper server list,
  before: function(config) { // hook before load config from zookeeper

  },
  after: function(config){ // hook after load config from zookeeper

  }
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

## Cache

  Cache config when load successfully, and then load config from cache when failed to load config,
  or load from cache directly when cache not expire.
```javascript
module.exports.zkConfig = {
  zkCache: {
    enabled: false, // default false
    expire: 0, // Cache expire time, load from cache when cache not epire.
    directory: process.env.HOME, // where cache to store
    filename: '', // cache filename
    secret: '' // encryption key
  }
};
```

## Watcher

  Watch config changes when load successfully. Watch in `zkConfig`.
```javascript
module.exports.zkConfig = {
  zkWatcher: {
    enabled: false, // default false
    watch: (data, path)=>{

    }
  }
};
```

  You can also use `zkWatch` with `zkPath` at anywhere.
```javascript
module.exports = {
  mysql: {
    zkPath: '/config/mysql',
    zkWatch: (data, path)=>{

    }
  }
};
```

  Also you can use `sails.watchConfig(configPath, callback)`. For example, reload orm when connections are changed.
```javascript
module.exports.bootstrap = function(cb) {
  sails.watchConfig('sails.config.connections', ()=>{
    sails.hooks.orm.reload();
  });
  cb();
};
```

## API

### `sails.watchConfig(paths: string| Array.<string>, callback)`

```javascript
sails.watchConfig('sails.config.connections', ()=>{ // watch any changes in or under sails.config.connections
  sails.hooks.orm.reload();
});

sails.watchConfig('sails.config.redis1', ()=>{ // only watch changes in sails.config.redis1
  // reconnect redis1
});

sails.watchConfig(['sails.config.connections', 'sails.config.redis1'], ()=>{
});
```

### `sails.removeConfigWatcher(paths: string| Array.<string> [, callback])`

  Remove the watchers of the path(s). if a `callback` is specified, only remove the callback related watcher.

```javascript
const cb = ()=>{};
sails.watchConfig('sails.config.connections', cb);
sails.watchConfig('sails.config.redis1', ()=>{

});

// All are removed.
sails.removeConfigWatcher(['sails.config.connections', 'sails.config.redis1']);

// Only `sails.config.connections` is removed
sails.removeConfigWatcher(['sails.config.connections', 'sails.config.redis1'], cb);
```