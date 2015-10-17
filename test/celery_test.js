var Celery = require('../lib/celery.js');
var request = require('request');
var assert = require('assert');
var config = require('../config.json');
var orderID = require('./orders/order-numbers.json');
var mockCeleryOrder = require('./orders/celery-example.json');
var mockCeleryOrders = require('./orders/to-celery-example.json');
var celeryItems = require('./orders/celery-items.json');
var whiplashItems = require('./orders/whiplash-items.json');
var syncMocks = require('./orders/sync-mocks.json');
var products = require('./orders/products.json');
var Q = require('Q');

var celery = new Celery();
celery.initialize(config);

/* test fetchOrders */

var test_fetchOrders = function(msg, timeout, os, ps, fs) {
  it(msg, function(done) {
    this.timeout(timeout);
    celery.fetchOrders(os,ps,fs).then(function(orders) {
      for (var order in orders) {
        if (os) {
          assert.equal(orders[order].order_status, os, 'Fetched order status does not equal provided order status');
        }
        if (ps) {
          assert.equal(orders[order].payment_status, ps, 'Fetched payment status does not equal provided payment status');
        }
        if (fs) {
          assert.equal(orders[order].fulfillment_status, fs, 'Fetched fulfillment status does not equal provided fulfillment status');
        }
      }
      done();
    }).fail(function(err) {
      assert.fail(err);
      done();
    });
  });
};
describe('testing fetchOrders', function() {
  var tests = [
    [ 'should fetch open orders',                        5000, 'open',  null,     null ],
    [ 'should fetch open unpaid and unfulfilled orders', 2000, 'open', 'unpaid', 'unfulfilled' ],
    [ 'should fetch open paid and unfulfilled orders',   2000, 'open', 'paid',   'unfulfilled' ],
  ];
  for (var test in tests) {
    test_fetchOrders(
      tests[test][0],
      tests[test][1],
      tests[test][2],
      tests[test][3],
      tests[test][4]
    );
  }
});

/* test preOrders */

var test_preOrders = function(msg, timeout) {
  it(msg, function(done) {
    this.timeout(timeout);
    celery.preOrders().then(function(orders) {
      console.log(orders);
      done();
    }).fail(function(err) {
      assert.fail(err);
      done();
    });
  });
};
describe('testing fetchOrders', function() {
  var tests = [
    [ 'should fetch orders with given SKU', 20000 ],
  ];
  for (var test in tests) {
    test_preOrders(
      tests[test][0],
      tests[test][1]
    );
  }
});

/* test fetchOrder */

var test_fetchOrder = function(msg, timeout, orderNumber) {
  it(msg, function(done) {
    this.timeout(timeout);
    celery.fetchOrder(orderNumber).then(function(order) {
      assert.equal(order.number, orderNumber, 'Fetched id does not equal provided id');
      done();
    }).fail(function(err) {
      assert.fail(err);
      done();
    });
  });
};
describe('testing fetchOrder', function() {
  var tests = [
    ['fetching order based off id', 10000, 101625656],
  ];
  for (var test in tests) {
    test_fetchOrder(
      tests[test][0],
      tests[test][1],
      tests[test][2]
    );
  }
});

/* test createOrder, chargeOrder, fulfillOrder, and cancelOrder (easier together) */

var test_createOrder = function(msg, timeout, mock) {
  it(msg, function(done) {
    this.timeout(timeout);
    celery.createOrder(mock).then(function(body) {
      celery.chargeOrder({ id: body.data._id, number: body.data.number }).then(function(whiplashOrder) {
        celery.fulfillOrder(whiplashOrder.number).then(function(cbody) {
          assert.equal(cbody.data.fulfillment_status, 'fulfilled', 'Order '+cbody.data.number+' was not actually fulfilled');
          celery.cancelOrder(cbody.data.number).then(function(cabody) {
            assert.equal(cabody.data.order_status, 'cancelled', 'Order '+cabody.data.number+' was not actually cancelled');
            done();
          }).fail(function(err) {
            assert.fail(err);
            done();
          });
        }).fail(function(err) {
          assert.fail(err);
          done();
        });
      }).fail(function(err) {
        assert.fail(err);
        done();
      });
    }).fail(function(err) {
      assert.fail(err);
      done();
    });
  });
};
describe('testing createOrder and cancelOrder', function() {
  var tests = [
    [ 'should create, fake charge, fulfill, and then cancel an in celery', 10000, mockCeleryOrders.test_order ],
  ];
  for (var test in tests) {
    test_createOrder(
      tests[test][0],
      tests[test][1],
      tests[test][2]
    );
  }
});

/* test refundOrder */

describe('testing refundOrder', function() {});

/* test setDomesticShipping */

var test_setDomesticShipping = function(msg, timeout, country, method, shipping) {
  it(msg, function(done) {
    this.timeout = timeout;
    mockCeleryOrder.shipping_address.country = country;
    mockCeleryOrder.shipping_method = method;
    mockCeleryOrder.shipping = shipping;
    var retshipping = celery.setDomesticShipping(mockCeleryOrder);
    if (country != 'us') {
      assert.equal(retshipping, method, 'Non us order changed shipping method');
    }
    else if (method != 'usps_standard_domestic') {
      assert.equal(retshipping, method, 'Non \'usps_standard_domestic\' order changed shipping method');
    }
    else if (shipping < 1000) {
      assert.equal(retshipping, 'usps_first_class', 'Domestic stardard less than 1000 failed');
    }
    else if (shipping > 1000) {
      assert.equal(retshipping, 'usps_priority', 'Domestic stardard greater than 1000 failed');
    }
    done();
  });
};
describe('testing setDomesticShipping', function () {
  var tests = [
    [ 'should return same shipping method for non us order', 2000, 'de', 'usps_express_international', 1144 ],
    [ 'should return same shipping method for us order with non standard shipping method', 2000, 'us', 'non_standard', 1144 ],
    [ 'should return \'usps_first_class\' for us domestic order with weight less than 1000 ', 2000, 'us', 'usps_standard_domestic', 379 ],
    [ 'should return \'usps_priority\' for us domestic order with weight greater than 1000 ', 2000, 'us', 'usps_standard_domestic', 1144 ],
  ];
  for(var test in tests) {
    test_setDomesticShipping(
      tests[test][0],
      tests[test][1],
      tests[test][2],
      tests[test][3],
      tests[test][4]
    );
  }
});
