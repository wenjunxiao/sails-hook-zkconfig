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
        zkKeys: ''
      },
      key1: ''
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
});
