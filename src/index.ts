import { PassThrough, Readable } from 'stream';
import miniget from 'miniget';
import m3u8Parser from './m3u8-parser';
import DashMPDParser from './dash-mpd-parser';
import { Callback, Queue } from './queue';
import { humanStr } from './parse-time';
import KeyManager from './key-manager';
import { Item, isSet } from './parser';

namespace m3u8stream {
  export interface Options {
    begin?: number | string;
    end?: number | string;
    duration?: number | string;
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
    end: () => this;
    on(
      event: 'progress',
      listener: (
        progress: Progress,
        totalSegments: number,
        downloadedBytes: number,
      ) => void,
    ): this;
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

let m3u8stream = ((
  playlistURL: string,
  options: m3u8stream.Options = {},
): m3u8stream.Stream => {
  const stream = new PassThrough({
    highWaterMark: options.highWaterMark,
  }) as m3u8stream.Stream;
  const chunkReadahead = options.chunkReadahead || 3;
  // 20 seconds.
  const liveBuffer = options.liveBuffer || 20000;
  const requestOptions = options.requestOptions;
  const Parser =
    supportedParsers[
      options.parser || (/\.mpd$/.test(playlistURL) ? 'dash-mpd' : 'm3u8')
    ];
  if (!Parser) {
    throw TypeError(`parser '${options.parser}' not supported`);
  }
  if (isSet(options.end) && isSet(options.duration)) {
    throw TypeError('Options `end` and `duration` cannot be used together');
  }

  const isRelativeTime = (time?: number | string): boolean =>
    typeof time === 'string';
  const isAbsoluteTime = (time?: number | string): boolean =>
    typeof time === 'number';

  let begin = 0;
  if (isSet(options.begin)) {
    begin = isRelativeTime(options.begin)
      ? humanStr(options.begin)
      : (options.begin as number);
  }
  let end = Infinity;
  if (isSet(options.end)) {
    end = isRelativeTime(options.end)
      ? humanStr(options.end)
      : (options.end as number);
  } else if (isSet(options.duration)) {
    end =
      begin +
      (isRelativeTime(options.duration)
        ? humanStr(options.duration)
        : (options.duration as number));
  }
  const sameTimeBasis =
    isSet(options.duration) ||
    (isRelativeTime(options.end) && !isSet(options.begin)) ||
    (isRelativeTime(options.begin) && isRelativeTime(options.end)) ||
    (isAbsoluteTime(options.begin) && isAbsoluteTime(options.end));
  if (sameTimeBasis && begin >= end) {
    throw RangeError('Option `begin` must be before `end`');
  }

  const forwardEvents = (req: miniget.Stream) => {
    for (let event of [
      'abort',
      'request',
      'response',
      'redirect',
      'retry',
      'reconnect',
    ]) {
      req.on(event, stream.emit.bind(stream, event));
    }
  };

  let currSegment: Readable | null;
  const streamQueue = new Queue(
    (req: Readable, callback): void => {
      currSegment = req;
      // Count the size manually, since the `content-length` header is not
      // always there.
      let size = 0;
      req.on('data', (chunk: Buffer) => (size += chunk.length));
      req.pipe(stream, { end: false });
      req.on('end', () => callback(null, size));
    },
    { concurrency: 1 },
  );

  const keyManager = new KeyManager(requestOptions);

  let segmentNumber = 0;
  let downloaded = 0;
  const requestQueue = new Queue(
    (segment: Item, callback: Callback): void => {
      let reqOptions = Object.assign({}, requestOptions);
      if (segment.range) {
        reqOptions.headers = Object.assign({}, reqOptions.headers, {
          Range: `bytes=${segment.range.start}-${segment.range.end}`,
        });
      }
      const req = miniget(
        new URL(segment.url, playlistURL).toString(),
        reqOptions,
      );
      forwardEvents(req);

      const segmentStream = new PassThrough();
      segmentStream.on('error', () => undefined);

      const destroyWithError = (err: Error) => {
        req.destroy();
        segmentStream.destroy(err);
        callback(err);
      };

      req.on('error', destroyWithError);

      streamQueue.push(segmentStream, (_, size) => {
        downloaded += +size;
        stream.emit(
          'progress',
          {
            num: ++segmentNumber,
            size: size,
            duration: segment.duration,
            url: segment.url,
          },
          requestQueue.total,
          downloaded,
        );
        callback(null);
      });

      keyManager
        .getDecipher(segment.key, playlistURL, segment.seq)
        .then((decipher) => {
          if (ended) {
            req.destroy();
            segmentStream.destroy();
            return;
          }
          if (decipher) {
            decipher.on('error', destroyWithError);
            decipher.on('close', () => req.destroy());
            req.pipe(decipher).pipe(segmentStream);
          } else {
            req.pipe(segmentStream);
          }
        })
        .catch((err) => {
          if (ended) {
            return;
          }
          destroyWithError(err);
        });
    },
    { concurrency: chunkReadahead },
  );

  const onError = (err: Error): void => {
    stream.emit('error', err);
    // Stop on any error.
    stream.end();
  };

  // When to look for items again.
  let refreshThreshold: number;
  let minRefreshTime: number;
  let refreshTimeout: NodeJS.Timeout;
  let fetchingPlaylist = true;
  let ended = false;
  let noMoreItems = false;
  let lastRefresh: number;

  const onQueuedEnd = (err: Error | null): void => {
    currSegment = null;
    if (err) {
      onError(err);
    } else if (
      !fetchingPlaylist &&
      !ended &&
      !noMoreItems &&
      requestQueue.tasks.length + requestQueue.active <= refreshThreshold
    ) {
      let ms = Math.max(0, minRefreshTime - (Date.now() - lastRefresh));
      fetchingPlaylist = true;
      refreshTimeout = setTimeout(refreshPlaylist, ms);
    } else if (
      (ended || noMoreItems) &&
      !requestQueue.tasks.length &&
      !requestQueue.active
    ) {
      stream.end();
    }
  };

  let currPlaylist: miniget.Stream | null;
  let lastSeq: number;
  let starttime = 0;
  let targetDuration = 0;
  let lastDuration = 0;

  const refreshPlaylist = (): void => {
    lastRefresh = Date.now();
    currPlaylist = miniget(playlistURL, requestOptions);
    currPlaylist.on('error', onError);
    forwardEvents(currPlaylist);
    const parser = currPlaylist.pipe(new Parser(options.id));
    parser.on('error', onError);
    parser.on('starttime', (a: number) => {
      if (starttime) {
        return;
      }
      starttime = a;

      if (isSet(options.duration) && !isSet(options.begin)) {
        begin += starttime;
        end += starttime;
      }
      if (isRelativeTime(options.begin) && begin >= 0) {
        begin += starttime;
        if (isSet(options.duration)) {
          end += starttime;
        }
      }
      if (isRelativeTime(options.end)) {
        end += starttime;
      }
      if (begin >= end) {
        onError(new RangeError('Option `begin` must be before `end`'));
      }
    });
    parser.on('endlist', () => {
      noMoreItems = true;
    });
    parser.on('endearly', currPlaylist.unpipe.bind(currPlaylist, parser));
    parser.on('targetduration', (ms: number) => {
      targetDuration = ms;
    });
    const variants: { url: string; index: number; name: string | null }[] = [];
    parser.on('variant', (variant) => {
      variants.push(variant);
    });

    let addedItems: any[] = [];
    const addItem = (item: TimedItem): void => {
      if (!item.init) {
        if (item.seq <= lastSeq) {
          return;
        }
        lastSeq = item.seq;
      }
      begin = item.time;
      requestQueue.push(item, onQueuedEnd);
      addedItems.push(item);
    };

    let tailedItems: TimedItem[] = [],
      tailedItemsDuration = 0;
    parser.on('item', (item: Item) => {
      let timedItem = { time: starttime, ...item };
      if (timedItem.time >= end) {
        noMoreItems = true;
        return;
      }
      if (begin <= timedItem.time) {
        addItem(timedItem);
      } else {
        tailedItems.push(timedItem);
        tailedItemsDuration += timedItem.duration;
        // Only keep the last `liveBuffer` of items.
        while (
          tailedItems.length > 1 &&
          tailedItemsDuration - tailedItems[0].duration > liveBuffer
        ) {
          const lastItem = tailedItems.shift() as TimedItem;
          tailedItemsDuration -= lastItem.duration;
        }
      }
      starttime += timedItem.duration;
      lastDuration = timedItem.duration || lastDuration;
    });

    parser.on('end', () => {
      currPlaylist = null;
      // This is a master playlist, follow the chosen variant stream.
      if (variants.length) {
        const variant =
          options.id === undefined
            ? variants[0]
            : variants.find((v) => v.name === options.id) ||
              variants.find((v) => {
                const pathname = new URL(v.url, playlistURL).pathname;
                const lastPart = pathname.split('/').filter(Boolean).pop();
                return lastPart === options.id;
              }) ||
              variants.find((v) => `${v.index}` === options.id);
        if (!variant) {
          onError(new Error(`variant stream '${options.id}' not found`));
          return;
        }
        playlistURL = new URL(variant.url, playlistURL).toString();
        refreshPlaylist();
        return;
      }

      // If we are too ahead of the stream, make sure to get the
      // latest available items with a small buffer.
      if (!addedItems.length && tailedItems.length) {
        tailedItems.forEach((item) => {
          addItem(item);
        });
      }

      // Refresh the playlist when remaining segments get low.
      refreshThreshold = Math.max(1, Math.ceil(addedItems.length * 0.01));

      // Reload after the target duration, or half of it if nothing new came
      // in (RFC 8216 6.3.4). DASH has no target duration, so the last
      // segment's stands in.
      minRefreshTime =
        (targetDuration || lastDuration) / (addedItems.length ? 1 : 2);

      fetchingPlaylist = false;
      onQueuedEnd(null);
    });
  };
  refreshPlaylist();

  stream.end = () => {
    ended = true;
    streamQueue.die();
    requestQueue.die();
    clearTimeout(refreshTimeout);
    currPlaylist?.destroy();
    currSegment?.destroy();
    keyManager.clear();
    PassThrough.prototype.end.apply(stream);
    return stream;
  };

  return stream;
}) as m3u8stream.m3u8streamFunc;
m3u8stream.parseTimestamp = humanStr;

export = m3u8stream;
