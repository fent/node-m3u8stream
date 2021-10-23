import { PassThrough } from 'stream';
import miniget from 'miniget';
import m3u8Parser from './m3u8-parser';
import DashMPDParser from './dash-mpd-parser';
import { Callback, Queue } from './queue';
import { humanStr } from './parse-time';
import { Item } from './parser';


namespace m3u8stream {
  export interface Options {
    begin?: number | string;
    liveBuffer?: number;
    chunkReadahead?: number;
    highWaterMark?: number;
    requestOptions?: miniget.Options;
    parser?: 'm3u8' | 'dash-mpd';
    id?: string;
  }

  export interface Progress {
    num: number;
    size: number;
    duration: number;
    url: string;
  }
  export interface Stream extends PassThrough {
    end: () => void;
    on(event: 'progress', listener: (progress: Progress, totalSegments: number, downloadedBytes: number) => void): this;
    on(event: string | symbol, listener: (...args: any) => void): this;
  }

  export interface m3u8streamFunc {
    (playlistURL: string, options?: m3u8stream.Options): Stream;
    parseTimestamp(time: number | string): number;
  }
}

interface TimedItem extends Item {
  time: number;
}

const supportedParsers = {
  m3u8: m3u8Parser,
  'dash-mpd': DashMPDParser,
};

let m3u8stream = ((playlistURL: string, options: m3u8stream.Options = {}): m3u8stream.Stream => {
  const stream = new PassThrough() as m3u8stream.Stream;
  const chunkReadahead = options.chunkReadahead || 3;
  // 20 seconds.
  const liveBuffer = options.liveBuffer || 20000;
  const requestOptions = options.requestOptions;
  const Parser = supportedParsers[options.parser || (/\.mpd$/.test(playlistURL) ? 'dash-mpd' : 'm3u8')];
  if (!Parser) {
    throw TypeError(`parser '${options.parser}' not supported`);
  }
  let begin = 0;
  if (typeof options.begin !== 'undefined') {
    begin = typeof options.begin === 'string' ?
      humanStr(options.begin) :
      Math.max(options.begin - liveBuffer, 0);
  }

  const forwardEvents = (req: miniget.Stream) => {
    for (let event of ['abort', 'request', 'response', 'redirect', 'retry', 'reconnect']) {
      req.on(event, stream.emit.bind(stream, event));
    }
  };

  let currSegment: miniget.Stream | null;
  const streamQueue = new Queue((req: miniget.Stream, callback): void => {
    currSegment = req;
    // Count the size manually, since the `content-length` header is not
    // always there.
    let size = 0;
    req.on('data', (chunk: Buffer) => size += chunk.length);
    req.pipe(stream, { end: false });
    req.on('end', () => callback(null, size));
  }, { concurrency: 1 });

  let segmentNumber = 0;
  let downloaded = 0;
  const requestQueue = new Queue((segment: Item, callback: Callback): void => {
    let reqOptions = Object.assign({}, requestOptions);
    if (segment.range) {
      reqOptions.headers = Object.assign({}, reqOptions.headers, {
        Range: `bytes=${segment.range.start}-${segment.range.end}`,
      });
    }
    let req = miniget(new URL(segment.url, playlistURL).toString(), reqOptions);
    req.on('error', callback);
    forwardEvents(req);
    streamQueue.push(req, (_, size) => {
      downloaded += +size;
      stream.emit('progress', {
        num: ++segmentNumber,
        size: size,
        duration: segment.duration,
        url: segment.url,
      }, requestQueue.total, downloaded);
      callback(null);
    });
  }, { concurrency: chunkReadahead });

  const onError = (err: Error): void => {
    stream.emit('error', err);
    // Stop on any error.
    stream.end();
  };

  // When to look for items again.
  let refreshThreshold: number;
  let minRefreshTime: number;
  let refreshTimeout: NodeJS.Timer;
  let fetchingPlaylist = true;
  let ended = false;
  let isStatic = false;
  let lastRefresh: number;

  const onQueuedEnd = (err: Error | null): void => {
    currSegment = null;
    if (err) {
      onError(err);
    } else if (!fetchingPlaylist && !ended && !isStatic &&
      requestQueue.tasks.length + requestQueue.active <= refreshThreshold) {
      let ms = Math.max(0, minRefreshTime - (Date.now() - lastRefresh));
      fetchingPlaylist = true;
      refreshTimeout = setTimeout(refreshPlaylist, ms);
    } else if ((ended || isStatic) &&
      !requestQueue.tasks.length && !requestQueue.active) {
      stream.end();
    }
  };

  let currPlaylist: miniget.Stream | null;
  let lastSeq: number;
  let starttime = 0;

  const refreshPlaylist = (): void => {
    lastRefresh = Date.now();
    currPlaylist = miniget(playlistURL, requestOptions);
    currPlaylist.on('error', onError);
    forwardEvents(currPlaylist);
    const parser = currPlaylist.pipe(new Parser(options.id));
    parser.on('starttime', (a: number) => {
      if (starttime) { return; }
      starttime = a;
      if (typeof options.begin === 'string' && begin >= 0) {
        begin += starttime;
      }
    });
    parser.on('endlist', () => { isStatic = true; });
    parser.on('endearly', currPlaylist.unpipe.bind(currPlaylist, parser));

    let addedItems: any[] = [];
    const addItem = (item: TimedItem): void => {
      if (!item.init) {
        if (item.seq <= lastSeq) { return; }
        lastSeq = item.seq;
      }
      begin = item.time;
      requestQueue.push(item, onQueuedEnd);
      addedItems.push(item);
    };

    let tailedItems: TimedItem[] = [], tailedItemsDuration = 0;
    parser.on('item', (item: Item) => {
      let timedItem = { time: starttime, ...item };
      if (begin <= timedItem.time) {
        addItem(timedItem);
      } else {
        tailedItems.push(timedItem);
        tailedItemsDuration += timedItem.duration;
        // Only keep the last `liveBuffer` of items.
        while (tailedItems.length > 1 &&
          tailedItemsDuration - tailedItems[0].duration > liveBuffer) {
          const lastItem = tailedItems.shift() as TimedItem;
          tailedItemsDuration -= lastItem.duration;
        }
      }
      starttime += timedItem.duration;
    });

    parser.on('end', () => {
      currPlaylist = null;
      // If we are too ahead of the stream, make sure to get the
      // latest available items with a small buffer.
      if (!addedItems.length && tailedItems.length) {
        tailedItems.forEach(item => { addItem(item); });
      }

      // Refresh the playlist when remaining segments get low.
      refreshThreshold = Math.max(1, Math.ceil(addedItems.length * 0.01));

      // Throttle refreshing the playlist by looking at the duration
      // of live items added on this refresh.
      minRefreshTime =
        addedItems.reduce((total, item) => item.duration + total, 0);

      fetchingPlaylist = false;
      onQueuedEnd(null);
    });
  };
  refreshPlaylist();

  stream.end = (): void => {
    ended = true;
    streamQueue.die();
    requestQueue.die();
    clearTimeout(refreshTimeout);
    currPlaylist?.destroy();
    currSegment?.destroy();
    PassThrough.prototype.end.call(stream, null);
  };

  return stream;
}) as m3u8stream.m3u8streamFunc;
m3u8stream.parseTimestamp = humanStr;

export = m3u8stream;
