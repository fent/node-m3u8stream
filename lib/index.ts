import { PassThrough } from 'stream';
import { resolve as urlResolve } from 'url';
import miniget from 'miniget';
import m3u8Parser from './m3u8-parser';
import DashMPDParser from './dash-mpd-parser';
import Queue from './queue';
import { humanStr } from './parse-time';

interface m3u8streamOptions {
  begin?: number | string;
  liveBuffer?: number;
  chunkReadahead?: number;
  highWaterMark?: number;
  requestOptions?: any;
  parser?: 'm3u8' | 'dash-mpd';
  id?: any;
}

/**
 * @param {string} playlistURL
 * @param {Object} options
 * @return {stream.Readable}
 */
export = (playlistURL: string, options: m3u8streamOptions = {}) => {
  const stream = new PassThrough();
  const chunkReadahead = options.chunkReadahead || 3;
  const liveBuffer = options.liveBuffer || 20000; // 20 seconds
  const requestOptions = options.requestOptions;
  const Parser: any = {
    'm3u8': m3u8Parser,
    'dash-mpd': DashMPDParser,
  }[options.parser || (/\.mpd$/.test(playlistURL) ? 'dash-mpd' : 'm3u8')];
  if (!Parser) {
    throw TypeError(`parser '${options.parser}' not supported`);
  }
  let begin = 0;
  if (typeof options.begin !== 'undefined') {
    begin = typeof options.begin === 'string' ?
      humanStr(options.begin) :
      Math.max(options.begin - liveBuffer, 0);
  }
  let liveBegin = Date.now() - liveBuffer;

  let currSegment;
  const streamQueue = new Queue((req, callback) => {
    currSegment = req;
    // Count the size manually, since the `content-length` header is not
    // always there.
    let size = 0;
    req.on('data', (chunk) => size += chunk.length);
    req.pipe(stream, { end: false });
    req.on('end', () => callback(undefined, size));
  }, { concurrency: 1 });

  let segmentNumber = 0;
  let downloaded = 0;
  const requestQueue = new Queue((segment, callback: () => void) => {
    let req = miniget(urlResolve(playlistURL, segment.url), requestOptions);
    req.on('error', callback);
    streamQueue.push(req, (err, size) => {
      downloaded += +size;
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
    let starttime = 0;
    parser.on('starttime', (a) => {
      starttime = a;
      if (typeof options.begin === 'string'  && begin >= 0) {
        begin += starttime;
      }
    });
    parser.on('endlist', () => { isStatic = true; });
    parser.on('endearly', () => { currPlaylist.unpipe(parser); });

    let addedItems: any[] = [];
    let liveAddedItems: any[] = [];
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

    let tailedItems: any[] = [], tailedItemsDuration = 0;
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
    PassThrough.prototype.end.call(stream, null);
  };

  return stream;
};
