const PassThrough = require('stream').PassThrough;
const urlResolve  = require('url').resolve;
const miniget     = require('miniget');
const m3u8        = require('./m3u8-parser');
const Queue       = require('./queue');


/**
 * @param {String} playlistURL
 * @param {Object} options
 * @return {stream.Readable}
 */
module.exports = function(playlistURL, options) {
  var stream = new PassThrough();
  options = options || {};
  var chunkReadahead = options.chunkReadahead || 3;
  var refreshInterval = options.refreshInterval || 600000; // 10 minutes

  var latestSegment;
  var streamQueue = new Queue(function(segment, callback) {
    latestSegment = segment;
    segment.pipe(stream, { end: false });
    segment.on('error', callback);
    segment.on('end', callback);
  }, { concurrency: 1 });

  var requestQueue = new Queue(function(segmentURL, callback) {
    streamQueue.push(miniget(urlResolve(playlistURL, segmentURL)), callback);
  }, {
    concurrency: chunkReadahead,
    unique: function(segmentURL) { return segmentURL; },
  });

  function onError(err) {
    stream.emit('error', err);
    // Stop on any error.
    stream.end();
  }

  // When to look for items again.
  var refreshThreshold;
  var fetchingPlaylist = false;
  var destroyed = false;
  var ended = false;
  function onQueuedEnd(err) {
    if (err) {
      onError(err);
    } else if (!fetchingPlaylist && !destroyed && !ended &&
      requestQueue.tasks.length + requestQueue.active === refreshThreshold) {
      refreshPlaylist();
    } else if (ended && !requestQueue.tasks.length && !requestQueue.active) {
      stream.end();
    }
  }

  var tid;
  function refreshPlaylist() {
    clearTimeout(tid);
    fetchingPlaylist = true;
    var req = miniget(playlistURL);
    req.on('error', onError);
    var parser = req.pipe(new m3u8());
    parser.on('tag', function(tagName) {
      if (tagName === 'EXT-X-ENDLIST') {
        ended = true;
        req.unpipe();
        clearTimeout(tid);
      }
    });
    var totalItems = 0;
    parser.on('item', function(item) {
      totalItems++;
      requestQueue.push(item, onQueuedEnd);
    });
    parser.on('end', function() {
      refreshThreshold = Math.ceil(totalItems * 0.01);
      tid = setTimeout(refreshPlaylist, refreshInterval);
      fetchingPlaylist = false;
    });
  }
  refreshPlaylist();

  stream.end = function() {
    destroyed = true;
    streamQueue.die();
    requestQueue.die();
    clearTimeout(tid);
    if (latestSegment) { latestSegment.unpipe(); }
    PassThrough.prototype.end.call(stream);
  };

  return stream;
};
