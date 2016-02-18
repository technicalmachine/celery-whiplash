var config  = require('./../config.json');
var CeleryAuth = require('try-celery');
var request = require('request');
var async = require('async');
var Q = require('q');

function Celery() {}

// The earliest order number that polling and syncing is compatible with
Celery.prototype.sinceOrder = '?created[gte]=1416260542';

// The base URL for linking to orders
Celery.prototype.orderURL = 'https://dashboard.trycelery.com/orders/';

// Takes a Celery shipping method and returns Whiplash equivalent
Celery.prototype.shippingMethodMap = {
  'usps_express': 'USPS Express Mail',
  'usps_priority': 'USPS Priority Mail',
  'usps_first_class': 'USPS First Class Mail',
  'usps_express_international': 'USPS Express Mail International',
  'usps_priority_international': 'USPS Priority Mail International',
  'ups_1day': 'UPS Next Day Air',
  'ups_worldwide_saver': 'UPS Worldwide Saver',
  'ups_worldwide_express': 'UPS Worldwide Express',
  'ups_worldwide_expedited': 'UPS Worldwide Expedited',
  'ups_innovations_priority': 'UPS Priority Mail Innovations',
};

// Error thrown if API keys were not initialized
Celery.prototype.uninitializedError = new Error("You must initialize the keys prior to using the library");

// Wether API keys have been set or not
Celery.prototype.initialized = false;

// Our authorized agent used to query celery
Celery.prototype.celery = null;

// Initialize our request with our celery key
Celery.prototype.initialize = function(config) {
  Celery.prototype.celery = new CeleryAuth(config.celery.apiKey);
  Celery.prototype.initialized = true;
};

// Get orders given the provided status filters (null = wildcard)
Celery.prototype.fetchOrders = function(order_status, payment_status, fulfillment_status, since) {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) {
      return reject(Celery.prototype.uninitializedError);
    }
    Celery.prototype.celery.request('orders' + (since ? since : '') + '&shipping_address.country=us', function(err, celeryOrders) {
      if (err) { reject(err); }
      var retItems = [];
      for (var order in celeryOrders.data) {
        if (!order_status || celeryOrders.data[order].order_status == order_status) {
          if (!payment_status || celeryOrders.data[order].payment_status == payment_status) {
            if (!fulfillment_status || celeryOrders.data[order].fulfillment_status == fulfillment_status) {
              retItems.push(celeryOrders.data[order]);
            }
          }
        }
      }
      return resolve(retItems);
    });
  });
};

// Celery get preorders
Celery.prototype.preOrders = function() {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) { return reject(Celery.prototype.uninitializedError); }
    Celery.prototype.celery.request('orders/count?line_items.sku=TM-T2-02&shipping_address.country=us&', function(err, orderCount) {
      if (err) { return reject(err); }
      return resolve(orderCount.data.total);
    });
  });
};

// Get a specific order from celery
Celery.prototype.fetchOrder = function(orderID) {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) { return reject(Celery.prototype.uninitializedError); }
    Celery.prototype.celery.request('orders/' + orderID, function(err, body) {
      if (err) { return reject(err); }
      else if (body.meta.error) { return reject(new Error(body.meta.error.message)); }
      else { return resolve(body.data); }
    });
  });
};

// Forward the provided celery compatible order to celery
Celery.prototype.createOrder = function(celeryOrder) {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) { return reject(Celery.prototype.uninitializedError); }
    Celery.prototype.celery.request( { url: "orders", method: "POST", json:celeryOrder}, function(err, body) {
      if (err) { return reject(err); }
      else if (body.meta.error) { return reject(new Error(body.meta.error.message)); }
      else {
        return resolve(body);
      }
    });
  });
};

// Cancel an order in Celery
Celery.prototype.cancelOrder = function(orderID) {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) { return reject(Celery.prototype.uninitializedError); }
    Celery.prototype.celery.request( { url: "orders/" + orderID + '/order_cancel', method: "POST"}, function(err, body) {
      if (err) { return reject(err); }
      else if (body.meta.error) { return reject(body.meta.error); }
      else {
        return resolve(body);
      }
    });
  });
};

// Charge an order on Celery
Celery.prototype.chargeOrder = function(whiplashOrder) {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) { return reject(Celery.prototype.uninitializedError); }
    Celery.prototype.celery.request({url: 'orders/' + whiplashOrder.id + '/payment_charge', method:"POST"}, function(err, body) {
      if (err) { return reject(err); }
      else if (body.meta.error) {
        if (body.meta.error.message == 'Order has nothing to charge or authorize.') {
          return resolve(whiplashOrder)
        }
        return reject(new Error(body.meta.error.message));
      }
      else { return resolve(whiplashOrder); }
    });
  });
};

// Refund an order on Celery
Celery.prototype.refundOrder = function(celeryOrder) {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) { return reject(Celery.prototype.uninitializedError); }
    Celery.prototype.celery.request({url: 'orders/' + celeryOrder.id + '/payment_refund', method:"POST"}, function(err, body) {
      if (err) { return reject(err); }
      else if (body.meta.error) { reject(new Error(body.meta.error.message)); }
      else { return resolve(body); }
    });
  });
};

// Mark an order as fulfilled on Celery
Celery.prototype.fulfillOrder = function(orderID, courier, number) {
  return Q.promise(function(resolve, reject) {
    if (!Celery.prototype.initialized) { return reject(Celery.prototype.uninitializedError); }
    Celery.prototype.celery.request({ "method": "POST", "url": 'orders/' + orderID + '/fulfillment_succeed', "body": { "courier": courier, "number": number.toString() } }, function(err, body) {
      if (err) { return reject(err); }
      else if (body.meta && body.meta.error) { return reject(new Error(body.meta.error.message)); }
      else { return resolve(body); }
    });
  });
};

// Celery > Celery, sets First Class or Priority based on weightgi
Celery.prototype.setDomesticShipping = function(celeryJSON) {
  // if this isn't a domestic order return the original shipping method
  if(celeryJSON.shipping_address.country != 'us') { return celeryJSON.shipping_method; }
  // if the customer didn't choose standard return the original shipping method
  if(celeryJSON.shipping_method != 'usps_standard_domestic') { return celeryJSON.shipping_method; }
  // return shipping method based on rate (under/over $10)
  return (celeryJSON.shipping < 1000) ? 'usps_first_class' : 'usps_priority';
};

// Returns the current time in a human readable format
var timestamp = function() {
  var d = new Date();
  return "["+d.getDate()+"/"+(d.getMonth()+1)+"/"+d.getFullYear()+" "+d.getHours()+":"+d.getMinutes()+":"+d.getSeconds()+"]";
};

// Export the class to be used an a whiplash item
module.exports = Celery;
