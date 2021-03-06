// Requirements needed
var request = require('request');
var async = require('async');
var Whiplash = require('./whiplash');
var Celery = require('./celery');
var Zendesk = require('./../whiplash/helpers/zendesk-manager.js');
var Q = require('q');

// Our whiplash and Celery API managers
var whiplash = new Whiplash();
var celery = new Celery();
var zendesk = new Zendesk();
var initialized = false;
var uninitializedError = new Error("You must initialize the keys prior to using the library");

// Initialize celery and whiplash with our API keys
var initWithKeys = function(config) {
  whiplash.initialize(config);
  celery.initialize(config);
  zendesk.verifyLogin(function(err) { if (err) { console.log(timestamp(),'Unable to authenticate with zendesk',err); } });
  initialized = true;
};

// Polling function used to synchronize Celery and Whiplash orders
var synchronizeOrders = function() {
  return Q.promise(function(resolve, reject) {
    celery.fetchOrders(null,null,null,celery.sinceOrder).then(function(celeryOrders) {
      whiplash.fetchOrders(100,null,whiplash.sinceOrder).then(function(whiplashOrders) {
        synchronize(celeryOrders, whiplashOrders).then(function(updates) {
          // new orders
          async.each(updates.create, function(order, callback) {
            processSingleOrder(order.number).then(function(body) {
              console.log(timestamp(),'Successfully created order',body.originator_id,'in Whiplash');
              callback();
            }).fail(function(err) {
              console.log(timestamp(),'Failed to create order',order.number,err);
              callback();
            });
          }, function(err) {
            // paid orders not in whiplash
            async.each(updates.nocharge, function(order, callback) {
              processSingleOrder(order.number, true, true).then(function(body) {
                console.log(timestamp(),'Successfully added paid order',body.originator_id,'to Whiplash');
                callback();
              }).fail(function(err) {
                console.log(timestamp(),'Failed to add paid order',order.number,err);
                callback();
              });
            }, function(err) {
              // cancelled orders in whiplash
              async.each(updates.cancel.whiplash, function(order, callback) {
                cancelSingleOrder(order.number).then(function(body) {
                  console.log(timestamp(),'Successfully cancelled order',body.originator_id,'in Whiplash');
                  callback();
                }).fail(function(err) {
                  console.log(timestamp(),'Failed to cancel order',order.number,'in Whiplash',err);
                  callback();
                });
              }, function(err) {
                // cancelled orders in celery
                async.each(updates.cancel.celery, function(order, callback) {
                  celery.cancelOrder(order.originator_id).then(function(body) {
                    console.log(timestamp(),'Successfully cancelled order',body.data.number,'in Celery');
                    callback();
                  }).fail(function(err) {
                    console.log(timestamp(),'Failed to cancel order',order.number,'in Celery',err);
                    callback();
                  });
                }, function(err) {
                  // fulfilled orders
                  async.each(updates.fulfill, function(order, callback) {
                    celery.fulfillOrder(order.originator_id, order.ship_method.split(' ')[0], order.tracking[0]).then(function(body) {
                      console.log(timestamp(),'Successfully marked order',body.data.number,'fulfilled in Celery');
                      callback();
                    }).fail(function(err) {
                      console.log(timestamp(),'Failed to mark order',order.number,'as fulfilled in Celery',err);
                      callback();
                    });
                  }, function(err) {
                    // refunded orders
                    async.each(updates.refund, function(order, callback) {
                      refundOrder(order.number).then(function(body) {
                        console.log(timestamp(),'Successfully refunded order',body.data.number,'in Celery');
                        callback();
                      }).fail(function(err) {
                        console.log(timestamp(),'Failed to refund order',order.number,'in Celery',err);
                        callback();
                      });
                    }, function(err) {
                      return err ? reject(err) : resolve(updates);
                    });
                    if (err) { return reject(err); }
                  });
                  if (err) { return reject(err); }
                });
                if (err) { return reject(err); }
              });
              if (err) { return reject(err); }
            });
            if (err) { return reject(err); }
          });
        }).fail(function(err) {
          return reject(timestamp()+' Failed when syncing orders');
        });
      }).fail(function(err) {
        return reject(timestamp()+' Failed when getting Whiplash orders');
      });
    }).fail(function(err) {
      return reject(timestamp()+' Failed when getting Celery orders');
    });
  });
};

