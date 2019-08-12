const m3u8Parser = require('../dist/m3u8-parser');
const fs         = require('fs');
const path       = require('path');
const assert     = require('assert');


describe('m3u8 parser', () => {
  describe('Parse segments from a simple playlist', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/simple.m3u8');
      let items = [];
      let endlist = false;
      const parser = new m3u8Parser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('endlist', () => { endlist = true; });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath, { highWaterMark: 16 });
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          { url: 'http://media.example.com/first.ts',
            seq: 0, duration: 9009 },
          { url: 'http://media.example.com/second.ts',
            seq: 1, duration: 9009 },
          { url: 'http://media.example.com/third.ts',
            seq: 2, duration: 3003 },
        ]);
        done();
      });
    });
  });

  describe('Parse segments from a live playlist', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/live-1.1.m3u8');
      let items = [];
      let endlist = false;
      const parser = new m3u8Parser();
      parser.on('item', (item) => { items.push(item); });
      parser.on('endlist', () => { endlist = true; });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(!endlist);
        assert.deepEqual(items, [
          { url: 'https://priv.example.com/fileSequence2681.ts',
            seq: 2681, duration: 7975 },
          { url: 'https://priv.example.com/fileSequence2682.ts',
            seq: 2682, duration: 7941 },
          { url: 'https://priv.example.com/fileSequence2683.ts',
            seq: 2683, duration: 7975 },
        ]);
        done();
      });
    });
  });
});
