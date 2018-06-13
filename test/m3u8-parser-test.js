const m3u8parser = require('../lib/m3u8-parser');
const fs         = require('fs');
const path       = require('path');
const assert     = require('assert');


describe('m3u8-parser', () => {
  describe('Parses tags from a simple playlist', () => {
    it('Emits all tags and segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/simple.m3u8');
      let tags = [];
      let items = [];
      let parser = new m3u8parser();
      parser.on('tag', (tag, value) => {
        tags.push({ tag, value });
      });
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath, { highWaterMark: 16 });
      rs.pipe(parser);
      rs.on('end', () => {
        assert.deepEqual(tags, [
          { tag: 'EXTM3U', value: null },
          { tag: 'EXT-X-TARGETDURATION', value: '10' },
          { tag: 'EXTINF', value: '9.009,' },
          { tag: 'EXTINF', value: '9.009,' },
          { tag: 'EXTINF', value: '3.003,' },
          { tag: 'EXT-X-ENDLIST', value: null },
        ]);
        assert.deepEqual(items, [
          'http://media.example.com/first.ts',
          'http://media.example.com/second.ts',
          'http://media.example.com/third.ts',
        ]);
        done();
      });
    });
  });

  describe('Parses tags from a live playlist', () => {
    it('Emits all tags and segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/live-1.1.m3u8');
      let tags = [];
      let items = [];
      let parser = new m3u8parser();
      parser.on('tag', (tag, value) => {
        tags.push({ tag, value });
      });
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.deepEqual(tags, [
          { tag: 'EXTM3U', value: null },
          { tag: 'EXT-X-VERSION', value: '3' },
          { tag: 'EXT-X-TARGETDURATION', value: '8' },
          { tag: 'EXT-X-MEDIA-SEQUENCE', value: '2681' },
          { tag: 'EXTINF', value: '7.975,' },
          { tag: 'EXTINF', value: '7.941,' },
          { tag: 'EXTINF', value: '7.975,' },
        ]);
        assert.deepEqual(items, [
          'https://priv.example.com/fileSequence2681.ts',
          'https://priv.example.com/fileSequence2682.ts',
          'https://priv.example.com/fileSequence2683.ts',
        ]);
        done();
      });
    });
  });
});
