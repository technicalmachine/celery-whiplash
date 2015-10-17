var zendesk = require('node-zendesk');
var config  = require('./../../config.json');

function ZendeskManager() {
    this.client = zendesk.createClient({
    username:  config.zendesk.username,
    token:     config.zendesk.token,
    remoteUri: config.zendesk.remoteUri,
  });
}

// The ID of the Whiplash Server user in zendesk. Used as the default requester if none provided
ZendeskManager.prototype.whiplashServerID = 415124089;

// Verifies that you're logged into zendesk
ZendeskManager.prototype.verifyLogin = function(callback) {

  this.client.users.me(function (err, req, result) {
    var error = (err || !result.verified) ? new Error("Unable to authenticate with Zendesk") : null;
    callback && callback(error);
  });

  return this;
};

// Searches tickets in zendesk
ZendeskManager.prototype.getTickets = function(tag, callback) {
  this.client.search.query(tag, function(err, req, res) {
    callback && callback(err, res);
  });
}

// Creates a ticket with the given information
ZendeskManager.prototype.createTicket = function(requesterID, subject, body, tags, callback, noDuplicates) {
  var ticket = {
    "ticket": {
      "requester_id": requesterID || ZendeskManager.prototype.whiplashServerID,
      "subject": subject,
      "comment": {
        "body": body,
      },
      "type" : "problem",
      "priority" : "normal",
      "status" : "new",
      "tags" : tags
    }
  }
  if (noDuplicates) {
    var self = this;
    self.getTickets(tags[0], function(err,res) {
      if(res.length == 0) {
        self.client.tickets.create(ticket, function(err, req, res) {
          return callback && callback(err, res.id);
        });
      }
    });
  }
  else {
    this.client.tickets.create(ticket, function(err, req, res) {
      return callback && callback(err, res.id);
    });
  }
    
}

// Creates a user so we can respond to them easier
ZendeskManager.prototype.createUser = function(name, email, callback) {
  var self = this;
  self.client.search.query('type:user '+email, function(err, req, res) {
    if (res.length) {
      callback && callback(err, res[0]);
    }
    else {
      var user = { "user": { "name": name, "email": email } };
      self.client.users.create(user, function(err, req, res) {
        if (!res) { res = { id: ZendeskManager.prototype.whiplashServerID }; }
        callback && callback(err, res);
      });
    }
  });
}

// Search for a user
ZendeskManager.prototype.findUser = function(email, callback) {
  this.client.search.query('type:user '+email, function(err, req, res) {
    callback && callback(err, res.length ? res[0] : null);
  });
}

module.exports = ZendeskManager;
