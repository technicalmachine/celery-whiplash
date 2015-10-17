var router = require('../');
var config = require('../config.json');

router.initWithKeys(config);

router.processSingleOrder(101589302)
.then(function() {
  console.log("Complete!");
})
.fail(function(err) {
  console.log("Unable to complete...", err);
})