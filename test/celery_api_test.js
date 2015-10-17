var router = require('../lib/celery-to-whiplash.js');
var request = require('request');
var assert = require('assert');
var config = require('../config.json');
var orderID = require('./orders/order-numbers.json');
var mockCeleryOrder = require('./orders/celery-example.json');
var mockCeleryOrderReal = require('./orders/celery-example-real.json');
var celeryItems = require('./orders/celery-items.json');
var whiplashItems = require('./orders/whiplash-items.json');
var syncMocks = require('./orders/sync-mocks.json');
var Q = require('Q');

router.initWithKeys(config);

// celeryJSONToWhiplash
var test_celeryJSONToWhiplash = function(msg, id, num, cdate, l1, l2, city, com, coun, name, phone, state, zip, items, ship, wlship) {
  it(msg, function(done) {
    mockCeleryOrder._id = id;
    mockCeleryOrder.number = num;
    mockCeleryOrder.created_date = cdate;
    mockCeleryOrder.shipping_address.line1 = l1;
    mockCeleryOrder.shipping_address.line2 = l2;
    mockCeleryOrder.shipping_address.city = city;
    mockCeleryOrder.shipping_address.company = com;
    mockCeleryOrder.shipping_address.country = coun;
    mockCeleryOrder.buyer.name = name;
    mockCeleryOrder.shipping_address.phone = phone;
    mockCeleryOrder.shipping_address.state = state;
    mockCeleryOrder.shipping_address.zip = zip;
    mockCeleryOrder.line_items = [];
    for (var item in items) {
      var currItem = celeryItems[items[item].name];
      currItem.quantity = items[item].quantity;
      mockCeleryOrder.line_items.push(currItem);
    }
    mockCeleryOrder.shipping_method = ship;
    router.celeryJSONToWhiplash(mockCeleryOrder)
    .then(function(whiplashOrder) {
      var failed = false;
      if (whiplashOrder.id != id) { failed = true; }
      if (whiplashOrder.created_at != cdate) { failed = true; }
      if (whiplashOrder.shipping_address_1 != l1) { failed = true; }
      if (whiplashOrder.shipping_address_2 != l2) { failed = true; }
      if (whiplashOrder.shipping_city != city) { failed = true; }
      if (whiplashOrder.shipping_company != com) { failed = true; }
      if (whiplashOrder.shipping_country != coun) { failed = true; }
      if (whiplashOrder.shipping_name != name) { failed = true; }
      if (whiplashOrder.shipping_phone != phone) { failed = true; }
      if (whiplashOrder.shipping_state != state) { failed = true; }
      if (whiplashOrder.shipping_zip != zip) { failed = true; }
      // TODO get line items check working
      // for (var item in whiplashOrder.order_items) {
      //   if (whiplashOrder.order_items[item].item_id != whiplashItems[items[item].name].id) {
      //     failed = true;
      //     break;
      //   }
      // }
      if (whiplashOrder.ship_method != wlship) { failed = true; }
      assert.equal(failed, false, 'Celery order was not properly converted to Whiplash order');
      done();
    })
    .fail(function(err) {
      assert.fail('Celery order had an error while converting to Whiplash order');
      done();
    });
  });
}
describe('testing celeryJSONToWhiplash', function() {
  var tests = [
    [ 'should pass when converting a normal (simple) Celery order to a Whiplash order',
      'test id',
      orderID.open.unpaid.unfulfilled,
      'test ceate date',
      'address line 1',
      'address line 2',
      'city',
      'company name',
      'us',
      'test name',
      '555-555-555',
      'ca',
      '92118',
      [ { "name": "Tessel", "quantity": 1 } ],
      'usps_priority',
      'USPS Priority Mail',
    ],
    [ 'should pass when converting a normal (complex) Celery order to a Whiplash order',
      'test id',
      orderID.open.unpaid.unfulfilled,
      'test ceate date',
      'address line 1',
      'address line 2',
      'city',
      'company name',
      'us',
      'test name',
      '555-555-555',
      'ca',
      '92118',
      [ { "name": "Tessel", "quantity": 1 }, { "name": "Ambient", "quantity": 1 }, { "name": "Master Pack", "quantity": 1 }  ],
      'ups_innovations_priority',
      'UPS Priority Mail Innovations',
    ],
    [ 'should pass when converting domestic order with shipping less than 1000',
      'test id',
      orderID.open.unpaid.unfulfilled,
      'test ceate date',
      'address line 1',
      'address line 2',
      'city',
      'company name',
      'us',
      'test name',
      '555-555-555',
      'ca',
      '92118',
      [ { "name": "Tessel", "quantity": 1 } ],
      'usps_standard_domestic',
      'USPS First Class Mail',
    ],
  ];
  for (var test in tests) {
    test_celeryJSONToWhiplash(
      tests[test][0],
      tests[test][1],
      tests[test][2],
      tests[test][3],
      tests[test][4],
      tests[test][5],
      tests[test][6],
      tests[test][7],
      tests[test][8],
      tests[test][9],
      tests[test][10],
      tests[test][11],
      tests[test][12],
      tests[test][13],
      tests[test][14],
      tests[test][15]
    );
  }
});

