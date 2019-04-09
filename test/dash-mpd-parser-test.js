const DashMPDParser = require('../dist/dash-mpd-parser').default;
const fs            = require('fs');
const path          = require('path');
const assert        = require('assert');


describe('dash MPD parser', () => {
  describe('Playlist with one representation', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/simple.mpd');
      let items = [];
      let endlist = false;
      const parser = new DashMPDParser();
      let starttime;
      parser.on('starttime', a => starttime = a);
      parser.on('item', (item) => { items.push(item); });
      parser.on('endlist', () => { endlist = true; });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.equal(new Date(starttime).toLocaleTimeString().split(' ')[0],
          '12:24:21');
        assert.ok(!endlist);
        assert.deepEqual(items, [
          { url: 'https://videohost.com/139/0001.ts',
            duration: 2000, seq: 1 },
          { url: 'https://videohost.com/139/0002.ts',
            duration: 2000, seq: 2 },
          { url: 'https://videohost.com/139/0003.ts',
            duration: 2000, seq: 3 },
          { url: 'https://videohost.com/139/0004.ts',
            duration: 2000, seq: 4 },
          { url: 'https://videohost.com/139/0005.ts',
            duration: 2000, seq: 5 },
          { url: 'https://videohost.com/139/0006.ts',
            duration: 2000, seq: 6 },
          { url: 'https://videohost.com/139/0007.ts',
            duration: 2000, seq: 7 },
          { url: 'https://videohost.com/139/0008.ts',
            duration: 2000, seq: 8 },
          { url: 'https://videohost.com/139/0009.ts',
            duration: 2000, seq: 9 },
          { url: 'https://videohost.com/139/0010.ts',
            duration: 2000, seq: 10 },
        ]);
        done();
      });
    });
  });

  describe('Playlist with multiple representations', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname,
        'playlists/multi-representation.mpd');
      let items = [];
      let endlist = false;
      const parser = new DashMPDParser('140');
      parser.on('item', (item) => { items.push(item); });
      parser.on('endlist', () => { endlist = true; });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          { url: 'https://videohost.com/140/0000.ts',
            duration: 0, seq: 1 },
          { url: 'https://videohost.com/140/0001.ts',
            duration: 2000, seq: 2 },
          { url: 'https://videohost.com/140/0002.ts',
            duration: 2000, seq: 3 },
          { url: 'https://videohost.com/140/0003.ts',
            duration: 2000, seq: 4 },
          { url: 'https://videohost.com/140/0004.ts',
            duration: 2000, seq: 5 },
          { url: 'https://videohost.com/140/0005.ts',
            duration: 2000, seq: 6 },
          { url: 'https://videohost.com/140/0006.ts',
            duration: 2000, seq: 7 },
          { url: 'https://videohost.com/140/0007.ts',
            duration: 2000, seq: 8 },
          { url: 'https://videohost.com/140/0008.ts',
            duration: 2000, seq: 9 },
          { url: 'https://videohost.com/140/0009.ts',
            duration: 2000, seq: 10 },
          { url: 'https://videohost.com/140/0010.ts',
            duration: 2000, seq: 11 },
        ]);
        done();
      });
    });

    describe('With a representation with initialization segment', () => {
      it('Emits all segments', (done) => {
        let filepath = path.resolve(__dirname,
          'playlists/multi-representation.mpd');
        let items = [];
        let endlist = false;
        const parser = new DashMPDParser('133');
        parser.on('item', (item) => { items.push(item); });
        parser.on('endlist', () => { endlist = true; });
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.ok(endlist);
          assert.deepEqual(items, [
            { url: 'https://videohost.com/133/0001.ts',
              duration: 2000, seq: 1 },
            { url: 'https://videohost.com/133/0002.ts',
              duration: 2000, seq: 2 },
            { url: 'https://videohost.com/133/0003.ts',
              duration: 2000, seq: 3 },
            { url: 'https://videohost.com/133/0004.ts',
              duration: 2000, seq: 4 },
            { url: 'https://videohost.com/133/0005.ts',
              duration: 2000, seq: 5 },
            { url: 'https://videohost.com/133/0006.ts',
              duration: 2000, seq: 6 },
            { url: 'https://videohost.com/133/0007.ts',
              duration: 2000, seq: 7 },
            { url: 'https://videohost.com/133/0008.ts',
              duration: 2000, seq: 8 },
            { url: 'https://videohost.com/133/0009.ts',
              duration: 2000, seq: 9 },
            { url: 'https://videohost.com/133/0010.ts',
              duration: 2000, seq: 10 },
          ]);
          done();
        })
      })
    });

    describe('With a target representation that isn\'t found', () => {
      it('Emits error', (done) => {
        let filepath = path.resolve(__dirname,
          'playlists/multi-representation.mpd');
        let items = [];
        let endlist = false;
        let id = 'willnotfindthis';
        const parser = new DashMPDParser(id);
        parser.on('item', (item) => { items.push(item); });
        parser.on('endlist', () => { endlist = true; });
        parser.on('error', (err) => {
          assert.ok(endlist);
          assert.equal(items.length, 0);
          assert.equal(err.message, `Representation '${id}' not found`);
          done();
        });
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
      });
    });
  });

  describe('Static playlist', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/example.mpd');
      let items = [];
      let endlist = false;
      const parser = new DashMPDParser();
      parser.on('item', (item) => { items.push(item); });
      parser.on('endlist', () => { endlist = true; });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          { url: 'main/video/720p/segment-1.ts',
            duration: 60000, seq: 0 },
          { url: 'main/video/720p/segment-2.ts',
            duration: 60000, seq: 1 },
          { url: 'main/video/720p/segment-3.ts',
            duration: 60000, seq: 2 },
          { url: 'main/video/720p/segment-4.ts',
            duration: 60000, seq: 3 },
          { url: 'main/video/720p/segment-5.ts',
            duration: 60000, seq: 4 },
          { url: 'main/video/720p/segment-6.ts',
            duration: 60000, seq: 5 },
          { url: 'main/video/720p/segment-7.ts',
            duration: 60000, seq: 6 },
          { url: 'main/video/720p/segment-8.ts',
            duration: 60000, seq: 7 },
          { url: 'main/video/720p/segment-9.ts',
            duration: 60000, seq: 8 },
          { url: 'main/video/720p/segment-10.ts',
            duration: 60000, seq: 9 },
        ]);
        done();
      });
    });
  });

  describe('Playlist with segmentTemplate', () => {
    it('Segments are generated and emitted', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/segment-template.mpd');
      let items = [];
      let endlist = false;
      let timescale = 22050;
      const parser = new DashMPDParser();
      parser.on('item', (item) => { items.push(item); });
      parser.on('endlist', () => { endlist = true; });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          { url: 'media/audio/und/init.mp4',
            duration: 0, seq: 0 },
          { url: 'media/audio/und/seg-1.m4f',
            duration: 44032 / timescale * 1000, seq: 1 },
          { url: 'media/audio/und/seg-2.m4f',
            duration: 44032 / timescale * 1000, seq: 2 },
          { url: 'media/audio/und/seg-3.m4f',
            duration: 44032 / timescale * 1000, seq: 3 },
          { url: 'media/audio/und/seg-4.m4f',
            duration: 45056 / timescale * 1000, seq: 4 },
          { url: 'media/audio/und/seg-5.m4f',
            duration: 44032 / timescale * 1000, seq: 5 },
          { url: 'media/audio/und/seg-6.m4f',
            duration: 44032 / timescale * 1000, seq: 6 },
          { url: 'media/audio/und/seg-7.m4f',
            duration: 44032 / timescale * 1000, seq: 7 },
          { url: 'media/audio/und/seg-8.m4f',
            duration: 44032 / timescale * 1000, seq: 8 },
          { url: 'media/audio/und/seg-9.m4f',
            duration: 44032 / timescale * 1000, seq: 9 },
          { url: 'media/audio/und/seg-10.m4f',
            duration: 45056 / timescale * 1000, seq: 10 },
          { url: 'media/audio/und/seg-11.m4f',
            duration: 44032 / timescale * 1000, seq: 11 },
          { url: 'media/audio/und/seg-12.m4f',
            duration: 44032 / timescale * 1000, seq: 12 },
          { url: 'media/audio/und/seg-13.m4f',
            duration: 44032 / timescale * 1000, seq: 13 },
          { url: 'media/audio/und/seg-14.m4f',
            duration: 44032 / timescale * 1000, seq: 14 },
          { url: 'media/audio/und/seg-15.m4f',
            duration: 44032 / timescale * 1000, seq: 15 },
          { url: 'media/audio/und/seg-16.m4f',
            duration: 3904 / timescale * 1000, seq: 16 },
        ]);
        done();
      });
    });

    describe('Without initialization segment', () => {
      it('Segments are generated and emitted', (done) => {
        let filepath = path.resolve(__dirname, 'playlists/segment-template-2.mpd');
        let items = [];
        let endlist = false;
        let timescale = 1000;
        const parser = new DashMPDParser();
        parser.on('item', (item) => { items.push(item); });
        parser.on('endlist', () => { endlist = true; });
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.ok(endlist);
          assert.deepEqual(items, [
            { url: 'audio/und/seg-0.m4f',
              duration: 2000 / timescale * 1000, seq: 0 },
            { url: 'audio/und/seg-1.m4f',
              duration: 2000 / timescale * 1000, seq: 1 },
            { url: 'audio/und/seg-2.m4f',
              duration: 2000 / timescale * 1000, seq: 2 },
            { url: 'audio/und/seg-3.m4f',
              duration: 2000 / timescale * 1000, seq: 3 },
          ]);
          done();
        });
      });
    });
  });
});
