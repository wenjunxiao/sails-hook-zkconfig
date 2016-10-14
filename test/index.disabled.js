'use strict';

const Sails = require('sails').Sails;

describe('Disable hook tests ::', function() {
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
        enabled: false
      }
    }, function(err, _sails) {
      if (err) return done(err);
      // console.log("_sails=====>", _sails.config);
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

});