// verifyInStock
describe('testing verifyInStock', function() {});

// getWhiplashOrderItems
var test_getWhiplashOrderItems = function(msg, items) {
  it(msg, function(done) {
    var mockLineItems = {
      line_items: []
    }
    for (var item in items) {
      var currItem = celeryItems[items[item].name];
      currItem.quantity = items[item].quantity;
      mockLineItems.line_items.push(currItem);
    }
    router.getWhiplashOrderItems(mockLineItems)
    .then(function(retItems) {
      for (var item in items) {
        if (whiplashItems[items[item].name].id != retItems[item].item_id) {
          assert.fail("One of the celery items didn't get properly fetched from Whiplash");
        }
      }
      done();
    })
    .fail(function(err) {
      assert.fail("An error occured while attempting to get Whiplash order items:",err);
      done();
    });
  });
}
describe('testing getWhiplashOrderItems', function() {
  var tests = [
    { "msg": "order: 1 Tessel", "items": [ { "name": "Tessel", "quantity": 1 } ] },
    { "msg": "order: 1 Ambient module", "items": [ { "name": "Ambient", "quantity": 1 } ] },
    { "msg": "order: 1 Climate module", "items": [ { "name": "Climate", "quantity": 1 } ] },
    { "msg": "order: 1 Relay module", "items": [ { "name": "Relay", "quantity": 1 } ] },
    { "msg": "order: 1 Accelerometer module", "items": [ { "name": "Accelerometer", "quantity": 1 } ] },
    { "msg": "order: 1 Audio module", "items": [ { "name": "Audio", "quantity": 1 } ] },
    { "msg": "order: 1 BLE module", "items": [ { "name": "BLE", "quantity": 1 } ] },
    { "msg": "order: 1 Camera module", "items": [ { "name": "Camera", "quantity": 1 } ] },
    { "msg": "order: 1 GPRS module", "items": [ { "name": "GPRS", "quantity": 1 } ] },
    { "msg": "order: 1 GPS module", "items": [ { "name": "GPS", "quantity": 1 } ] },
    { "msg": "order: 1 IR module", "items": [ { "name": "IR", "quantity": 1 } ] },
    { "msg": "order: 1 MicroSD module", "items": [ { "name": "MicroSD", "quantity": 1 } ] },
    { "msg": "order: 1 nRF24 module", "items": [ { "name": "nRF24", "quantity": 1 } ] },
    { "msg": "order: 1 RFID module", "items": [ { "name": "RFID", "quantity": 1 } ] },
    { "msg": "order: 1 Servo module", "items": [ { "name": "Servo", "quantity": 1 } ] },
    { "msg": "order: 1 Motor module", "items": [ { "name": "Motor", "quantity": 1 } ] },
    { "msg": "order: 1 Antenna module", "items": [ { "name": "Antenna", "quantity": 1 } ] },
    { "msg": "order: 1 Tessel and 1 Ambient module", "items": [ { "name": "Tessel", "quantity": 1 }, { "name": "Ambient", "quantity": 1 } ] },
    { "msg": "order: literally one of everything", "items": [ 
      { "name": "Tessel", "quantity": 1 },
      { "name": "Ambient", "quantity": 1 },
      { "name": "Climate", "quantity": 1 },
      { "name": "Relay", "quantity": 1 },
      { "name": "Accelerometer", "quantity": 1 },
      { "name": "Audio", "quantity": 1 },
      { "name": "BLE", "quantity": 1 },
      { "name": "Camera", "quantity": 1 },
      { "name": "GPRS", "quantity": 1 },
      { "name": "GPS", "quantity": 1 },
      { "name": "IR", "quantity": 1 },
      { "name": "MicroSD", "quantity": 1 },
      { "name": "nRF24", "quantity": 1 },
      { "name": "RFID", "quantity": 1 },
      { "name": "Servo", "quantity": 1 },
      { "name": "Motor", "quantity": 1 },
      { "name": "Antenna", "quantity": 1 } ]
    }
  ];
  for (var test in tests) {
    test_getWhiplashOrderItems(tests[test].msg, tests[test].items);
  }
});