// Process an order from celery to whiplash
var processSingleOrder = function(orderID, skipVerify, skipCharge) {
  return Q.promise(function(resolve, reject) {
    if (!initialized) { return reject(uninitializedError); }
    // Fetch the order details from Celery
    celery.fetchOrder(orderID)
    // Verify that the order needs to be processed
    .then(function(order) { return (skipVerify || skipCharge) ? order : verifyOrderWithCelery(order); } )
    // Convert the JSON to what Whiplash Expects
    .then(celeryJSONToWhiplash)
    // Charge the order
    .then(function(order) { return skipCharge ? order : celery.chargeOrder(order); })
    // Forward that order on to Whiplash
    .then(whiplash.createOrder)
    // We succeeeded!
    .then(resolve)
    // Or failed, sadly 
    .catch(reject);
  });
};

// Process an order from celery to whiplash
var cancelSingleOrder = function(orderID) {
  return Q.promise(function(resolve, reject) {
    if (!initialized) { return reject(uninitializedError); }
    // Fetch the order details from Celery
    celery.fetchOrder(orderID)
    // Verify that the order needs to be cancelled
    .then(verifyCancelOrder)
    // Find the order in Whiplash
    .then(whiplash.fetchOrder)
    // Cancel Whiplash order
    .then(whiplash.cancelOrder)
    // We succeeeded!
    .then(resolve)
    // Or failed, sadly 
    .catch(reject);
  });
};

// Refund an order in Celery
var refundOrder = function(orderID) {
  return Q.promise(function(resolve, reject) {
    if (!initialized) { return reject(uninitializedError); }
    // Fetch the order details from Celery
    celery.fetchOrder(orderID)
    // Verify that the order needs to be cancelled
    .then(celery.refundOrder)
    // We succeeeded!
    .then(resolve)
    // Or failed, sadly 
    .catch(reject);
  });
};

