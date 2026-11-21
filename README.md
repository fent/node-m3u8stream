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

# Tested streams

Compatibility is checked against these public streams. They are third-party resources and may change or disappear.

| Type                       | Covers                                                                 | Stream                                                                                                                        | Notes                                                                           |
| -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| HLS VOD (TS)               | Multi-variant master playlist, TS segments, muxed audio/video          | [Mux Big Buck Bunny](https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8)                                                       |                                                                                 |
| HLS VOD (TS)               | Advanced master with `EXT-X-MEDIA` renditions                          | [Apple TS example](https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8)        | Audio may be a separate rendition                                               |
| HLS VOD (fMP4)             | `EXT-X-MAP` initialization, fragmented MP4                             | [Apple fMP4 example](https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8)    | Audio may be a separate rendition                                               |
| HLS VOD (fMP4)             | Initialization and muxed audio/video                                   | [Unified Streaming HLS](https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8) |                                                                                 |
| HLS encrypted              | `EXT-X-KEY`, AES-128 key fetch and decryption                          | [JW Player oceans AES](https://playertest.longtailvideo.com/adaptive/oceans_aes/oceans_aes.m3u8)                              | AES-128 only; `SAMPLE-AES` is not supported                                     |
| DASH VOD                   | Duration-based `SegmentTemplate`, initialization segment               | [DASH-IF Big Buck Bunny](https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd)                                           |                                                                                 |
| DASH VOD                   | Multiple representations and adaptation sets                           | [Envivio](https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd)                                                       |                                                                                 |
| DASH VOD                   | Text-first and audio-first adaptation sets                             | [Shaka Angel One](https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd)                                        | Default selection skips text and prefers video; use `id` for a specific quality |
| DASH VOD (fMP4)            | Initialization and fragmented MP4 segments                             | [Unified Streaming DASH](https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.mpd) |                                                                                 |
| DASH on-demand single-file | BaseURL-only single-file representation                                | [Sony test vector](https://dash.akamaized.net/dash264/TestCases/1a/sony/SNE_DASH_SD_CASE1A_REVISED.mpd)                       | Valid MP4, but FFmpeg-based players may reject its `sidx` `reference_type 1`    |
| DASH live                  | Dynamic MPD, `minimumUpdatePeriod`, `timeShiftBufferDepth`, clock sync | [DASH-IF livesim](https://livesim.dashif.org/livesim/testpic_2s/Manifest.mpd)                                                 | Live content; availability varies                                               |
| DASH live                  | Newer livesim endpoint                                                 | [DASH-IF livesim2](https://livesim2.dashif.org/livesim2/testpic_2s/Manifest.mpd)                                              | Live content; availability varies                                               |
| DASH live (timeline)       | `SegmentTimeline`, `$Time$`, repeated entries                          | [DASH-IF SegmentTimeline](https://livesim.dashif.org/livesim/segtimeline_1/testpic_2s/Manifest.mpd)                           | Live content; availability varies                                               |
| DASH live (multi-period)   | Period transitions, live edge, segment deduplication                   | [DASH-IF multi-period](https://livesim.dashif.org/livesim/periods_60/testpic_2s/Manifest.mpd)                                 | Live content; availability varies                                               |

Some HLS masters expose separate audio and video renditions. The library selects one playlist or rendition and exposes alternate renditions through the `media` event; it does not mux multiple renditions.

# API

### m3u8stream(url, [options])

Creates a readable stream of binary media data. `options` can have the following

- `begin` - Where to begin playing the video. Accepts an absolute unix timestamp or date, a relative time in the formats `1:23:45.123` and `1m2s`, or `"live"` to begin at the live edge.
- `end` - Where to stop downloading the video. Accepts an absolute unix timestamp or date and a relative time in the formats `1:23:45.123` and `1m2s`. Cannot be used together with `duration`.
- `duration` - How much of the video to download from `begin`. Accepts a duration in milliseconds or human-readable format like `1m30s`. Cannot be used together with `end`.
- `liveBuffer` - How much buffer in milliseconds to have for live streams. Default is `20000`.
- `chunkReadahead` - How many chunks to preload ahead. Default is `3`.
- `highWaterMark` - How much of the download to buffer into the stream. See [node's docs](https://nodejs.org/api/stream.html#stream_constructor_new_stream_writable_options) for more. Note that the actual amount buffered can be higher since each chunk request maintains its own buffer.
- `requestOptions` - Any options you want to pass to [miniget](https://github.com/fent/node-miniget), such as `headers`.
- `parser` - Either "m3u8" or "dash-mpd". Defaults to guessing based on the playlist url ending in `.m3u8` or `.mpd`.
- `id` - For playlists containing multiple media options (HLS master playlists and DASH MPD manifests). If not given, the first video stream is picked when available, otherwise the first stream. Can be:
  - Quality keywords: `'highest'` / `'best'` or `'lowest'` / `'worst'` (bandwidth-based).
  - Resolution shorthand: e.g. `'1080p'`, `'720p'`, `'1920x1080'`.
  - Specific identifier: DASH representation `id`, playlist URL or filename, or 0-based index.
  - An HLS alternate rendition from `EXT-X-MEDIA`, by `NAME`, `GROUP-ID`, URI, or language.
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

#### Event: media

Emitted for each alternate rendition declared by an HLS master playlist.

- `Object` - Rendition details:
  - `string` - type
  - `string` - groupId
  - `string` - name
  - `string` - [uri]
  - `string` - [language]
  - `boolean` - [default]
  - `boolean` - [autoselect]
  - `boolean` - [forced]
  - `string` - [channels]
  - `string` - [characteristics]

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
