'use strict';

module.exports = class Queue {
  /**
   * A really simple queue with concurrency that optionally
   * only adds unique tasks.
   *
   * @param {Function(Object, Function)} worker
   * @param {Object} options
   */
  constructor(worker, options) {
    this._worker = worker;
    options = options || {};
    this._concurrency = options.concurrency || 1;
    this._unique = options.unique;
    this._tasksMap = {};
    this.tasks = [];
    this.active = 0;
  }


  /**
   * Push a task to the queue.
   *
   * @param {Object} item
   * @param {Function(Error)} callback
   */
  push(item) {
    if (this._unique) {
      var key = this._unique(item);
      if (this._tasksMap[key] === true) { return; }
      this._tasksMap[key] = true;
    }
    this.tasks.push(arguments);
    this._next();
  }


  /**
   * Process next job in queue.
   */
  _next() {
    if (this.active >= this._concurrency || !this.tasks.length) { return; }
    var task = this.tasks.shift();
    var item = task[0];
    var callback = task[1];
    var callbackCalled = false;
    this.active++;
    this._worker(item, (err) => {
      if (callbackCalled) { return; }
      if (this._unique) { delete this._tasksMap[this._unique(item)]; }
      this.active--;
      callbackCalled = true;
      if (callback) { callback(err); }
      this._next();
    });
  }


  /**
   * Stops processing queued jobs.
   */
  die() {
    this.tasks = [];
    this._tasksMap = {};
  }
};
