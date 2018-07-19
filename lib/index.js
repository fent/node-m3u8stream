const PassThrough = require('stream').PassThrough;
const urlResolve  = require('url').resolve;
const miniget     = require('miniget');
const m3u8        = require('./m3u8-parser');
const Queue       = require('./queue');
const parseTime   = require('./parse-time');


/**
 * @param {String} playlistURL
 * @param {Object} options
 * @return {stream.Readable}
 */
module.exports = (playlistURL, options) => {
  const stream = new PassThrough();
  options = options || {};
  const chunkReadahead = options.chunkReadahead || 3;
  const liveBuffer = options.liveBuffer || 20000; // 20 seconds
  const requestOptions = options.requestOptions;
  let relativeBegin = typeof options.begin === 'string';
  let begin = relativeBegin ?
    parseTime(options.begin) :
    Math.max(options.begin - liveBuffer, 0) || 0;

  let currSegment;
  const streamQueue = new Queue((segment, callback) => {
    currSegment = segment;
    segment.pipe(stream, { end: false });
    segment.on('end', callback);
  }, { concurrency: 1 });

  const requestQueue = new Queue((segmentURL, callback) => {
    let segment = miniget(urlResolve(playlistURL, segmentURL), requestOptions);
    segment.on('error', callback);
    streamQueue.push(segment, callback);
  }, { concurrency: chunkReadahead });

  function onError(err) {
    if (destroyed) { return; }
    stream.emit('error', err);
    // Stop on any error.
    stream.end();
  }

  // When to look for items again.
  let refreshThreshold;
  let fetchingPlaylist = false;
  let destroyed = false;
  let ended = false;
  let lastPlaylistItems = new Set();

  function onQueuedEnd(err) {
    currSegment = null;
    if (err) {
      onError(err);
    } else if (!fetchingPlaylist && !destroyed && !ended &&
      requestQueue.tasks.length + requestQueue.active === refreshThreshold) {
      refreshPlaylist();
    } else if (ended && !requestQueue.tasks.length && !requestQueue.active) {
      stream.end();
    }
  }

  let currPlaylist;
  function refreshPlaylist() {
    fetchingPlaylist = true;
    currPlaylist = miniget(playlistURL, requestOptions);
    currPlaylist.on('error', onError);
    const parser = currPlaylist.pipe(new m3u8());

    let currTime, nextItemDuration;
    parser.on('tag', (tagName, value) => {
      switch (tagName) {
        case 'EXT-X-PROGRAM-DATE-TIME':
          currTime = new Date(value).getTime();
          if (relativeBegin && begin >= 0) {
            begin += currTime;
          }
          break;
        case 'EXTINF':
          nextItemDuration = Math.round(parseFloat(value.split(',')[0], 10) * 1000);
          break;
        case 'EXT-X-ENDLIST':
          ended = true;
          break;
      }
    });

    let currPlaylistItems = new Set();
    function addItem(time, item) {
      if (lastPlaylistItems.has(item)) { return; }
      begin = time;
      currPlaylistItems.add(item);
      requestQueue.push(item, onQueuedEnd);
    }

    let tailedItems = [], tailedItemsDuration = 0;
    parser.on('item', (item) => {
      if (!currTime || begin <= currTime) {
        addItem(currTime, item);
      } else {
        tailedItems.push([nextItemDuration, currTime, item]);
        tailedItemsDuration += nextItemDuration;
        // Only keep the last `liveBuffer` of items.
        while (tailedItems.length > 1 &&
          tailedItemsDuration - tailedItems[0][0] > liveBuffer) {
          tailedItemsDuration -= tailedItems.shift()[0];
        }
      }
      currTime += nextItemDuration;
    });

    parser.on('end', () => {
      currPlaylist = null;
      // If stream is behind by a bit, make sure to get the latest available
      // items with a small buffer.
      if (!currPlaylistItems.size && tailedItems.length) {
        tailedItems.forEach((item) => {
          addItem(item[1], item[2]);
        });
      }

      // Refresh the playlist when remaining segments get low.
      refreshThreshold = Math.max(1, Math.ceil(currPlaylistItems.size * 0.01));
      fetchingPlaylist = false;
      lastPlaylistItems = currPlaylistItems;
    });
  }
  refreshPlaylist();

  stream.end = () => {
    destroyed = true;
    streamQueue.die();
    requestQueue.die();
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
