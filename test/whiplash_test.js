var Whiplash = require('../lib/whiplash.js');
var request = require('request');
var assert = require('assert');
var config = require('../config.json');
var orderID = require('./orders/order-numbers.json');
var mockCeleryOrder = require('./orders/celery-example.json');
var mockWhiplashOrders = require('./orders/to-whiplash-example.json');
var celeryItems = require('./orders/celery-items.json');
var whiplashItems = require('./orders/whiplash-items.json');
var syncMocks = require('./orders/sync-mocks.json');
var products = require('./orders/products.json');
var Q = require('Q');

var whiplash = new Whiplash();
whiplash.initialize(config);

/* test fetchOrders */

var test_fetchOrders = function(msg, timeout, limit, status) {
  it(msg, function(done) {
    this.timeout(timeout);
    whiplash.fetchOrders(limit,status).then(function(orders) {
      if (limit) {
        assert.equal(orders.length, limit, 'Fetched order limit does not equal provided order limit');
      }
      if (status) {
        var statusCode = whiplash.orderStatus[status];
        for (var order in orders) {
          assert.equal(orders[order].status, statusCode, 'Fetched order limit does not equal provided order limit');
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
    [ 'should fetch 250 whiplash orders of all status by default', 10000, null, null ],
    [ 'should fetch 50 whiplash orders of all status by default',  3000,  50,   null ],
    [ 'should fetch "shipped" orders',                             10000, null, 'shipped' ],
  ];
  for (var test in tests) {
    test_fetchOrders(
      tests[test][0],
      tests[test][1],
      tests[test][2],
      tests[test][3]
    );
  }
});

/* test fetchOrder */

var test_fetchOrder = function(msg, timeout, orderNumber) {
  it(msg, function(done) {
    this.timeout(timeout);
    mockCeleryOrder.number = orderNumber;
    whiplash.fetchOrder(mockCeleryOrder).then(function(order) {
      assert.equal(order.originator_id, orderNumber, 'Fetched id does not equal provided id');
      done();
    }).fail(function(err) {
      assert.fail(err);
      done();
    });
  });
};

describe('testing fetchOrder', function() {
  var tests = [
    ['fetching new style order with originator id set', 10000, 101625656],
  ];
  for (var test in tests) {
    test_fetchOrder(
      tests[test][0],
      tests[test][1],
      tests[test][2]
    );
  }
});

/* test fetchItems */

var test_fetchItems = function(msg, timeout) {
  it(msg, function(done) {
    this.timeout(timeout);
    whiplash.fetchItems().then(function(items) {
      for (var item in items) {
        if (!products[items[item].title]) {
          assert.fail('Fetched an item from Whiplash that does not exists in our products json');
        }
      }
      done();
    }).fail(function(err) {
      assert.fail(err);
      done();
    });
  });
};

describe('testing fetchItems', function() {
  var tests = [
    ['should fetch items and making sure they are all in products.json', 2000],
  ];
  for (var test in tests) {
    test_fetchItems(
      tests[test][0],
      tests[test][1]
    );
  }
});

/* order creation and cancelling unique id's */

var createdIds = {
  "id1": Date.now(),
  "id2": Date.now()+60,
  "id3": Date.now()+3600,
};

/* test createOrder */

var test_createOrder = function(msg, timeout, mock, id) {
  it(msg, function(done) {
    this.timeout(timeout);
    mock.originator_id = id;
    whiplash.createOrder(mock).then(function(body) {
      done();
    }).fail(function(err) {
      assert.fail(err);
      done();
    });
  });
};

describe('testing createOrder', function() {
  var tests = [
    [ 'should create a new order in whiplash', 5000, mockWhiplashOrders.test_order, createdIds.id1 ],
  ];
  for (var test in tests) {
    test_createOrder(
      tests[test][0],
      tests[test][1],
      tests[test][2],
      tests[test][3]
    );
  }
});


/* test cancelOrder */

var test_cancelOrder = function(msg, timeout, id) {
  it(msg, function(done) {
    this.timeout(timeout);
    mockCeleryOrder.number = id;
    whiplash.fetchOrder(mockCeleryOrder).then(function(order) {
      whiplash.cancelOrder(order).then(function(body) {
        done();
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

describe('testing cancelOrder', function() {
  var tests = [
    [ 'should cancel order in whiplash', 10000, createdIds.id1 ],
  ];
  for (var test in tests) {
    test_cancelOrder(
      tests[test][0],
      tests[test][1],
      tests[test][2]
    );
  }
});
