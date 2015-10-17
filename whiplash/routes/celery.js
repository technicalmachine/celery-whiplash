var express = require('express');
var request = require('request');
var async = require('async');
var router = express.Router();
var config = require('./../../config.json');
var cwGlue = require('./../../lib/celery-to-whiplash.js');

cwGlue.initWithKeys(config);

// Process any webhooks that are directed at the server
router.processWebhook = function(req, res) {

  console.log(timestamp(), 'Order', req.body.data.number, '-', req.body.type);

  switch(req.body.type) {
    case 'order.created':
      res.send(200);
      break;
    case 'order.completed':
      res.send(200);
      break;
    case 'order.cancelled':
      cwGlue.cancelSingleOrder(req.body.data.number).then(function(body) {
        console.log(timestamp(),'Successfully cancelled order',body.originator_id,'in Whiplash');
        res.send(200);
      }).fail(function(err) {
        console.log(timestamp(),'Failed to cancel order',body.originator_id,'in Whiplash');
        res.send(200);
      });
      break;
    case 'order.line_items.updated':
			res.send(200);
			break;
    case 'order.shipping_address.updated':
			res.send(200);
			break;
    case 'order.adjustments.updated':
			res.send(200);
			break;
    case 'order.payment_source.updated':
      cwGlue.processSingleOrder(req.body.data.number, true).then(function(body) {
        console.log(timestamp(),'Successfully created order',body.originator_id,'in Whiplash (after payment source update)');
        cwGlue.zendesk.createUser(body.shipping_name, body.email, function(err,res) {
          if (err) {
            console.log(timestamp(),'Unable to create user',body.email);
            res = { id: cwGlue.zendesk.whiplashServerID };
          }
          cwGlue.zendesk.createTicket(
            res.id,
            body.originator_id+' was reprocessed successfully',
            'https://dashboard.trycelery.com/orders/'+body.originator_id+'\nhttps://www.whiplashmerch.com/orders/'+body.id+'\n This order originally failed to process. '+body.shipping_name+' updated their payment information and it was successfully reprocessed.',
            ['second-times-a-charm'],
            function(err,id) {
              if (err) { console.log(timestamp(), 'Unable to create ticket on zendesk', err); }
              else { console.log(timestamp(), 'Created ticket number', id, 'for cancelling (in whiplash) a paid order'); }
            },
            false
          );
        });
  			res.send(200);
      }).fail(function(err) {
        console.log(timestamp(),'Failed to create order',body.originator_id,'in Whiplash');
        res.send(200);
      });
  		break;
    case 'order.charge.succeeded':
			res.send(200);
			break;
    case 'order.charge.failed':
			res.send(200);
			break;
    case 'order.refund.succeeded':
			res.send(200);
			break;
    case 'order.refund.failed':
			res.send(200);
			break;
    case 'order.fulfillment.succeeded':
			res.send(200);
			break;
    case 'order.fulfillment.processing':
			res.send(200);
			break;
    case 'order.fulfillment.failed':
			res.send(200);
			break;
    default:
      console.log(timestamp(), 'Unhandled webhook',req.body.type);
      res.send(200);
      break;
  }
};

// Returns the current time in a human readable format
var timestamp = function() {
  var d = new Date(); 
  return "["+d.getDate()+"/"+(d.getMonth()+1)+"/"+d.getFullYear()+" "+d.getHours()+":"+d.getMinutes()+":"+d.getSeconds()+"]";
}

router.post('/new_order', router.processWebhook);

module.exports = router;
