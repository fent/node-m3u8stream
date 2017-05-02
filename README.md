# node-m3u8stream

Concatenates segments from a [m3u8 playlist](https://tools.ietf.org/html/draft-pantos-http-live-streaming-20) into a consumable stream.

[![Build Status](https://secure.travis-ci.org/fent/node-m3u8stream.svg)](http://travis-ci.org/fent/node-m3u8stream)
[![Dependency Status](https://david-dm.org/fent/node-m3u8stream.svg)](https://david-dm.org/fent/node-m3u8stream)
[![codecov](https://codecov.io/gh/fent/node-m3u8stream/branch/master/graph/badge.svg)](https://codecov.io/gh/fent/node-m3u8stream)


# Usage

```js
const fs = require('fs');
const m3u8stream = require('m3u8stream')

m3u8stream('http://somesite.com/link/to/the/playlist.m3u8')
    .pipe(fs.createWriteStream('videofile.mp4'));
```


# API

### m3u8stream(url, [options])

Creates a readable stream of binary media data. `options` can have the following

* `chunkReadahead` - How many chunks to preload ahead. Default is `3`.
* `highWaterMark` - How much of the download to buffer into the stream. See [node's docs](https://nodejs.org/api/stream.html#stream_constructor_new_stream_writable_options) for more. Note that the actual amount buffered can be higher since each chunk request maintains its own buffer.
* `requestOptions` - Any options you want to pass to [miniget](https://github.com/fent/node-miniget), such as `headers`.
* `refreshInterval` - How often to refresh the playlist. If end of segment list is approached before the next interval, then it will refresh sooner.

Stream has an `.end()` method, that if called, stops requesting segments, and refreshing the playlist.

### Limitations

Currently, it does not support [encrypted media segments](https://tools.ietf.org/html/draft-pantos-http-live-streaming-20#section-4.3.2.4). This is because the sites where this was tested on and intended for, YouTube and Twitch, don't use it.

This does not parse master playlists, only media playlists. If you want to parse a master playlist to get links to media playlists, you can try the [m3u8 module](https://github.com/tedconf/node-m3u8).


# Install

    npm install m3u8stream


# Tests
Tests are written with [mocha](https://mochajs.org)

```bash
npm test
```

# License
MIT