// Converts the Celery JSON object to be Whiplash friendly
var celeryJSONToWhiplash = function(celeryJSON) {
  return Q.promise(function(resolve, reject) {
    // Set shipping for domestic orders set to standard shipping
    celeryJSON.shipping_method = celery.setDomesticShipping(celeryJSON);
    // Convert to WhiplashJSON
    getWhiplashOrderItems(celeryJSON).then(function(orderItems){
      var whiplashJSON = {};
      try {
        whiplashJSON.id =                  celeryJSON._id;
        whiplashJSON.originator_id =       celeryJSON.number;
        whiplashJSON.created_at =          celeryJSON.created_date;
        whiplashJSON.shipping_address_1 =  celeryJSON.shipping_address.line1;
        whiplashJSON.shipping_address_2 =  celeryJSON.shipping_address.line2;
        whiplashJSON.shipping_city =       celeryJSON.shipping_address.city;
        whiplashJSON.shipping_company =    celeryJSON.shipping_address.company;
        whiplashJSON.shipping_country =    celeryJSON.shipping_address.country;
        whiplashJSON.shipping_name =       celeryJSON.buyer.name;
        whiplashJSON.email =               celeryJSON.buyer.email;
        whiplashJSON.shipping_phone =      celeryJSON.shipping_address.phone;
        whiplashJSON.shipping_state =      celeryJSON.shipping_address.state;
        whiplashJSON.shipping_zip =        celeryJSON.shipping_address.zip;
        whiplashJSON.provider =            "api";
        whiplashJSON.order_items =         orderItems;
        whiplashJSON.ship_method =         celery.shippingMethodMap[celeryJSON.shipping_method];
        whiplashJSON.ship_notes =          '<a href="'+celery.orderURL+celeryJSON.number+'" target="_blank">'+celery.orderURL+celeryJSON.number+'</a>'
      }
      catch(err) {
        return reject(err);
      }
      // create a ticket if the order is greater than $1000
      if (celeryJSON.total > 100000) {
        zendesk.createUser(celeryJSON.buyer.name, celeryJSON.buyer.email, function(err,res) {
          if (err) {
            console.log(timestamp(),'Unable to create user',celeryJSON.buyer.email);
            res = { id: zendesk.whiplashServerID };
          }
          zendesk.createTicket(
            res.id,
            celeryJSON.number+' was a particularly large order',
            'https://dashboard.trycelery.com/orders/'+celeryJSON.number+'\n'+celeryJSON.buyer.name+' bought '+celeryJSON.line_items.length+' items for $'+(parseInt(celeryJSON.total)/100),
            ['largeOrder'],
            function(err,id) {
              if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
              else { console.log(timestamp(), 'Created ticket number', id, 'because it was a large order'); }
            }
          );
        });
      }
      // create a ticket if there are notes from the buyer included
      if (celeryJSON.buyer.notes) {
        zendesk.createUser(celeryJSON.buyer.name, celeryJSON.buyer.email, function(err,res) {
          if (err) {
            console.log(timestamp(),'Unable to create user',celeryJSON.buyer.email);
            res = { id: zendesk.whiplashServerID };
          }
          zendesk.createTicket(
            res.id,
            celeryJSON.number+' has a note to seller',
            'https://dashboard.trycelery.com/orders/'+celeryJSON.number+'\n'+celeryJSON.buyer.name+" said: \""+celeryJSON.buyer.notes+"\"",
            ['buyer.notes'],
            function(err,id) {
              if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
              else { console.log(timestamp(), 'Created ticket number', id, 'because order had buyer notes'); }
            }
          );
        });
      }
      return resolve(whiplashJSON);
    }).fail(function(err) {
      return reject(err);
    });
  });
};

// Take the Celery products and convert them to Whiplash compatible products
var getWhiplashOrderItems = function(celeryJSON) {
  return Q.promise(function(resolve, reject) {
    whiplash.fetchItems().then(function(whiplashItems) {
      // split the Celery items into individual products
      var Items = [];
      for (var item in celeryJSON.line_items) {
        Items.push({
          'sku': celeryJSON.line_items[item].sku,
          'quantity': celeryJSON.line_items[item].quantity
        });
      }
      // get the item id's from Whiplash
      var skuToId = {};
      for (var item in whiplashItems) {
        skuToId[whiplashItems[item].sku] = whiplashItems[item].id;
      }
      // convert the Celery items into Whiplash compatible items
      var retItems = [];
      for (var item in Items) {
        retItems.push({
          item_id: skuToId[Items[item].sku],
          quantity: Items[item].quantity,
        });
      }
      // make a ticket if there's undefined items
      for (var item in retItems) {
        if (!retItems[item].item_id) {
          zendesk.createUser(celeryJSON.buyer.name, celeryJSON.buyer.email, function(err,res) {
            if (err) {
              console.log(timestamp(),'Unable to create user',celeryJSON.buyer.email);
              res = { id: zendesk.whiplashServerID };
            }
            zendesk.createTicket(
              res.id,
              celeryJSON.number+' purchased an item that doesn\'t exist in Whiplash',
              'https://dashboard.trycelery.com/orders/'+celeryJSON.number+'\n',
              [celeryJSON.number+'-idne'],
              function(err,id) {
                if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
                else { console.log(timestamp(), 'Created ticket number', id+': order contained an undefined item in Whiplash'); }
              },
              true
            );
          });
          return reject(new Error('This order contains an item that does not exist in Whiplash'));
        }
      }
      // return the converted items
      return resolve(retItems);
    }).fail(function(err) {
      return reject(err);
    });
  });
};

