'use strict';

const _ = require('lodash');
const sinon = require('sinon');
const fs = require('fs');
const events = require('events');
const childProcess = require('child_process');
const zookeeper = require('node-zookeeper-client');
const watch = require('../../lib/watch');
const load = require('../../lib/load');

describe('Watch config', function () {
  const data = {
    '/test/path': '123456'
  };
  let fakeChild = {
    status: 0,
    stderr: null,
    stdout: JSON.stringify({
      success: true,
      data: data,
      warn: {}
    })
  };
  let setData;
  before(function () {
    sinon.stub(childProcess, 'spawnSync', function () {
      return fakeChild;
    });
    sinon.stub(zookeeper, 'createClient', function () {
      let client = new events.EventEmitter();
      let watchers = {};
      client.getData = function (key, watch) {
        watchers[key] = watch;
        let callback = arguments[arguments.length - 1];
        let v = data[key];
        if (v !== undefined) {
          try {
            v = Buffer.from(v);
          } catch (err) {
            v = Buffer.from((v === null ? '' : v).toString());
          }
          callback(null, v, {}); //callback(error, data, stat)
        } else {
          callback(new Error('NO_NODE[-101]'));
        }
      };
      client.connect = function () {
        client.emit('connected');
      };
      setData = (key, val)=>{
        data[key] = val;
        watchers[key] && watchers[key]({path: key});
      };
      return client;
    });
  });

  after(function () {
    childProcess.spawnSync.restore();
    zookeeper.createClient.restore();
  });

  beforeEach(function () {

  });

  it('watch disabled', function () {
    watch('', {}, {}, {}).should.eql(false);
  });

  describe('watch enabled', ()=>{
    it('watch plain value', function (done) {
      watch('127.0.0.1:2181', {test: {path: '/test/path'}}, {
        '/test/path': [()=> {}]
      }, {enabled: true, watch: (data)=>{
        data.should.eql('new_value');
        done();
      }}).should.eql(true);
      setData('/test/path', 'new_value');
    });

    it('watch object value', function (done) {
      let val = {data: 'new'};
      let cb = ()=>{};
      cb.watch = (data)=>{
        data.should.eql(val);
      };
      cb.decoder = JSON.parse
      watch('127.0.0.1:2181', {test: {path: '/test/path'}}, {
        '/test/path': [cb]
      }, {enabled: true, watch: (data)=>{
        data.should.eql(val);
        done();
      }}).should.eql(true);
      setData('/test/path', JSON.stringify(val));
    });
    it('watch cache config changed', function (done) {
      fakeChild.stdout = JSON.stringify({
        success: true,
        data: {
          '/test/path1': '__value_to_watch__'
        },
        warn: {}
      });
      let localConf = [{
        secret: '/test/path1'
      }];
      let expectConf = [{
        secret: '__value_to_watch__'
      }];
      load(localConf, 'servers', 'secret', null, 0, null, {
        enabled: true,
        load(){
          return {
            '/test/path1': '__value_to_watch__'
          }
        },
        fullPath(){
          return '/'
        },
        save(){

        }
      }, {enabled: true, watch: (data)=>{
        data.should.eql('__value_to_change__');
        done();
      }}).should.eql(expectConf);
      setData('/test/path1', '__value_to_watch__');
      setData('/test/path1', '__value_to_change__');
    });
  });
});
