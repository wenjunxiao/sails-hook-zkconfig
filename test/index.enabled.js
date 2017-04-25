'use strict';

const rewire = require('rewire');
const Sails = require('sails').Sails;

describe('Enable hook tests ::', function() {
  let sails;

  before(function(done) {
    Sails().lift({
      hooks: {
        // Load the hook
        'zkconfig': require('../'),
        // Skip grunt (unless your hook uses it)
        'grunt': false
      },
      log: {
        level: 'error'
      },
      zkConfig: {
        timeout: 10,
        zkHost: ['127.0.0.1:2181'],
        zkKeys: '',
        before: ()=>{

        }
      },
      key1: '',
      port: '0'
    }, function(err, _sails) {
      if (err) return done(err);
      sails = _sails;
      return done();
    });
  });

  after(function(done) {
    // Lower Sails (if it successfully lifted)
    if (sails) {
      return sails.lower(done);
    }
    return done();
  });

  it('sails load hook and does not crash', function() {
    return true;
  });

  it('Config hosts', function() {
    let lib = rewire('../index.js');
    let hostsToString = lib.__get__('hostsToString');
    hostsToString(['127.0.0.1:2181', '192.168.0.1:2181']).should.be.equal('127.0.0.1:2181,192.168.0.1:2181');
    hostsToString('127.0.0.1:2181,192.168.0.1:2181').should.be.equal('127.0.0.1:2181,192.168.0.1:2181');
    return true;
  });

  it('Config keys', function() {
    let lib = rewire('../index.js');
    let keysToArray = lib.__get__('keysToArray');
    keysToArray(['key1', 'key2', []]).should.be.instanceof(Array).and.containDeep(['key1', 'key2']);
    keysToArray('key1,key2').should.be.instanceof(Array).and.containDeep(['key1', 'key2']);
    keysToArray({
      key1: '',
      key2: ''
    }).should.be.instanceof(Array).and.containDeep(['key1', 'key2']);
    return true;
  });

  describe('Watch sails config changed by zookeeper', function() {

    it('watch clear config path change', function(done) {
      let lib = rewire('../index.js');
      let watchConfig = lib.__get__('watchConfig');
      let zkWatch = lib.__get__('zkWatch');
      watchConfig('sails.config.test.path', (val)=>{
        val.should.eql('value_changed');
        done();
      });
      zkWatch('value_changed', '/test/path', '.test.path');
    });

    it('watch blurry config path change', function(done) {
      let lib = rewire('../index.js');
      let watchConfig = lib.__get__('watchConfig');
      let zkWatch = lib.__get__('zkWatch');
      watchConfig(['sails.config.test', 'sails.config.test1'], (val)=>{
        val.should.eql('value_changed');
        done();
      });
      zkWatch('value_changed', '/test/path', '.test.path');
    });

    it('cancel watch config by key', function() {
      let lib = rewire('../index.js');
      let listeners = lib.__get__('listeners');
      let watchConfig = lib.__get__('watchConfig');
      let removeConfigWatcher = lib.__get__('removeConfigWatcher');
      let zkWatch = lib.__get__('zkWatch');
      watchConfig(['sails.config.test', 'sails.config.test1'], (val)=>{});
      Object.keys(listeners).length.should.eql(2);
      removeConfigWatcher(['sails.config.test', 'sails.config.test1']);
      Object.keys(listeners).length.should.eql(0);
    });

    it('cancel watch config by cb', function() {
      let lib = rewire('../index.js');
      let listeners = lib.__get__('listeners');
      let watchConfig = lib.__get__('watchConfig');
      let removeConfigWatcher = lib.__get__('removeConfigWatcher');
      let zkWatch = lib.__get__('zkWatch');
      let cb = (val)=>{};
      watchConfig('sails.config.test', cb);
      watchConfig('sails.config.test1', ()=>{});
      Object.keys(listeners).length.should.eql(2);
      removeConfigWatcher('sails.config.test', cb);
      removeConfigWatcher('sails.config.test1', cb);
      Object.keys(listeners).length.should.eql(1);
    });
  });
});
