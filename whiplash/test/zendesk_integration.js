var Manager = require('../helpers/zendesk-manager');
var assert = require('assert');

describe('Logging in', function(t) {
  it('should successfully log in to zendesk', function(done) {
    var manager = new Manager();
    manager.verifyLogin(function(err) {
      assert.equal(err, null);
      done();
    });
  });
});

describe('Getting tickets', function(t) {
  it('should successfully get tickets with existing tag', function(done) {
    var manager = new Manager();
    manager.getTickets('test-tag', function(err, res) {
      assert.equal(err, null);
      assert.equal(res.length,1,'Did not fetch ticket with test tag');
      done();
    });
  });
  it('should successfully not get tickets if the tag does not exist', function(done) {
    var manager = new Manager();
    manager.getTickets('test-tag-that-does-not-exist', function(err, res) {
      assert.equal(err, null);
      assert.equal(res.length,0,'Fetched tickets with a tag that does not exist');
      done();
    });
  });
});

describe('Creating tickets', function(t) {
  it('should successfully create a ticket with the given information', function(done) {
    var manager = new Manager();
    manager.createTicket(
      null,
      'test-subject',
      'test-body',
      ['tag1','tag2'],
      function(err, id) {
        assert.equal(err, null);
        assert.equal(id == null, false, 'No ticket was actually created');
        done();
      }
    );
  });
});

describe('Creating users', function(t) {
  it('should successfully return real user that aleady exists', function(done) {
    var manager = new Manager();
    manager.createUser('fake_name', 'fake@fake.com', function(err, res) {
      assert.equal(err, null);
      assert.equal(res.id == null,false,'Could not fetch a real user');
      done();
    });
  });
  it('should successfully create new user', function(done) {
    var manager = new Manager();
    manager.createUser('fake_name', Math.random()+'@fake.com', function(err, res) {
      assert.equal(err, null);
      assert.equal(res == null,false,'Could not create new user');
      assert.equal(res.id == null,false,'Could not create new user id');
      done();
    });
  });
});

describe('Finding users', function(t) {
  it('should successfully find real user', function(done) {
    var manager = new Manager();
    manager.findUser('fake@fake.com', function(err, res) {
      assert.equal(err,null);
      assert.equal(res.id == null,false,'Could not fetch a real user');
      done();
    });
  });
  it('should not find a non existent user', function(done) {
    var manager = new Manager();
    manager.findUser('fake@fake.com.com', function(err, res) {
      assert.equal(err,null);
      assert.equal(res,null,'Fetched a non existent user');
      done();
    });
  });
});
