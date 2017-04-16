/**
 * A really simple queue with concurrency that optionally only adds unique tasks.
 *
 * @param {Function(Object, Function)} worker
 * @param {Object} options
 */
var Queue = module.exports = function(worker, options) {
  this._worker = worker;
  options = options || {};
  this._concurrency = options.concurrency || 1;
  this._unique = options.unique;
  this._tasksMap = {};
  this.tasks = [];
  this.active = 0;
};


/**
 * Push a task to the queue.
 *
 * @param {Object} item
 * @param {Function(Error)} callback
 */
Queue.prototype.push = function(item) {
  if (this._unique) {
    var key = this._unique(item);
    if (this._tasksMap[key] === true) { return; }
    this._tasksMap[key] = true;
  }
  this.tasks.push(arguments);
  this._next();
};


/**
 * Process next job in queue.
 */
Queue.prototype._next = function() {
  if (this.active >= this._concurrency || !this.tasks.length) { return; }
  var task = this.tasks.shift();
  var item = task[0];
  var callback = task[1];
  var callbackCalled = false;
  var self = this;
  this.active++;
  this._worker(item, function(err) {
    if (callbackCalled) { return; }
    if (self._unique) { delete self._tasksMap[self._unique(item)]; }
    self.active--;
    callbackCalled = true;
    if (callback) { callback(err); }
    self._next();
  });
};


/**
 * Stops processing queued jobs.
 */
Queue.prototype.die = function() {
  this.tasks = [];
  this._tasksMap = {};
};
