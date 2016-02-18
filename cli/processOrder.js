var router = require('../');
var config = require('./../config.json');
var async = require('async');

router.initWithKeys(config);

// Print the usage of this script
var printUsage = function() {
  console.warn('Usage: processOrder.js');
    console.warn('help: print this message');
    console.warn('list [order_status] [payment_status] [fulfillment_status]: list all the orders. Use \'list ouu\' for open, unpaid, and unfulfilled orders. Otherwise any status can be fetch');
    console.warn('info <celery order number>: get information about the provided celery order');
    console.warn('status <status>: get orders in whiplash that have the provided status.');
    console.warn(' options:\n   \'quote\', \'cancelled\', \'closed by originator\',\n   \'unpaid\', \'pending return\', \'items unavailable\',\n   \'paused\', \'unassignable\', \'processing\', \'printed\',\n   \'picked\', \'packed\', \'shipped\', \'returned undeliverable\',\n   \'replacement requested\', \'exchanged\', \'refund requested\'');
    console.warn('fulfill: shows a list of all the orders that have shipped but are not marked fulfilled in celery');
    console.warn('create <celery order number> [flags]: process this order\n  flags:');
    console.warn('  --nover: skips the order and card verificaiton process');
    console.warn('  --nocharge: creates an order in whiplash without charging the order');
    console.warn('cancel <celery order number>: cancels the specified order in whiplash given the celery id');
    console.warn('sync [--dryrun]: sync orders between Celery and Whiplash. Dryrun lists changed to be made without actually making them');
}

// List the orders given the
var list = function(os, ps, fs) {
  var order_status;
  var payment_status;
  var fulfillment_status;
  if (os == 'ouu') {
    order_status = 'open';
    payment_status = 'unpaid';
    fulfillment_status = 'unfulfilled';
  }
  else if (os) {
    switch(os) {
      case 'unfulfilled': fulfillment_status = 'unfulfilled'; break;
      case 'fulfilled': fulfillment_status = 'fulfilled'; break;
      case 'processing': fulfillment_status = 'processing'; break;
      case 'unpaid': payment_status = 'unpaid'; break;
      case 'paid': payment_status = 'paid'; break;
      case 'refunded': payment_status = 'refunded'; break;
      case 'failed': payment_status = 'failed'; break;
      case 'open': order_status = 'open'; break;
      case 'completed': order_status = 'completed'; break;
      case 'cancelled': order_status = 'cancelled'; break;
    }
    if (ps) {
      switch(ps) {
        case 'unfulfilled': fulfillment_status = 'unfulfilled'; break;
        case 'fulfilled': fulfillment_status = 'fulfilled'; break;
        case 'processing': fulfillment_status = 'processing'; break;
        case 'unpaid': payment_status = 'unpaid'; break;
        case 'paid': payment_status = 'paid'; break;
        case 'refunded': payment_status = 'refunded'; break;
        case 'failed': payment_status = 'failed'; break;
        case 'open': order_status = 'open'; break;
        case 'completed': order_status = 'completed'; break;
        case 'cancelled': order_status = 'cancelled'; break;
      }
      if (fs) {
        switch(fs) {
          case 'unfulfilled': fulfillment_status = 'unfulfilled'; break;
          case 'fulfilled': fulfillment_status = 'fulfilled'; break;
          case 'processing': fulfillment_status = 'processing'; break;
          case 'unpaid': payment_status = 'unpaid'; break;
          case 'paid': payment_status = 'paid'; break;
          case 'refunded': payment_status = 'refunded'; break;
          case 'failed': payment_status = 'failed'; break;
          case 'open': order_status = 'open'; break;
          case 'completed': order_status = 'completed'; break;
          case 'cancelled': order_status = 'cancelled'; break;
        }
      }
    }
  }
  console.log('List of all ' + (order_status?order_status+' ':'') + (payment_status?payment_status+' ':'') + (fulfillment_status?fulfillment_status+' ':'') + 'orders:');
  router.celery.fetchOrders(order_status, payment_status, fulfillment_status).then(function(orders) {
    for (var o in orders) {
      var itemsStr = '';
      for (var item in orders[o].line_items) { itemsStr += (orders[o].line_items[item].product_name+'(x'+orders[o].line_items[item].quantity+') '); }
      console.log(orders[o].number, orders[o].created_date, orders[o].buyer.name, itemsStr);
    }
    console.log('Total:',orders.length);
  }).fail(function(err) {
    console.log("Unable to complete...", err);
  });
}

// Get info about the order in celery and whiplash
var info = function(id) {
  if (!id) { printUsage(); return; }
  router.celery.fetchOrder(id).then(function(celeryOrder) {
    router.whiplash.fetchOrder(celeryOrder).then(function(whiplashOrder) {
      console.log(celeryOrder);
      console.log(whiplashOrder);
    }).fail(function(err) {
      console.log(celeryOrder);
      console.log("Unable to complete...", err);
    });
  }).fail(function(err) {
    console.log("Unable to complete...", err);
  });
}

