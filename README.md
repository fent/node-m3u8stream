# node-m3u8stream

Reads segments from a [m3u8 playlist][1] or [DASH MPD file][2] into a consumable stream.

[1]: https://tools.ietf.org/html/draft-pantos-http-live-streaming-20
[2]: https://dashif.org/docs/DASH-IF-IOP-v4.2-clean.pdf

[![npm](https://img.shields.io/npm/v/m3u8stream)](https://www.npmjs.com/package/m3u8stream)
[![Node.js CI](https://github.com/fent/node-m3u8stream/actions/workflows/nodejs.yml/badge.svg)](https://github.com/fent/node-m3u8stream/actions/workflows/nodejs.yml)
[![codecov](https://codecov.io/gh/fent/node-m3u8stream/branch/master/graph/badge.svg)](https://codecov.io/gh/fent/node-m3u8stream)

# Usage

```js
const fs = require('fs');
const m3u8stream = require('m3u8stream');

m3u8stream('http://somesite.com/link/to/the/playlist.m3u8').pipe(
  fs.createWriteStream('videofile.mp4'),
);
```

# API

### m3u8stream(url, [options])

Creates a readable stream of binary media data. `options` can have the following

- `begin` - Where to begin playing the video. Accepts an absolute unix timestamp or date and a relative time in the formats `1:23:45.123` and `1m2s`.
- `end` - Where to stop downloading the video. Accepts an absolute unix timestamp or date and a relative time in the formats `1:23:45.123` and `1m2s`. Cannot be used together with `duration`.
- `duration` - How much of the video to download from `begin`. Accepts a duration in milliseconds or human-readable format like `1m30s`. Cannot be used together with `end`.
- `liveBuffer` - How much buffer in milliseconds to have for live streams. Default is `20000`.
- `chunkReadahead` - How many chunks to preload ahead. Default is `3`.
- `highWaterMark` - How much of the download to buffer into the stream. See [node's docs](https://nodejs.org/api/stream.html#stream_constructor_new_stream_writable_options) for more. Note that the actual amount buffered can be higher since each chunk request maintains its own buffer.
- `requestOptions` - Any options you want to pass to [miniget](https://github.com/fent/node-miniget), such as `headers`.
- `parser` - Either "m3u8" or "dash-mpd". Defaults to guessing based on the playlist url ending in `.m3u8` or `.mpd`.
- `id` - For playlists containing multiple media options (HLS master playlists and DASH MPD manifests). If not given, the first stream will be picked. Can be:
  - Quality keywords: `'highest'` / `'best'` or `'lowest'` / `'worst'` (bandwidth-based).
  - Resolution shorthand: e.g. `'1080p'`, `'720p'`, `'1920x1080'`.
  - Specific identifier: DASH representation `id`, HLS variant `NAME`, URL or filename, or 0-based index.
  - A predicate function: `(variant: Variant) => boolean`.

### Stream#end()

If called, stops requesting segments, and refreshing the playlist.

#### Event: progress

- `Object` - Current segment with the following fields,
  - `number` - num
  - `number` - size
  - `number` - duration
  - `string` - url
- `number` - Total number of segments.
- `number` - Bytes downloaded up to this point.

For static non-live playlists, emitted each time a segment has finished downloading. Since total download size is unknown until all segment endpoints are hit, progress is calculated based on how many segments are available.

#### miniget events

All [miniget events](https://github.com/fent/node-miniget#event-redirect) are forwarded and can be listened to from the returned stream.

### m3u8stream.parseTimestamp(time)

Converts human friendly time to milliseconds. Supports the format  
00:00:00.000 for hours, minutes, seconds, and milliseconds respectively.  
And 0ms, 0s, 0m, 0h, and together 1m1s.

- `time` - A string (or number) giving the user-readable input data

# Install

    npm install m3u8stream

# Tests

Tests are written with [mocha](https://mochajs.org)

```bash
npm test
```
