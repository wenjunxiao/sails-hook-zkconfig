'use strict';

const _ = require('lodash');
const sinon = require('sinon');
const childProcess = require('child_process');
const load = require('../../lib/load');

describe('ChildProcess to load zookeeper config', function() {
  let fakeChild = {};

  before(function() {
    let spawnSync = childProcess.spawnSync;
    sinon.stub(childProcess, 'spawnSync', function() {
      let args = [].slice.call(arguments);
      args[1][0] = __dirname + '/worker_wrapper.js';
      let buf = JSON.stringify(fakeChild);
      let head = Buffer.alloc(4);
      head.writeInt32BE(buf.length);
      args[2]['input'] = head.toString('hex') + buf + args[2]['input'];
      return spawnSync.apply(null, args);
    });
  });

  after(function() {
    childProcess.spawnSync.restore();
  });

  beforeEach(function() {
    fakeChild = {
      status: 0,
      stderr: null,
      stdout: '{}'
    };
  });

  it('zkPath json', function() {
    let remoteConf = {
      host: '127.0.0.1',
      port: '6666',
      pwd: 'xxxxx'
    };
    fakeChild.stdout = JSON.stringify({
      success: true,
      data: {
        '/test/path': remoteConf
      },
      warn: {}
    });
    let localConf = {
      zkPath: '/test/path',
      other: '_other_local_value_'
    };
    load(localConf, 'servers').should.eql(_.assign(_.omit(localConf, 'zkPath'), remoteConf));
  });

  it('zkKeys', function() {
    let remoteConf = '__my_app_secret__';
    fakeChild.stdout = JSON.stringify({
      success: true,
      data: {
        '/test/path': remoteConf
      },
      warn: {}
    });
    let localConf = {
      secret: '/test/path',
      other: '_other_local_value_'
    };
    load(localConf, 'servers', ['secret']).should.eql(_.assign(localConf, {
      secret: remoteConf
    }));
  });

  it('mix zkPath and zkKeys', function() {
    let remoteConf1 = {
      host: '127.0.0.1',
      port: '6666',
      pwd: 'xxxxx'
    };
    let remoteConf2 = '__my_app_secret__';
    fakeChild.stdout = JSON.stringify({
      success: true,
      data: {
        '/test/redis': remoteConf1,
        '/test/secret': remoteConf2
      },
      warn: {}
    });
    let localConf = {
      secret: '/test/secret',
      redis: {
        zkPath: '/test/redis',
        other: '_other_local_value_'
      },
      other: '_other_local_value_'
    };
    load(localConf, 'servers', ['secret']).should.eql(_.assign(localConf, remoteConf1, {
      secret: remoteConf2,
      redis: _.omit(localConf.redis, 'zkPath')
    }));
  });

  it('load config error', function() {
    fakeChild.error = 'Unknown';
    let localConf = {
      secret: '/test/path',
      other: '_other_local_value_'
    };
    (function() {
      load(localConf, 'servers', ['secret']);
    }).should.throw();
  });
});
