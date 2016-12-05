'use strict';

const _ = require('lodash');
const sinon = require('sinon');
const childProcess = require('child_process');
const load = require('../../lib/load');

describe('Synchronous loading of zookeeper config', function() {
  let fakeChild = {};

  before(function() {
    sinon.stub(childProcess, 'spawnSync', function() {
      return fakeChild;
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

  it('No config needs to be loaded', function() {
    fakeChild.stdout = JSON.stringify({
      success: true,
      data: {},
      warn: {}
    });
    let localConf = [{
      secret: '_use_local_value_',
      other: '_other_local_value_'
    }];
    load(localConf, 'servers', []).should.eql(localConf);
  });

  it('Config to be loaded not exists', function() {
    fakeChild.stdout = JSON.stringify({
      success: true,
      data: {},
      warn: {
        '/test/path': 'does not exist'
      }
    });
    let localConf = {
      secret: '/test/path',
      other: '_other_local_value_'
    };
    load(localConf, 'servers', 'secret').should.eql(localConf);
  });

  it('Load config process exit error', function() {
    fakeChild.status = 1;
    fakeChild.stderr = 'Unknown';
    let localConf = {
      secret: '/test/path',
      other: '_other_local_value_'
    };
    (function() {
      load(localConf, 'servers', ['secret'], 'zkPath');
    }).should.throw();
  });

  it('Load config error', function() {
    fakeChild.error = 'Unknown';
    let localConf = {
      secret: '/test/path',
      other: '_other_local_value_'
    };
    (function() {
      load(localConf, 'servers', ['secret']);
    }).should.throw();
  });

  it('Load config failed', function() {
    fakeChild.stdout = JSON.stringify({
      success: false,
      data: {},
      warn: {},
      error: {
        message: 'Unknown'
      }
    });
    let localConf = {
      secret: '/test/path',
      other: '_other_local_value_'
    };
    (function() {
      load(localConf, 'servers', ['secret']);
    }).should.throw();
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

  it('zkPath plaintext', function() {
    let remoteConf = '__my_app_secret__';
    fakeChild.stdout = JSON.stringify({
      success: true,
      data: {
        '/test/path': remoteConf
      },
      warn: {}
    });
    let localConf = {
      secret: {
        zkPath: '/test/path'
      },
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
    let rootObj = console;
    let localConf = {
      secret: '/test/secret',
      redis: {
        zkPath: '/test/redis',
        other: '_other_local_value_'
      },
      redisList: [{
        zkPath: '/test/redis',
        db: 0
      }, {
        zkPath: '/test/redis',
        db: 1
      }],
      complex: [
        [], {
          key: ''
        },
        rootObj
      ],
      other: '_other_local_value_',
      _ignore: '/test/ignore/path'
    };
    load(localConf, 'servers', ['secret'], 'zkPath', 10, rootObj).should.eql(_.assign(localConf, remoteConf1, {
      secret: remoteConf2,
      redis: _.omit(localConf.redis, 'zkPath'),
      redisList: [_.assign({
        db: 0
      }, remoteConf1), _.assign({
        db: 1
      }, remoteConf1)]
    }));
  });

  it('zkOverride', function() {
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
      other: '_other_local_value_',
      zkOverride: {
        host: '0.0.0.0'
      }
    };
    load(localConf, 'servers').should.eql(_.assign(_.omit(localConf, 'zkPath'), remoteConf, {
      host: '0.0.0.0'
    }));
  });

});
