const Queue  = require('../lib/queue');
const assert = require('assert');
const lolex  = require('lolex');


describe('Create a queue', () => {
  describe('With 3 concurrency', () => {
    let clock;
    before(() => { clock = lolex.install(); });
    after(() => { clock.uninstall(); });

    it('Defaults to a set concurrency', (done) => {
      let maxms;
      let lastTask;
      let q = new Queue((task, callback) => {
        if (lastTask) {
          // Make sure tasks are called in order.
          // Even if they don't finish in order.
          assert.equal(lastTask, task - 1);
        }
        let ms = Math.floor(Math.random() * 1000);
        setTimeout(() => { callback(null); }, ms);
        if (!maxms || ms > maxms) {
          maxms = ms;
        }
      }, { concurrency: 3 });

      let total = 10, called = 0;
      const callback = () => {
        if (++called === total) {
          done();
        }
        process.nextTick(() => { clock.tick(maxms); });
      };

      for (let i = 0; i < total; i++) {
        q.push(i, callback);
        assert.ok(q.active <= 3);
      }
      process.nextTick(() => { clock.tick(maxms); });
    });
  });

  describe('With 1 concurrency', () => {
    it('Runs tasks sequentially one at a time', (done) => {
      let q = new Queue((task, callback) => {
        assert.equal(q.active, 1);
        process.nextTick(() => { callback(null); });
      }, { concurrency: 1 });

      let total = 5, called = 0;
      const callback = () => { if (++called === total) { done(); } };
      for (let i = 0; i < total; i++) {
        q.push(i, callback);
        assert.equal(q.active, 1);
      }
    });
  });

  describe('Call worker callback twice', () => {
    it('Calls task callback once', (done) => {
      let q = new Queue((task, callback) => {
        // Intentionally call callback twice.
        process.nextTick(() => {
          callback(null);
          callback(null);
        });
      });
      q.push({ mytask: 'hello' }, done);
    });
  });

  describe('Kill it halfway', () => {
    it('Does not run additional tasks', (done) => {
      let results = [];
      let q = new Queue((task, callback) => {
        results.push(task);
        process.nextTick(() => {
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
      process.nextTick(() => {
        assert.equal(q.active, 0);
        assert.deepEqual(results, ['a', 'b']);
        done();
      });
    });
  });
});
