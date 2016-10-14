'use strict';
/**
 * wrapper for child process of loading worker
 * @author Wenjun Xiao
 */

const events = require('events');
const sinon = require('sinon');
const zookeeper = require('node-zookeeper-client');

function filterExpectData() {
  let data = {};
  let expected;
  // mocha createClient to return test data
  sinon.stub(zookeeper, 'createClient', function() {
    if (expected && expected.error) throw new Error(expected.error);
    let client = new events.EventEmitter();
    client.getData = function(key) {
      let callback = arguments[arguments.length - 1];
      let v = data[key];
      if (v !== undefined) {
        try {
          v = Buffer.from(JSON.stringify(v));
        } catch (err) {
          v = Buffer.from((v === null ? '' : v).toString());
        }
        callback(null, v, {}); //callback(error, data, stat)
      } else {
        callback(new Error('NO_NODE[-101]'));
      }
    };
    client.connect = function() {
      client.emit('connected');
    };
    return client;
  });

  process.stdin.once('readable', () => {
    let s = process.stdin.read(8).toString();
    let bufSize = Buffer.from(s, 'hex').readInt32BE();
    expected = JSON.parse(process.stdin.read(bufSize));
    if (expected.status === 0) {
      data = JSON.parse(expected.stdout).data;
      require('../../lib/worker.js');
    } else {
      process.stderr.write(expected.stderr || '', function() {
        process.exit(expected.status);
      });
    }
  });
}

if (!module.parent) {
  filterExpectData();
}