// verifyOrderWithCelery
var test_verifyOrderWithCelery = function(msg, os, ps, fs, l4, expm, expy, cvc, cardcountry, shipcountry) {
  it(msg, function(done) {
    mockCeleryOrder.order_status = os;
    mockCeleryOrder.payment_status = ps;
    mockCeleryOrder.fulfillment_status = fs;
    mockCeleryOrder.payment_source.card.last4 = l4;
    mockCeleryOrder.payment_source.card.exp_month = expm;
    mockCeleryOrder.payment_source.card.exp_year = expy;
    mockCeleryOrder.payment_source.card.cvc_check = cvc;
    mockCeleryOrder.payment_source.card.country = cardcountry;
    mockCeleryOrder.shipping_address.country = shipcountry;
    router.verifyOrderWithCelery(mockCeleryOrder)
    .then(function() {
      assert.fail("No error was thrown on verifying a card that "+msg);
      done();
    })
    .fail(function(err) {
      assert.notEqual(err, undefined, "An error was not properly created when it "+msg);
      done();
    });
  });
}
describe('testing verifyOrderWithCelery', function() {
  var tests = [
    [ 'should fail when order status is completed',
      'completed',
      'paid',
      'fulfilled'
    ],
    [ 'should fail when payment status is paid',
      'open',
      'paid',
      'fulfilled'
    ],
    [ 'should fail when payment status is refunded',
      'open',
      'refunded',
      'unfulfilled'
    ],
    [ 'should fail when payment status is failed',
      'open',
      'failed',
      'unfulfilled'
    ],
    [ 'should fail when fulfillment status is fulfilled',
      'open',
      'unpaid',
      'fulfilled'
    ],
    [ 'should fail when fulfillment status is processing',
      'open',
      'unpaid',
      'processing'
    ],
    [ 'should fail when fulfillment status is failed',
      'open',
      'unpaid',
      'failed'
    ],
    [ 'should fail when shipping country is null',
      'open',
      'unpaid',
      'fulfilled',
      config.test_info.card.last4,
      config.test_info.card.exp_month,
      config.test_info.card.exp_year,
      config.test_info.card.cvc,
      config.test_info.card.country,
      null
    ],
    [ 'should fail when card country is null',
      'open',
      'unpaid',
      'fulfilled',
      config.test_info.card.last4,
      config.test_info.card.exp_month,
      config.test_info.card.exp_year,
      config.test_info.card.cvc,
      null,
      config.test_info.card.country
    ],
    [ 'should fail when shipping country is different',
      'open',
      'unpaid',
      'fulfilled',
      config.test_info.card.last4,
      config.test_info.card.exp_month,
      config.test_info.card.exp_year,
      config.test_info.card.cvc,
      config.test_info.card.country,
      'se'
    ],
  ];
  for (var test in tests) {
    test_verifyOrderWithCelery(
      tests[test][0],
      tests[test][1], 
      tests[test][2],
      tests[test][3],
      tests[test][4],
      tests[test][5],
      tests[test][6],
      tests[test][7],
      tests[test][8],
      tests[test][9]
    );
  }
});

// verifyCancelOrder
describe('testing verifyCancelOrder', function() {});

