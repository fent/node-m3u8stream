interface Task {
  item: {};
  callback: (ret: Error | number) => void;
}

export default class Queue {
  _worker: (item: any, cb: (err: Error | number) => void) => void;
  _concurrency: number;
  tasks: Task[];
  total: number;
  active: number;

  /**
   * A really simple queue with concurrency.
   *
   * @param {Function(Object, Function)} worker
   * @param {Object} options
   */
  constructor(worker: (item: any, cb: (ret: Error | number) => void) => void, options?: { concurrency?: number }) {
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
  push(item: {}, callback: (ret: number | Error) => void) {
    this.tasks.push({ item, callback });
    this.total++;
    this._next();
  }


  /**
   * Process next job in queue.
   */
  _next() {
    if (this.active >= this._concurrency || !this.tasks.length) { return; }
    const { item, callback } = this.tasks.shift() as Task;
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
}
