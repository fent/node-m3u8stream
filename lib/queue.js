module.exports = class Queue {
  /**
   * A really simple queue with concurrency.
   *
   * @param {Function(Object, Function)} worker
   * @param {Object} options
   */
  constructor(worker, options) {
    this._worker = worker;
    options = options || {};
    this._concurrency = options.concurrency || 1;
    this.tasks = [];
    this.total = 0;
    this.active = 0;
  }


  /**
   * Push a task to the queue.
   *
   * @param {Object} item
   * @param {Function(Error)} callback
   */
  push(item, callback) {
    this.tasks.push({ item, callback });
    this.total++;
    this._next();
  }


  /**
   * Process next job in queue.
   */
  _next() {
    if (this.active >= this._concurrency || !this.tasks.length) { return; }
    const { item, callback } = this.tasks.shift();
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