// Verify that the order, payment, and fullfillment status are all valid
var verifyOrderWithCelery = function(celeryOrder) {
  return Q.promise(function(resolve, reject) {
    // if the order is not open
    if (celeryOrder.order_status !== 'open') {
      return reject(new Error("This order is " + celeryOrder.order_status + " (not open)."));
    }
    // if the order is not unpaid
    if (celeryOrder.payment_status !== 'unpaid') {
      switch(celeryOrder.payment_status) {
        case 'paid':
          return reject(new Error('This order has been paid already'));
        case 'refunded':
          return reject(new Error('This order has been refunded already'));
        case 'failed':
         return reject(new Error('This order has already failed to charge'));
      }
    }
    // if the order is not unfulfilled
    if (celeryOrder.fulfillment_status !== 'unfulfilled') {
      switch(celeryOrder.fulfillment_status) {
        case 'fulfilled':
          return reject(new Error('This order has been fulfilled already'));
        case 'processing':
          return reject(new Error('This order is currently processing'));
        case 'failed':
          return reject(new Error('This order has failed in fulfillment'));
      }
    }
    // whether payment is considered invalid or not
    var invalid;
    // confirm the payment and shipping country are the same if credit card is used
    if (celeryOrder.payment_source.card.last4) { 
      invalid = isInvalidCC(celeryOrder);
    }
    // confirm something if PayPal is used
    else if (celeryOrder.payment_source.paypal.email) {}
    // confirm something if affirm is used
    else if (celeryOrder.payment_source.affirm.charge_id) {}
    // confirm something if airbrite is used
    else if (celeryOrder.payment_source.airbrite.last4) {}
    // confirm something if stripe is used
    else if (celeryOrder.payment_source.stripe.last4) {}
    // if invalid reject otherwise return valid order information
    return (invalid) ? reject(invalid) : resolve(celeryOrder);
  });
};

// Verify that the order is cancelled and thus needs to be cancelled in Whiplash
var verifyCancelOrder = function(celeryOrder) {
  return Q.promise(function(resolve, reject) {
    // if the order is not cancelled then bounce
    if (celeryOrder.order_status !== 'cancelled') {
      reject(new Error("This order is " + celeryOrder.order_status + " (not cancelled)."));
    }
    // if the order is paid it needs to be refunded
    switch(celeryOrder.payment_status) {
      case 'unpaid':
        break;
      case 'paid':
        console.log(timestamp(),'This order has been paid already! Needs to be refunded');
      case 'refunded':
        break;
      case 'failed':
       break;
    }
    // if the order is fulfilled we're kind of fucked
    switch(celeryOrder.fulfillment_status) {
      case 'unfulfilled':
        break;
      case 'fulfilled':
        console.log(timestamp(),'This order has been fulfilled already! Contact Whiplash! Ahhhhhh!');
      case 'processing':
        break;
      case 'failed':
        break;
    }
    resolve(celeryOrder);
  });
};