// Get orders from whiplash with the provided status
var status = function(status) {
  if (!status) { printUsage(); return; }
  router.whiplash.fetchOrders(null, status).then(function(orders) {
    if (orders.error) { printUsage(); return; }
    for (var o in orders) {
      var itemsStr = '';
      for (var item in orders[o].order_items) { itemsStr += (orders[o].order_items[item].description+'(x'+orders[o].order_items[item].quantity+') '); }
      console.log(orders[o].id+(orders[o].contributor_id ? '('+orders[o].contributor_id+')' : '')+':',itemsStr);
    }
    console.log('Total:',orders.length);
  }).fail(function(err) {
    console.log("Unable to complete...", err);
  });
}

// Create an order in whiplash
var create = function(id, nover, nocharge) {
  if (!id) { printUsage(); return; }
  var v = (nover == '--nover') ? true : false;
  var c = (nover == '--nocharge') ? true : false;
  v = (v || nocharge == '--nover') ? true : false;
  c = (c || nocharge == '--nocharge') ? true : false;
  router.processSingleOrder(id,v,c).then(function(whiplashJSON) {
    console.log(timestamp(), 'Order',id,'complete');
  }).fail(function(err) {
    console.log(timestamp(), 'Order',id,'FAILED',err);
  });
}

// Cancel an order in whiplash
var cancel = function(id) {
  if (!id) { printUsage(); return; }
  router.cancelSingleOrder(id).then(function () {
    console.log('cancelled!');
  }).fail(function (err) {
    console.log(err);
  });
}

var cancel_all = function() {
  router.whiplash.fetchOrders(null, 'processing', null)
  .then((orders) => {
    console.log('items len', orders.length);
    orders.forEach((order) => {
      router.whiplash.cancelOrder(order)
      .then(() => console.log('success!'))
      .catch((err) => console.err('failure!', err));
    })
  })
  .catch((err) => {
    console.log('error', err);
  })
}

// Sync orders between celery and whiplash
var sync = function(dry, list) {
  if (dry) {
    router.celery.fetchOrders('open','paid','unfulfilled,fulfilled,pending,processing,failed,held',router.celery.sinceOrder).then(function(celeryOrders) {
      router.whiplash.fetchOrders(null,null,router.whiplash.sinceOrder).then(function(whiplashOrders) {
        router.synchronize(celeryOrders,whiplashOrders).then(function(updates) {
          console.log(timestamp(),'create',updates.create.length,'nocharge',updates.nocharge.length,'fulfill',updates.fulfill.length,'cancel.whiplash',updates.cancel.whiplash.length,'cancel.celery',updates.cancel.celery.length,'refund',updates.refund.length);
          if (list) {
            if (updates.create.length) { console.log('Create in whiplash ('+updates.create.length+'):'); }
            for (var i in updates.create) { console.log(updates.create[i].number); }
            if (updates.nocharge.length) { console.log('Paid orders added to whiplash ('+updates.nocharge.length+'):'); }
            for (var i in updates.nocharge) { console.log(updates.nocharge[i].number); }
            if (updates.fulfill.length) { console.log('Orders to mark as fulfilled ('+updates.fulfill.length+'):'); }
            for (var i in updates.fulfill) { console.log(updates.fulfill[i].originator_id); }
            if (updates.cancel.whiplash.length) { console.log('Orders to cancel in whiplash ('+updates.cancel.whiplash.length+'):'); }
            for (var i in updates.cancel.whiplash) { console.log(updates.cancel.whiplash[i].number); }
            if (updates.cancel.celery.length) { console.log('Orders to cancel in celery ('+updates.cancel.celery.length+'):'); }
            for (var i in updates.cancel.celery) { console.log(updates.cancel.celery[i].originator_id); }
            if (updates.refund.length) { console.log('Orders to cancel in celery ('+updates.refund.length+'):'); }
            for (var i in updates.refund) { console.log(updates.refund[i].number); }
          }
        }).fail(function(err) {
          console.log(err);
        });
      });
    });
  }
  else {
    router.synchronizeOrders().then(function() {
      console.log('Orders have been synchronized');
    }).fail(function(err) {
      console.log(err);
    });
  }
}

// Returns the current time in a human readable format
var timestamp = function() {
  var d = new Date();
  return "["+d.getDate()+"/"+(d.getMonth()+1)+"/"+d.getFullYear()+" "+d.getHours()+":"+d.getMinutes()+":"+d.getSeconds()+"]";
}

// If there's no arguments provided print usage
if (!process.argv[2]) { printUsage(); return; }

// Determine which function to fun based off user input
switch(process.argv[2]) {
  case 'help':
    printUsage();
    break;
  case 'list':
    list(process.argv[3], process.argv[4], process.argv[5]);
    break;
  case 'info':
    info(process.argv[3]);
    break;
  case 'status':
    break;
  case 'create':
    create(process.argv[3], process.argv[4], process.argv[5]);
    break;
  case 'cancel':
    cancel(process.argv[3]);
    break;
  case 'cancel-all-whiplash':
    cancel_all();
    break;
  case 'sync':
    sync(process.argv[3], process.argv[4]);
    break;
}
