var config  = require('./../config.json');
var WhiplashAuth = require('whiplash');
var request = require('request');
var Q = require('q');
var async = require('async');

function Whiplash() {}

// The earliest order number that polling and syncing is compatible with
Whiplash.prototype.sinceOrder = 332390;

// Order status values
Whiplash.prototype.orderStatus = {
  'quote': 35,
  'cancelled': 40,
  'closed by originator': 45,
  'unpaid': 50,
  'pending return': 75,
  'items unavailable': 80,
  'paused': 90,
  'unassignable': 95,
  'processing': 100,
  'printed': 120,
  'picked': 150,
  'packed': 160,
  'shipped': 300,
  'returned undeliverable': 400,
  'replacement requested': 410,
  'exchanged': 430,
  'refund requested': 450,
};

// Shipping codes
Whiplash.prototype.shippingCode = {
  'Whiplash Pick Up': 0,
  'USPS Priority Mail International': 100,
  'USPS First Class Mail International': 101,
  'USPS Express Mail International': 102,
  'USPS Priority Mail': 103,
  'USPS First Class Mail': 104,
  'USPS Media Mail': 105,
  'USPS Parcel Select': 106,
  'USPS Express Mail': 109,
  'UPS Ground': 200,
  'UPS Second Day Air': 201,
  'UPS Three-Day Select': 202,
  'UPS Next Day Air': 203,
  'UPS Next Day Air Saver': 204,
  'UPS Next Day Air Early A.M.': 205,
  'UPS Second Day Air A.M.': 206,
  'UPS Worldwide Expedited': 207,
  'UPS Worldwide Express': 208,
  'UPS Worldwide Express Plus': 209,
  'UPS Worldwide Saver': 211,
  'UPSMailInnovations Expedited Mail Innovations': 220,
  'UPSMailInnovations Priority Mail Innovations': 221,
  'FedEx FedEx Ground': 300,
  'FedEx FedEx 2-Day': 301,
  'FedEx FedEx 2-Day AM': 302,
  'FedEx FedEx Express Saver': 303,
  'FedEx Standard Overnight': 304,
  'FedEx First Overnight': 305,
  'FedEx Priority Overnight': 306,
  'FedEx International Economy': 320,
  'FedEx International First': 321,
  'FedEx International Priority': 322,
  'DHLExpress DHL EXPRESS 9:00': 460,
  'DHLExpress DHL EXPRESS 12:00': 461,
  'DHLExpress DHL EXPRESS 10:30': 462,
  'DHLExpress DHL EXPRESS WORLDWIDE': 463,
};

// What quantity is considered low for each product
Whiplash.prototype.lowQuantity = {
  'Accelerometer Module': -150,
  'Ambient Module (Light and Sound)': -150,
  'Audio Module': -150,
  'Bluetooth Low Energy Module': -150,
  'Camera Module': -150,
  'Climate Module': -150,
  'GPRS Module': -150,
  'GPS': -150,
  'IR Module': -150,
  'MicroSD Module': -150,
  'nRF24 Module': -150,
  'Relay Module': -150,
  'RFID Module': -150,
  'Servo Module': -150,
  'Servo Motor': -100,
  'Tessel': -500,
  'U.FL Antenna (GPRS)': -100,
};

// Error thrown if API keys were not initialized
Whiplash.prototype.uninitializedError = new Error("You must initialize the keys prior to using the library");

// Wether API keys have been set or not
Whiplash.prototype.initialized = false;

// Our authorized agent used to query whiplash
Whiplash.prototype.whiplash = null;

// Initialize our request with our whiplash key
Whiplash.prototype.initialize = function(config) {
  Whiplash.prototype.whiplash = new WhiplashAuth(config.whiplash.apiKey);
  Whiplash.prototype.initialized = true;
}

