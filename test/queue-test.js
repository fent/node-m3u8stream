const Queue  = require('../lib/queue');
const assert = require('assert');
const sinon  = require('sinon');


describe('Create a queue', function() {
  describe('With 3 concurrency', function() {
    var clock;
    before(function() { clock = sinon.useFakeTimers(); });
    after(function() { clock.restore(); });

    it('Defaults to a set concurrency', function(done) {
      var maxms;
      var lastTask;
      var q = new Queue(function(task, callback) {
        if (lastTask) {
          // Make sure tasks are called in order.
          // Even if they don't finish in order.
          assert.equal(lastTask, task - 1);
        }
        var ms = Math.floor(Math.random() * 1000);
        setTimeout(function() { callback(null); }, ms);
        if (!maxms || ms > maxms) {
          maxms = ms;
        }
      }, { concurrency: 3 });

      var total = 10, called = 0;
      function callback() {
        if (++called === total) {
          done();
        }
        process.nextTick(function() { clock.tick(maxms); });
      }

      for (var i = 0; i < total; i++) {
        q.push(i, callback);
        assert.ok(q.active <= 3);
      }
      process.nextTick(function() { clock.tick(maxms); });
    });
  });

  describe('With 1 concurrency', function() {
    it('Runs tasks sequentially one at a time', function(done) {
      var q = new Queue(function(task, callback) {
        assert.equal(q.active, 1);
        process.nextTick(function() { callback(null); });
      }, { concurrency: 1 });

      var total = 5, called = 0;
      function callback() { if (++called === total) { done(); } }
      for (var i = 0; i < total; i++) {
        q.push(i, callback);
        assert.equal(q.active, 1);
      }
    });
  });

  describe('With `unique` option used', function() {
    describe('Add same task while previous is running', function() {
      it('Does not add the same tasks', function(done) {
        var total = 2, called = 0;
        var q = new Queue(function(task, callback) {
          process.nextTick(function() {
            callback(null);
            if (++called === total) { done(); }
          });
        }, {
          concurrency: 10,
          unique: function(task) { return task.id; },
        });
        q.push({ id: 4 });
        assert.equal(q.active, 1);
        q.push({ id: 4 });
        assert.equal(q.active, 1);
        q.push({ id: 2 });
        assert.equal(q.active, 2);
      });
    });

    describe('Add same task after previous finishes', function() {
      it('Able to add same task again', function(done) {
        var q = new Queue(function(task, callback) {
          process.nextTick(function() { callback(null); });
        }, {
          concurrency: 10,
          unique: function(task) { return task.id; },
        });
        q.push({ id: 4 }, function() {
          process.nextTick(function() {
            assert.equal(q.active, 0);
            q.push({ id: 4 }, done);
            assert.equal(q.active, 1);
          });
        });
        assert.equal(q.active, 1);
      });
    });
  });

  describe('Call worker callback twice', function() {
    it('Calls task callback once', function(done) {
      var q = new Queue(function(task, callback) {
        // Intentionally call callback twice.
        process.nextTick(function() {
          callback(null);
          callback(null);
        });
      });
      q.push({ mytask: 'hello' }, done);
    });
  });

  describe('Kill it halfway', function() {
    it('Does not run additional tasks', function(done) {
      var results = [];
      var q = new Queue(function(task, callback) {
        results.push(task);
        process.nextTick(function() {
          callback(null);
        });
      }, { concurrency: 2 });
      q.push('a');
      q.push('b');
      q.push('hello');
      q.push('2u');
      q.push('and 2 me');
      assert.equal(q.active, 2);
      assert.equal(q.tasks.length, 3);
      q.die();
      assert.equal(q.tasks.length, 0);
      process.nextTick(function() {
        assert.equal(q.active, 0);
        assert.deepEqual(results, ['a', 'b']);
        done();
      });
    });
  });
});
