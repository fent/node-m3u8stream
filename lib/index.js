const PassThrough   = require('stream').PassThrough;
const urlResolve    = require('url').resolve;
const miniget       = require('miniget');
const m3u8Parser    = require('./m3u8-parser');
const DashMPDParser = require('./dash-mpd-parser');
const Queue         = require('./queue');
const parseTime     = require('./parse-time');


/**
 * @param {string} playlistURL
 * @param {Object} options
 * @return {stream.Readable}
 */
module.exports = (playlistURL, options) => {
  const stream = new PassThrough();
  options = options || {};
  const chunkReadahead = options.chunkReadahead || 3;
  const liveBuffer = options.liveBuffer || 20000; // 20 seconds
  const requestOptions = options.requestOptions;
  const Parser = {
    'm3u8': m3u8Parser,
    'dash-mpd': DashMPDParser,
  }[options.parser || (/\.mpd$/.test(playlistURL) ? 'dash-mpd' : 'm3u8')];
  if (!Parser) {
    throw TypeError(`parser '${options.parser}' not supported`);
  }
  let relativeBegin = typeof options.begin === 'string';
  let begin = relativeBegin ?
    parseTime.humanStr(options.begin) :
    Math.max(options.begin - liveBuffer, 0) || 0;
  let liveBegin = Date.now() - liveBuffer;

  let currSegment;
  const streamQueue = new Queue((req, callback) => {
    currSegment = req;
    // Count the size manually, since the `content-length` header is not
    // always there.
    let size = 0;
    req.on('data', (chunk) => size += chunk.length);
    req.pipe(stream, { end: false });
    req.on('end', () => callback(size));
  }, { concurrency: 1 });

  let segmentNumber = 0;
  let downloaded = 0;
  const requestQueue = new Queue((segment, callback) => {
    let req = miniget(urlResolve(playlistURL, segment.url), requestOptions);
    req.on('error', callback);
    streamQueue.push(req, (size) => {
      downloaded += size;
      stream.emit('progress', {
        num: ++segmentNumber,
        size: size,
        url: segment.url,
        duration: segment.duration,
      }, requestQueue.total, downloaded);
      callback();
    });
  }, { concurrency: chunkReadahead });

  const onError = (err) => {
    if (ended) { return; }
    stream.emit('error', err);
    // Stop on any error.
    stream.end();
  };

  // When to look for items again.
  let refreshThreshold;
  let minRefreshTime;
  let refreshTimeout;
  let fetchingPlaylist = false;
  let ended = false;
  let isStatic = false;
  let lastRefresh;

  const onQueuedEnd = (err) => {
    currSegment = null;
    if (err) {
      onError(err);
    } else if (!fetchingPlaylist && !ended && !isStatic &&
      requestQueue.tasks.length + requestQueue.active === refreshThreshold) {
      let ms = Math.max(0, minRefreshTime - (Date.now() - lastRefresh));
      refreshTimeout = setTimeout(refreshPlaylist, ms);
    } else if ((ended || isStatic) &&
      !requestQueue.tasks.length && !requestQueue.active) {
      stream.end();
    }
  };

  let currPlaylist;
  let lastSeq;
  const refreshPlaylist = () => {
    fetchingPlaylist = true;
    lastRefresh = Date.now();
    currPlaylist = miniget(playlistURL, requestOptions);
    currPlaylist.on('error', onError);
    const parser = currPlaylist.pipe(new Parser(options.id));
    let starttime = null;
    parser.on('starttime', (a) => {
      starttime = a;
      if (relativeBegin && begin >= 0) {
        begin += starttime;
      }
    });
    parser.on('endlist', () => { isStatic = true; });
    parser.on('endearly', () => { currPlaylist.unpipe(parser); });

    let addedItems = [];
    let liveAddedItems = [];
    const addItem = (item, isLive) => {
      if (item.seq <= lastSeq) { return; }
      lastSeq = item.seq;
      begin = item.time;
      requestQueue.push(item, onQueuedEnd);
      addedItems.push(item);
      if (isLive) {
        liveAddedItems.push(item);
      }
    };

    let tailedItems = [], tailedItemsDuration = 0;
    parser.on('item', (item) => {
      item.time = starttime;
      if (!starttime || begin <= item.time) {
        addItem(item, liveBegin <= item.time);
      } else {
        tailedItems.push(item);
        tailedItemsDuration += item.duration;
        // Only keep the last `liveBuffer` of items.
        while (tailedItems.length > 1 &&
          tailedItemsDuration - tailedItems[0].duration > liveBuffer) {
          tailedItemsDuration -= tailedItems.shift().duration;
        }
      }
      starttime += item.duration;
    });

    parser.on('end', () => {
      currPlaylist = null;
      // If we are too ahead of the stream, make sure to get the
      // latest available items with a small buffer.
      if (!addedItems.length && tailedItems.length) {
        tailedItems.forEach((item) => { addItem(item, true); });
      }

      // Refresh the playlist when remaining segments get low.
      refreshThreshold = Math.max(1, Math.ceil(addedItems.length * 0.01));

      // Throttle refreshing the playlist by looking at the duration
      // of live items added on this refresh.
      minRefreshTime =
        addedItems.reduce(((total, item) => item.duration + total), 0);

      fetchingPlaylist = false;
    });
  };
  refreshPlaylist();

  stream.end = () => {
    ended = true;
    streamQueue.die();
    requestQueue.die();
    clearTimeout(refreshTimeout);
    if (currPlaylist) {
      currPlaylist.unpipe();
      currPlaylist.abort();
    }
    if (currSegment) {
      currSegment.unpipe();
      currSegment.abort();
    }
    PassThrough.prototype.end.call(stream);
  };

  return stream;
};
