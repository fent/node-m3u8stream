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
module.exports = (playlistURL, options) => {
  var stream = new PassThrough();
  options = options || {};
  var chunkReadahead = options.chunkReadahead || 3;
  var refreshInterval = options.refreshInterval || 600000; // 10 minutes
  var requestOptions = options.requestOptions;

  var latestSegment;
  var streamQueue = new Queue((segment, callback) => {
    latestSegment = segment;
    segment.pipe(stream, { end: false });
    segment.on('end', callback);
  }, { concurrency: 1 });

  var requestQueue = new Queue((segmentURL, callback) => {
    var segment = miniget(urlResolve(playlistURL, segmentURL), requestOptions);
    segment.on('error', callback);
    streamQueue.push(segment, callback);
  }, {
    concurrency: chunkReadahead,
    unique: (segmentURL) => segmentURL,
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
    var req = miniget(playlistURL, requestOptions);
    req.on('error', onError);
    var parser = req.pipe(new m3u8());
    parser.on('tag', (tagName) => {
      if (tagName === 'EXT-X-ENDLIST') {
        ended = true;
        req.unpipe();
        clearTimeout(tid);
      }
    });
    var totalItems = 0;
    parser.on('item', (item) => {
      totalItems++;
      requestQueue.push(item, onQueuedEnd);
    });
    parser.on('end', () => {
      refreshThreshold = Math.ceil(totalItems * 0.01);
      tid = setTimeout(refreshPlaylist, refreshInterval);
      fetchingPlaylist = false;
    });
  }
  refreshPlaylist();

  stream.end = () => {
    destroyed = true;
    streamQueue.die();
    requestQueue.die();
    clearTimeout(tid);
    if (latestSegment) { latestSegment.unpipe(); }
    PassThrough.prototype.end.call(stream);
  };

  return stream;
};
