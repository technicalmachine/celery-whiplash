var router = require('../lib/celery-to-whiplash.js');
var config = require('../config.json');
var Q = require('q');

// Initialize router
router.initWithKeys(config);

// Make a fake order
makeFakeOrder().then(function (orderID) {
  console.log(orderID);
}).fail(function (err) {
  console.log(err);
});

// Place a fake order with Celery, return the order number
function makeFakeOrder() {
  return Q.promise(function(resolve, reject) {
    var orderData = {
      "buyer": {
        "email": "fake@technical.io",
        "first_name": "Fake",
        "last_name": "Order",
        "phone": "555-555-5555"
      },
      "shipping_address": {
        "first_name": "Fake",
        "last_name": "Order",
        "company": "Technical Machine",
        "line1": "1101 Cowper Street",
        "line2": null,
        "city": "Berkeley",
        "state": "ca",
        "zip": "94702",
        "country": "us",
        "phone": "555-555-5555"
      },
      "shipping_method": "ups_1day"
    };
    router.celery.createOrder(orderData).then(function (body) {
      return resolve(body.data.number);
    }).fail(function (err) {
      return reject(err);
    });
  });
}
