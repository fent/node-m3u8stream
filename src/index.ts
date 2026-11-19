import { PassThrough, Readable } from 'stream';
import miniget from 'miniget';
import m3u8Parser from './m3u8-parser';
import DashMPDParser from './dash-mpd-parser';
import { Callback, Queue } from './queue';
import { humanStr } from './parse-time';
import KeyManager from './key-manager';
import {
  Item,
  isSet,
  selectVariant,
  Variant as ParserVariant,
  VariantFilter as ParserVariantFilter,
} from './parser';

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
    id?: VariantFilter;
  }

  export type Variant = ParserVariant;
  export type VariantFilter = ParserVariantFilter;

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
    m3u8stream: m3u8streamFunc;
    default: m3u8streamFunc;
  }
}

interface TimedItem extends Item {
  time: number;
}

const formatByteRange = (range: { start: number; end?: number }): string =>
  `${range.start}-${range.end ?? ''}`;

const itemKey = (
  url: string,
  range?: { start: number; end?: number },
): string => (range ? `${url}@${formatByteRange(range)}` : url);

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
  const parserType =
    options.parser || (/\.mpd$/.test(playlistURL) ? 'dash-mpd' : 'm3u8');
  const Parser = supportedParsers[parserType];
  if (!Parser) {
    throw TypeError(`parser '${options.parser}' not supported`);
  }
  const isDash = parserType === 'dash-mpd';
  if (isSet(options.end) && isSet(options.duration)) {
    throw TypeError('Options `end` and `duration` cannot be used together');
  }

  const isLive = options.begin === 'live';
  const applyLiveBuffer = (time: number): number =>
    isLive ? Math.max(time - liveBuffer, 0) : time;
  const isRelativeTime = (time?: number | string): boolean =>
    typeof time === 'string' && time !== 'live';
  const isAbsoluteTime = (time?: number | string): boolean =>
    typeof time === 'number';

  let begin = isLive ? Infinity : 0;
  if (isSet(options.begin) && !isLive) {
    begin = isRelativeTime(options.begin)
      ? humanStr(options.begin)
      : applyLiveBuffer(options.begin as number);
  }
  const durationMs = isSet(options.duration)
    ? isRelativeTime(options.duration)
      ? humanStr(options.duration)
      : (options.duration as number)
    : undefined;

  let end = Infinity;
  if (isSet(options.end)) {
    end = isRelativeTime(options.end)
      ? humanStr(options.end)
      : applyLiveBuffer(options.end as number);
  } else if (isSet(durationMs) && !isLive) {
    end = begin + durationMs;
  }
  const sameTimeBasis =
    !isLive &&
    (isSet(options.duration) ||
      (isRelativeTime(options.end) && !isSet(options.begin)) ||
      (isRelativeTime(options.begin) && isRelativeTime(options.end)) ||
      (isAbsoluteTime(options.begin) && isAbsoluteTime(options.end)));
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

  const keyManager = new KeyManager(requestOptions, forwardEvents);

  let segmentNumber = 0;
  let downloaded = 0;
  const requestQueue = new Queue(
    (segment: Item, callback: Callback): void => {
      let reqOptions = Object.assign({}, requestOptions);
      if (segment.range) {
        reqOptions.headers = Object.assign({}, reqOptions.headers, {
          Range: `bytes=${formatByteRange(segment.range)}`,
        });
      }
      const req = miniget(
        new URL(segment.url, playlistURL).toString(),
        reqOptions,
      );
      forwardEvents(req);

      const segmentStream = new PassThrough();
      segmentStream.on('error', () => undefined);
      segmentStream.on('close', () => req.destroy());

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
  let lastInit: string;
  const seenDashItems = new Set<string>();
  const maxSeenDashItems = 1000;
  const evictOldestSeen = (): void => {
    const oldest = seenDashItems.values().next().value;
    seenDashItems.delete(oldest!);
  };
  let starttime = 0;
  let targetDuration = 0;
  let lastDuration = 0;

  const refreshPlaylist = (): void => {
    lastRefresh = Date.now();
    currPlaylist = miniget(playlistURL, requestOptions);
    currPlaylist.on('error', onError);
    currPlaylist.on('redirect', (redirectURL: string) => {
      playlistURL = new URL(redirectURL, playlistURL).toString();
    });
    forwardEvents(currPlaylist);
    const parser = currPlaylist.pipe(new Parser(options.id));
    parser.on('error', onError);
    parser.on('starttime', (a: number) => {
      if (starttime) {
        return;
      }
      starttime = a;

      if (isSet(durationMs) && !isSet(options.begin)) {
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
      if (!isLive && begin >= end) {
        onError(new RangeError('Option `begin` must be before `end`'));
      }
    });
    parser.on('endlist', () => {
      noMoreItems = true;
    });
    parser.on('targetduration', (ms: number) => {
      targetDuration = ms;
    });
    const variants: m3u8stream.Variant[] = [];
    parser.on('variant', (variant: m3u8stream.Variant) => {
      variants.push(variant);
    });

    let addedItems: any[] = [];
    const addItem = (item: TimedItem): void => {
      if (item.init) {
        const initKey = itemKey(item.url, item.range);
        if (initKey === lastInit) {
          return;
        }
        lastInit = initKey;
      } else if (isDash) {
        const key = `${itemKey(item.url, item.range)}@${item.seq}`;
        if (seenDashItems.has(key)) {
          return;
        }
        seenDashItems.add(key);
        if (seenDashItems.size > maxSeenDashItems) {
          evictOldestSeen();
        }
      } else {
        if (item.seq <= lastSeq) {
          return;
        }
        lastSeq = item.seq;
      }
      if (isLive && isSet(durationMs) && end === Infinity) {
        end = item.time + durationMs;
      }
      if (item.time >= end) {
        noMoreItems = true;
        return;
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
        const variant = selectVariant(variants, options.id);
        if (!variant) {
          onError(new Error(`variant stream '${options.id}' not found`));
          return;
        }
        playlistURL = new URL(variant.url as string, playlistURL).toString();
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
      minRefreshTime = Math.max(
        250,
        (targetDuration || lastDuration) / (addedItems.length ? 1 : 2),
      );

      fetchingPlaylist = false;
      onQueuedEnd(null);
    });
  };
  refreshPlaylist();

  const cleanup = (): void => {
    ended = true;
    for (const task of streamQueue.tasks) {
      task.item.destroy();
    }
    streamQueue.die();
    requestQueue.die();
    clearTimeout(refreshTimeout);
    currPlaylist?.destroy();
    currSegment?.destroy();
    keyManager.clear();
  };

  stream._destroy = (
    err: Error | null,
    callback: (error?: Error | null) => void,
  ): void => {
    cleanup();
    callback(err);
  };

  stream.end = () => {
    cleanup();
    PassThrough.prototype.end.apply(stream);
    return stream;
  };

  return stream;
}) as m3u8stream.m3u8streamFunc;
m3u8stream.parseTimestamp = humanStr;
m3u8stream.m3u8stream = m3u8stream;
m3u8stream.default = m3u8stream;

// Statically recognizable exports for Node.js cjs-module-lexer (ESM named import support)
module.exports.default = m3u8stream;
module.exports.m3u8stream = m3u8stream;
module.exports.parseTimestamp = m3u8stream.parseTimestamp;

export = m3u8stream;
