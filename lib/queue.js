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
    this.tasks = [];
    this.active = 0;
  }


  /**
   * Push a task to the queue.
   *
   * @param {Object} item
   * @param {Function(Error)} callback
   */
  push() {
    this.tasks.push(arguments);
    this._next();
  }


  /**
   * Process next job in queue.
   */
  _next() {
    if (this.active >= this._concurrency || !this.tasks.length) { return; }
    let task = this.tasks.shift();
    let item = task[0];
    let callback = task[1];
    let callbackCalled = false;
    this.active++;
    this._worker(item, (err) => {
      if (callbackCalled) { return; }
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
  }
};