// Take in an array of Celery and Whiplash orders and sync them
var synchronize = function(celeryOrders, whiplashOrders) {
  return Q.promise(function(resolve, reject) {
    var updates = {
      create: [],
      nocharge: [],
      cancel: {
        celery: [],
        whiplash: [],
      },
      fulfill: [],
      refund: [],
    };
    var celeryMap = {};
    var whiplashMap = {};
    // make map from number to celery order
    for (var order in celeryOrders) {
      celeryMap[celeryOrders[order].number] = celeryOrders[order];
    }
    // make map from number to whiplash order
    for (var order in whiplashOrders) {
      if (whiplashOrders[order].originator_id) {
        whiplashMap[whiplashOrders[order].originator_id] = whiplashOrders[order];
      }
    }
    for (var order in celeryOrders) {
      var on = celeryOrders[order].number;              /* the order number */
      var os = celeryOrders[order].order_status;        /* the order's order status */
      var ps = celeryOrders[order].payment_status;      /* the order's payment status */
      var inWhiplash = whiplashMap[on];                 /* if celery order exists in whiplash */
      // check for created orders
      if (!inWhiplash) {
        if (os == 'open') {
          if (ps == 'unpaid') {
            updates.create.push(celeryOrders[order]);
          }
          else if (ps == 'paid') {
            updates.nocharge.push(celeryOrders[order]);
          }
        }
      } 
      // check for cancelled celery orders
      else if (os == 'cancelled' && ps != 'refunded') {
        if (inWhiplash) {
          if (inWhiplash.status != whiplash.orderStatus.cancelled) {
            if (inWhiplash.status == whiplash.orderStatus.shipped) {
              // create a ticket for a shipped order that's been cancelled in Celery
              zendesk.createTicket(
                zendesk.whiplashServerID,
                on+' was just cancelled but has already shipped!',
                'https://dashboard.trycelery.com/orders/'+on+'\nhttps://www.whiplashmerch.com/orders/'+inWhiplash.id,
                [on+'-cso'],
                function(err,id) {
                  if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
                  else { console.log(timestamp(), 'Created ticket number', id, 'because order was cancelled but already shipped'); }
                },
                true
              );
            }
            else {
              if (ps == 'paid') {
                updates.refund.push(celeryOrders[order]);
              }
              updates.cancel.whiplash.push(celeryOrders[order]);
            }
          }
        }
      }
      // check for refunded celery orders
      else if (ps == 'refunded' && os != 'cancelled') {
        if (inWhiplash) {
          if (inWhiplash.status != whiplash.orderStatus.cancelled) {
            if (inWhiplash.status == whiplash.orderStatus.shipped) {
              // create a ticket for a shipped order that's been refunded in Celery
              zendesk.createTicket(
                zendesk.whiplashServerID,
                on+' was just refunded but has already shipped!',
                'https://dashboard.trycelery.com/orders/'+on+'\nhttps://www.whiplashmerch.com/orders/'+inWhiplash.id,
                [on+'-crso'],
                function(err,id) {
                  if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
                  else { console.log(timestamp(), 'Created ticket number', id, 'because order was refunded but already shipped'); }
                },
                true
              );
            }
            else {
              updates.cancel.whiplash.push(celeryOrders[order]);
            }
          }
        }
      }
    }
    for (var order in whiplashOrders) {
      var on = whiplashOrders[order].originator_id;  /* the order number */
      var os = whiplashOrders[order].status          /* the order status in whiplash */
      // check for cancelled whiplash orders
      if (os == whiplash.orderStatus.cancelled) {
        if (celeryMap[on]) {
          if (celeryMap[on].order_status != 'cancelled') {
            if (celeryMap[on].payment_status == 'paid') {
              // create a ticket for an order that's been cancelled in whiplash but paid in celery
              zendesk.createTicket(
                zendesk.whiplashServerID,
                on+' (a paid order) was just cancelled in whiplash',
                'https://dashboard.trycelery.com/orders/'+on+'\nhttps://www.whiplashmerch.com/orders/'+whiplashOrders[order].id,
                [on+'-crso'],
                function(err,id) {
                  if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
                  else { console.log(timestamp(), 'Created ticket number', id, 'for cancelling (in whiplash) a paid order'); }
                },
                true
              );
            }
            updates.cancel.celery.push(whiplashOrders[order]);
          }
        }
      }
      // check for fulfilled orders
      else if (os == whiplash.orderStatus.shipped) {
        if (celeryMap[on]) {
          if (celeryMap[on].fulfillment_status == 'unfulfilled') {
            updates.fulfill.push(whiplashOrders[order]);
          }
          else if (celeryMap[on].order_status == 'open') {
            // TODO: mark an order complete in celery
          }
        }
      }
    }
    return resolve(updates);
  });
}