// synchronize
var test_synchronize = function(msg, cOrders, wOrders, updates) {
  it(msg, function(done) {
    this.timeout(10000);
    router.synchronize(cOrders, wOrders)
    .then(function(retUpdates) {
      assert.equal(retUpdates.create.length, updates.create.length,'Number of created orders incorrect');
      assert.equal(retUpdates.cancel.whiplash.length, updates.cancel.whiplash.length,'Number of cancelled whiplash orders incorrect');
      assert.equal(retUpdates.cancel.celery.length, updates.cancel.celery.length,'Number of created celery orders incorrect');
      assert.equal(retUpdates.fulfill.length, updates.fulfill.length,'Number of fulfilled orders incorrect');
      assert.equal(retUpdates.refund.length, updates.refund.length,'Number of refunded orders incorrect');
      console.log('create',retUpdates.create.length,'fulfill',retUpdates.fulfill.length,'cancel.whiplash',retUpdates.cancel.whiplash.length,'cancel.celery',retUpdates.cancel.celery.length,'refund',retUpdates.refund.length);
      var updateMap = {};
      for (var update in retUpdates.create) {
        updateMap[retUpdates.create[update].number] = 'create';
      }
      for (var update in updates.create) {
        assert.equal(updateMap[updates.create[update]], 'create', 'Should have created order');
      }
      updateMap = {};
      for (var update in retUpdates.cancel.whiplash) {
        updateMap[retUpdates.cancel.whiplash[update].number] = 'cancel';
      }
      for (var update in updates.cancel.whiplash) {
        assert.equal(updateMap[updates.cancel.whiplash[update]], 'cancel', 'Should have cancelled order');
      }
      updateMap = {};
      for (var update in retUpdates.cancel.celery) {
        updateMap[retUpdates.cancel.celery[update].originator_id] = 'cancel';
      }
      for (var update in updates.cancel.celery) {
        assert.equal(updateMap[updates.cancel.celery[update]], 'cancel', 'Should have cancelled order');
      }
      updateMap = {};
      for (var update in retUpdates.fulfill) {
        updateMap[retUpdates.fulfill[update].originator_id] = 'fulfill';
      }
      for (var update in updates.fulfill) {
        assert.equal(updateMap[updates.fulfill[update]], 'fulfill', 'Should have fulfilled order');
      }
      updateMap = {};
      for (var update in retUpdates.refund) {
        updateMap[retUpdates.refund[update].number] = 'refund';
      }
      for (var update in updates.refund) {
        assert.equal(updateMap[updates.refund[update]], 'refund','Should have fulfilled order');
      }
      done();
    })
    .fail(function(err) {
      assert.fail('Failed while trying to sync Celery and Whiplash');
      done();
    });
  });
}
describe('testing synchronize', function() {
  var tests = [
    [ 'no change in orders sync', syncMocks.no_change.celery, syncMocks.no_change.whiplash, syncMocks.no_change.updates ],
    [ 'creating order sync', syncMocks.create_order.celery, syncMocks.create_order.whiplash, syncMocks.create_order.updates ],
    [ 'cancelling whiplash order sync', syncMocks.cancel_order.celery, syncMocks.cancel_order.whiplash, syncMocks.cancel_order.updates ],
    [ 'cancelling celery order sync', syncMocks.alt_cancel_order.celery, syncMocks.alt_cancel_order.whiplash, syncMocks.alt_cancel_order.updates ],
    [ 'fulfilling order sync', syncMocks.fulfill_order.celery, syncMocks.fulfill_order.whiplash, syncMocks.fulfill_order.updates ],
    [ 'completed order sync', syncMocks.complete_order.celery, syncMocks.complete_order.whiplash, syncMocks.complete_order.updates ],
    [ 'refunding order sync', syncMocks.refund_order.celery, syncMocks.refund_order.whiplash, syncMocks.refund_order.updates ],
    [ 'refunded order sync', syncMocks.refunded_order.celery, syncMocks.refunded_order.whiplash, syncMocks.refunded_order.updates ],
    [ 'combination order sync', syncMocks.combination_order_1.celery, syncMocks.combination_order_1.whiplash, syncMocks.combination_order_1.updates ],
  ];
  for (var test in tests) {
    test_synchronize(
      tests[test][0],
      tests[test][1],
      tests[test][2],
      tests[test][3]
    );
  }
});

// isPreOrder
describe('testing isPreOrder', function () {
  it('is a preorder', function(done){
    assert.equal(router.isPreOrder(mockCeleryOrderReal.order), false, 'Was supposed to be a regular order, not a preorder');
    done();
  });
  it('is not a preorder', function(done){
    assert.equal(router.isPreOrder(mockCeleryOrderReal.preorder), true, 'Was supposed to be a preorder, not a regular order');
    done();
  });

})

// isInvalidCC
describe('testing isInvalidCC', function() {});