Whiplash.prototype.fetchAllOrders = function() {
  return Q.promise(function(resolve, reject) {
    if (!Whiplash.prototype.initialized) { return reject(Whiplash.prototype.uninitializedError); }
    Whiplash.prototype.whiplash.request({ "method": "GET", "url": "orders/count"}, function (err, body) {
      if (err) {
        return reject(err);
      }
      else if (body && body.error) {
        return reject(new Error(body.error));
      }
      else {
        return resolve(body);
      }
    });
  })
  .then(function(numOrders) {
    return Q.promise(function(resolve, reject) {
      if (!Whiplash.prototype.initialized) { return reject(Whiplash.prototype.uninitializedError); }

      var limit = 250;
      var pages = Math.ceil(numOrders/limit)
      calls = []
      for (var i = 0; i < pages + 1; i++) {
        var l = (i * limit < numOrders ? limit : numOrders - (limit * (i-1)));
        calls[i] = {page:i, limit:l};
      }
      allOrders = [];
      async.eachSeries(calls, function(call, callback) {
        var requestURL = 'orders?limit=' + call.limit + '&page=' + call.page;
        Whiplash.prototype.whiplash.request(requestURL, function(err, pageOrders) {
          if (err) {
            callback(err);
          }
          else {
            allOrders = allOrders.concat(pageOrders);
            callback();
          }
        });
      },
      function(err, res) {
        if (err) {
          reject(err);
        }
        else {
          console.log('will resolve with', allOrders.length)
          resolve(allOrders)
        }
      });
    });
  })
}

// Get limit amount of orders with the provided status (can be null)
Whiplash.prototype.fetchOrders = function(limit, status, since, page) {
  return Q.promise(function(resolve, reject) {
    if (!Whiplash.prototype.initialized) { return reject(Whiplash.prototype.uninitializedError); }
    var i = since ? '?since_id='+since : '';
    var l = limit ? '&limit='+limit : '';
    var s = status ? '&status='+ Whiplash.prototype.orderStatus[status] : '';
    var p = page ? '&page=' + page : ''
    console.log('request', 'orders/' + (since ? i + l + s + p : ''))
    Whiplash.prototype.whiplash.request('orders/' + (since ? i + l + s + p : ''), function(err, orders) {
      return (err) ? reject(err) : resolve(orders);
    });
  });
};

// Get a specific order from whiplash
Whiplash.prototype.fetchOrder = function(celeryOrder) {
  return Q.promise(function(resolve, reject) {
    if (!Whiplash.prototype.initialized) { return reject(Whiplash.prototype.uninitializedError); }
    Whiplash.prototype.fetchOrders(100, null).then(function(orders) {
      for (var order in orders) {
        if (orders[order].originator_id == celeryOrder.number) {
          return resolve(orders[order]);
        }
      }
      return reject(new Error('Order '+celeryOrder.number+' not found in Whiplash'));
    }).fail(function(err) {
      return reject(err);
    });
  });
};

// Fetch all the items from whiplash
Whiplash.prototype.fetchItems = function() {
  return Q.promise(function(resolve, reject) {
    if (!Whiplash.prototype.initialized) { return reject(Whiplash.prototype.uninitializedError); }
    Whiplash.prototype.whiplash.request('items', function(err, items) {
      return (err) ? reject(err) : resolve(items);
    });
  });
};

// Forward the provided whiplash compatible order to whiplash
Whiplash.prototype.createOrder = function(whiplashOrder) {
  return Q.promise(function(resolve, reject) {
    if (!Whiplash.prototype.initialized) { return reject(Whiplash.prototype.uninitializedError); }
    Whiplash.prototype.whiplash.request({ "method": "POST", "url": "orders", "body": whiplashOrder }, function (err, body) {
      if (err) { return reject(err); }
      else if (body && body.error) { return reject(new Error(body.error)); }
      else { return resolve(body); }
    });
  });
};

// Cancel an order in Whiplash
Whiplash.prototype.cancelOrder = function(whiplashOrder) {
  return Q.promise(function(resolve, reject) {
    if (!Whiplash.prototype.initialized) { return reject(Whiplash.prototype.uninitializedError); }
    Whiplash.prototype.whiplash.request({ "method": "PUT", "url": "orders/" + whiplashOrder.id + '/cancel'}, function (err, body) {
      if (err) { return reject(err); }
      else if (body && body.error) { return reject(new Error(body.error)); }
      else { return resolve(body); }
    });
  });
};

// Export the class to be used an a whiplash item
module.exports = Whiplash;