// Checks that the payment source and shipping countries are the same
var isInvalidCC = function(orderJSON) {
  if (!orderJSON.payment_source || !orderJSON.payment_source.card) {
    zendesk.createTicket(
      zendesk.whiplashServerID,
      orderJSON.number+' has missing payment information',
      'https://dashboard.trycelery.com/orders/'+orderJSON.number+'\nPayment source: '+JSON.stringify(orderJSON.payment_source),
      [orderJSON.number+'-pim'],
      function(err,id) {
        if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
        else { console.log(timestamp(), 'Created ticket number', id, 'for missing payment information'); }
      },
      true
    );
    return new Error('Payment information is missing or incomplete');
  }
  if (!orderJSON.shipping_address || !orderJSON.shipping_address.country) {
    zendesk.createTicket(
      zendesk.whiplashServerID,
      orderJSON.number+' has missing shipping address information',
      'https://dashboard.trycelery.com/orders/'+orderJSON.number+'\nShipping address: '+JSON.stringify(orderJSON.shipping_address),
      [orderJSON.number+'-sim'],
      function(err,id) {
        if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
        else { console.log(timestamp(), 'Created ticket number', id, 'for missing shipping address information'); }
      },
      true
    );
    return new Error('Shipping information is missing or incomplete');
  }
  if (orderJSON.payment_source.card.country) {
    if (orderJSON.payment_source.card.country.toLowerCase() != orderJSON.shipping_address.country.toLowerCase()) {
      zendesk.createTicket(
        zendesk.whiplashServerID,
        orderJSON.number+' had a shipping and payment country mismatch',
        'https://dashboard.trycelery.com/orders/'+orderJSON.number+'\n'+'Shipping country: '+orderJSON.shipping_address.country.toLowerCase()+'\nPayment country: '+orderJSON.payment_source.card.country.toLowerCase(),
        [orderJSON.number+'-cmm'],
        function(err,id) {
          if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
          else { console.log(timestamp(), 'Created ticket number', id, 'for country mismatch'); }
        },
        true
      );
      return new Error('Shipping country and Billing country mismatch');
    }
  }
  return null;
};

// Returns the current time in a human readable format
var timestamp = function() {
  var d = new Date(); 
  return "["+d.getDate()+"/"+(d.getMonth()+1)+"/"+d.getFullYear()+" "+d.getHours()+":"+d.getMinutes()+":"+d.getSeconds()+"]";
}

// Celery and Whiplash integrated calls
module.exports.initWithKeys = initWithKeys;
module.exports.synchronizeOrders = synchronizeOrders;
module.exports.processSingleOrder = processSingleOrder;
module.exports.cancelSingleOrder = cancelSingleOrder;
module.exports.refundOrder = refundOrder;
module.exports.celeryJSONToWhiplash = celeryJSONToWhiplash;
module.exports.getWhiplashOrderItems = getWhiplashOrderItems;
module.exports.verifyOrderWithCelery = verifyOrderWithCelery;
module.exports.verifyCancelOrder = verifyCancelOrder;
module.exports.synchronize = synchronize;
module.exports.isInvalidCC = isInvalidCC;

// Celery api calls
module.exports.celery = {};
module.exports.celery.fetchOrders = celery.fetchOrders;
module.exports.celery.fetchOrder = celery.fetchOrder;
module.exports.celery.createOrder = celery.createOrder;
module.exports.celery.cancelOrder = celery.cancelOrder;
module.exports.celery.chargeOrder = celery.chargeOrder;
module.exports.celery.refundOrder = celery.refundOrder;
module.exports.celery.fulfillOrder = celery.fulfillOrder;
module.exports.celery.sinceOrder = celery.sinceOrder;

// Whiplash api calls
module.exports.whiplash = {};
module.exports.whiplash.fetchOrders = whiplash.fetchOrders;
module.exports.whiplash.fetchOrder = whiplash.fetchOrder;
module.exports.whiplash.fetchItems = whiplash.fetchItems;
module.exports.whiplash.createOrder = whiplash.createOrder;
module.exports.whiplash.cancelOrder = whiplash.cancelOrder;
module.exports.whiplash.sinceOrder = whiplash.sinceOrder;

// Zendesk api calls
module.exports.zendesk = {};
module.exports.zendesk.getTickets = zendesk.getTickets;
module.exports.zendesk.createTicket = zendesk.createTicket;
module.exports.zendesk.createUser = zendesk.createUser;
module.exports.zendesk.whiplashServerID = zendesk.whiplashServerID;
