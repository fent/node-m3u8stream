export type Callback = (err: Error | null, result?: any) => void;
interface Task<T> {
  item: T;
  callback?: Callback;
}
type Worker<T> = (item: T, cb: Callback) => void;

export class Queue<T = unknown> {
  private _worker: Worker<T>;
  private _concurrency: number;
  tasks: Task<T>[];
  total: number;
  active: number;

  /**
   * A really simple queue with concurrency.
   *
   * @param {Function} worker
   * @param {Object} options
   * @param {!number} options.concurrency
   */
  constructor(worker: Worker<T>, options: { concurrency?: number } = {}) {
    this._worker = worker;
    this._concurrency = options.concurrency || 1;
    this.tasks = [];
    this.total = 0;
    this.active = 0;
  }


  /**
   * Push a task to the queue.
   *
   *  @param {T} item
   *  @param {!Function} callback
   */
  push(item: T, callback?: Callback): void {
    this.tasks.push({ item, callback });
    this.total++;
    this._next();
  }


  /**
   * Process next job in queue.
   */
  _next(): void {
    if (this.active >= this._concurrency || !this.tasks.length) { return; }
    const { item, callback } = this.tasks.shift() as Task<T>;
    let callbackCalled = false;
    this.active++;
    this._worker(item, (err, result) => {
      if (callbackCalled) { return; }
      this.active--;
      callbackCalled = true;
      callback?.(err, result);
      this._next();
    });
  }


  /**
   * Stops processing queued jobs.
   */
  die(): void {
    this.tasks = [];
  }
}
