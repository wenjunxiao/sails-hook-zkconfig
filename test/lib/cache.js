'use strict';

const _ = require('lodash');
const sinon = require('sinon');
const fs = require('fs');
const childProcess = require('child_process');
const cache = require('../../lib/cache');
const load = require('../../lib/load');

describe('Cache config', function () {
  let fakeChild = {
    status: 0,
    stderr: null,
    stdout: '{"error": {"message": "cache..."}}'
  };
  let cahcedData;
  before(function () {
    cache.enabled = true;
    sinon.stub(childProcess, 'spawnSync', function () {
      return fakeChild;
    });
    sinon.stub(fs, 'writeFileSync', function (filename, data) {
      cahcedData = data;
    });
    sinon.stub(fs, 'readFileSync', function () {
      return cahcedData;
    });
  });

  after(function () {
    cache.enabled = false;
    fs.writeFileSync.restore();
    fs.readFileSync.restore();
    childProcess.spawnSync.restore();
  });

  beforeEach(function () {
    fakeChild = {
      status: 0,
      stderr: null,
      stdout: '{"error": {"message": "cache..."}}'
    };
  });

  it('cache config loaded', function () {
    fakeChild.stdout = JSON.stringify({
      success: true,
      data: {
        '/test/path': '__value_to_cache__'
      },
      warn: {}
    });
    let localConf = [{
      secret: '/test/path'
    }];
    let expectConf = [{
      secret: '__value_to_cache__'
    }];
    load(localConf, 'servers', 'secret', null, 0, null, cache).should.eql(expectConf);
  });

  it('load config from expire cache', function () {
    fakeChild.stdout = JSON.stringify({
      success: false,
      data: {},
      error: {
        message: 'cache...'
      }
    });
    let localConf = {
      secret: '/test/path'
    };
    let expectConf = _.assign({}, localConf, {secret: '__value_to_cache__'});
    load(localConf, 'servers', 'secret', null, 0, null, cache).should.eql(expectConf);
  });

  it('load config from cache', function () {
    cache.expire = 60 * 1000;
    fakeChild.stdout = JSON.stringify({
      success: false,
      data: {},
      error: {
        message: 'cache...'
      }
    });
    let localConf = {
      secret: '/test/path'
    };
    let expectConf = _.assign({}, localConf, {secret: '__value_to_cache__'});
    load(localConf, 'servers', 'secret', null, 0, null, cache).should.eql(expectConf);
  });
});
