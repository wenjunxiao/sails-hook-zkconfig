'use strict';
/**
 * Work process to load zookeeper config
 * @author Wenjun Xiao
 */

const co = require('co');
const pify = require('promise.ify');
const zookeeper = require('./file').wrap(require('node-zookeeper-client'));
const concat = require('concat-stream');

function respond(data) {
  process.stdout.write(JSON.stringify(data), function() {
    process.exit(0);
  });
}

const initClient = (servers) => {
  let client = zookeeper.createClient(servers);
  client.ready = () => new Promise(resolve => {
    client.on('connected', resolve);
    client.connect();
  });
  client.address = () => {
    try {
      return client.connectionManager.socket.address();
    } catch (err) {
      return {
        address: null,
        port: 0
      };
    }
  };
  client.getDataAsync = pify(client.getData);
  return client;
};

process.stdin.pipe(concat(function(stdin) {
  let req = JSON.parse(stdin.toString());
  co(function*() {
    let client = initClient(req.servers);
    yield client.ready();
    let data = {};
    let warn = {};
    let address = client.address();
    let vars = {
      '$ip': address.address,
      '$port': address.port,
      '$address': address.address
    };
    for (let key of req.keys) {
      try {
        if (key in vars) {
          data[key] = vars[key];
        } else {
          data[key] = (yield client.getDataAsync(key))[0].toString('utf-8');
        }
      } catch (err) {
        warn[key] = err.stack || err.toString();
      }
    }
    respond({
      success: true,
      data: data,
      warn: warn
    });
  }).catch(err => respond({
    sucess: false,
    error: {
      message: err.stack || err.toString()
    }
  }));
}));
