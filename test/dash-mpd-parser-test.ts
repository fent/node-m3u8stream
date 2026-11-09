import DashMPDParser from '../dist/dash-mpd-parser';
import { Item } from '../dist/parser';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import sinon from 'sinon';

describe('dash MPD parser', () => {
  describe('Playlist with one representation', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/simple.mpd');
      let items: Item[] = [];
      let endlist = false;
      const parser = new DashMPDParser();
      let starttime: number;
      parser.on('starttime', (a) => (starttime = a));
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.equal(
          new Date(starttime).toLocaleTimeString().split(' ')[0],
          '12:24:21',
        );
        assert.ok(!endlist);
        assert.deepEqual(items, [
          { url: 'https://videohost.com/139/0001.ts', duration: 2000, seq: 1 },
          { url: 'https://videohost.com/139/0002.ts', duration: 2000, seq: 2 },
          { url: 'https://videohost.com/139/0003.ts', duration: 2000, seq: 3 },
          { url: 'https://videohost.com/139/0004.ts', duration: 2000, seq: 4 },
          { url: 'https://videohost.com/139/0005.ts', duration: 2000, seq: 5 },
          { url: 'https://videohost.com/139/0006.ts', duration: 2000, seq: 6 },
          { url: 'https://videohost.com/139/0007.ts', duration: 2000, seq: 7 },
          { url: 'https://videohost.com/139/0008.ts', duration: 2000, seq: 8 },
          { url: 'https://videohost.com/139/0009.ts', duration: 2000, seq: 9 },
          { url: 'https://videohost.com/139/0010.ts', duration: 2000, seq: 10 },
        ]);
        done();
      });
    });
  });

  describe('Playlist with multiple representations', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(
        __dirname,
        'playlists/multi-representation.mpd',
      );
      let items: Item[] = [];
      let endlist = false;
      const parser = new DashMPDParser('140');
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/140/0000.ts',
            duration: 0,
            seq: 1,
            init: true,
          },
          { url: 'https://videohost.com/140/0001.ts', duration: 2000, seq: 1 },
          { url: 'https://videohost.com/140/0002.ts', duration: 2000, seq: 2 },
          { url: 'https://videohost.com/140/0003.ts', duration: 2000, seq: 3 },
          { url: 'https://videohost.com/140/0004.ts', duration: 2000, seq: 4 },
          { url: 'https://videohost.com/140/0005.ts', duration: 2000, seq: 5 },
          { url: 'https://videohost.com/140/0006.ts', duration: 2000, seq: 6 },
          { url: 'https://videohost.com/140/0007.ts', duration: 2000, seq: 7 },
          { url: 'https://videohost.com/140/0008.ts', duration: 2000, seq: 8 },
          { url: 'https://videohost.com/140/0009.ts', duration: 2000, seq: 9 },
          { url: 'https://videohost.com/140/0010.ts', duration: 2000, seq: 10 },
        ]);
        done();
      });
    });

    describe('With a representation with initialization segment', () => {
      it('Emits all segments', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items: Item[] = [];
        let endlist = false;
        const parser = new DashMPDParser('133');
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('endlist', () => {
          endlist = true;
        });
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.ok(endlist);
          assert.deepEqual(items, [
            {
              url: 'https://videohost.com/133/0001.ts',
              duration: 2000,
              seq: 1,
            },
            {
              url: 'https://videohost.com/133/0002.ts',
              duration: 2000,
              seq: 2,
            },
            {
              url: 'https://videohost.com/133/0003.ts',
              duration: 2000,
              seq: 3,
            },
            {
              url: 'https://videohost.com/133/0004.ts',
              duration: 2000,
              seq: 4,
            },
            {
              url: 'https://videohost.com/133/0005.ts',
              duration: 2000,
              seq: 5,
            },
            {
              url: 'https://videohost.com/133/0006.ts',
              duration: 2000,
              seq: 6,
            },
            {
              url: 'https://videohost.com/133/0007.ts',
              duration: 2000,
              seq: 7,
            },
            {
              url: 'https://videohost.com/133/0008.ts',
              duration: 2000,
              seq: 8,
            },
            {
              url: 'https://videohost.com/133/0009.ts',
              duration: 2000,
              seq: 9,
            },
            {
              url: 'https://videohost.com/133/0010.ts',
              duration: 2000,
              seq: 10,
            },
          ]);
          done();
        });
      });
    });

    describe("With a target representation that isn't found", () => {
      it('Emits error', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items = [];
        let endlist = false;
        let id = 'willnotfindthis';
        const parser = new DashMPDParser(id);
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('endlist', () => {
          endlist = true;
        });
        parser.on('error', (err) => {
          assert.ok(endlist);
          assert.equal(items.length, 0);
          assert.equal(err.message, `Representation '${id}' not found`);
          done();
        });
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
      });

      it('Emits error with predicate function representation not found', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let fn = (v: any) => v.height === 1080;
        const parser = new DashMPDParser(fn);
        parser.on('error', (err) => {
          assert.equal(err.message, `Representation '${fn}' not found`);
          done();
        });
        fs.createReadStream(filepath).pipe(parser);
      });

      it('Emits error on malformed XML', (done) => {
        const parser = new DashMPDParser();
        parser.on('error', (err) => {
          assert.ok(err);
          done();
        });
        parser.end('<mpd foo="bar');
      });
    });

    describe('With quality keywords', () => {
      it('Selects representation with highest bandwidth using "highest"', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items: Item[] = [];
        const parser = new DashMPDParser('highest');
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.equal(items.length, 10);
          assert.equal(items[0].url, 'https://videohost.com/134/0001.ts');
          done();
        });
      });

      it('Selects representation with lowest bandwidth using "lowest"', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items: Item[] = [];
        const parser = new DashMPDParser('lowest');
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          // Init + 10 segments
          assert.equal(items.length, 11);
          assert.equal(items[0].url, 'https://videohost.com/140/0000.ts');
          done();
        });
      });
    });

    describe('With resolution shorthand', () => {
      it('Selects representation matching "360p"', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items: Item[] = [];
        const parser = new DashMPDParser('360p');
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.equal(items.length, 10);
          assert.equal(items[0].url, 'https://videohost.com/134/0001.ts');
          done();
        });
      });

      it('Selects representation matching "240p"', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items: Item[] = [];
        const parser = new DashMPDParser('240p');
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.equal(items.length, 10);
          assert.equal(items[0].url, 'https://videohost.com/133/0001.ts');
          done();
        });
      });

      it('Selects representation matching "640x360"', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items: Item[] = [];
        const parser = new DashMPDParser('640x360');
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.equal(items.length, 10);
          assert.equal(items[0].url, 'https://videohost.com/134/0001.ts');
          done();
        });
      });
    });

    describe('With custom predicate function', () => {
      it('Selects matching representation', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/multi-representation.mpd',
        );
        let items: Item[] = [];
        const parser = new DashMPDParser((v) => v.height === 240);
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.equal(items.length, 10);
          assert.equal(items[0].url, 'https://videohost.com/133/0001.ts');
          done();
        });
      });

      it('Selects matching representation with fractional frameRate', (done) => {
        const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000" width="1920" height="1080" frameRate="30000/1001">
        <BaseURL>https://videohost.com/1/</BaseURL>
        <SegmentList>
          <SegmentURL media="0001.ts" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
        const parser = new DashMPDParser(
          (v) => typeof v.frameRate === 'number' && v.frameRate > 29.9,
        );
        const items: Item[] = [];
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        parser.on('end', () => {
          assert.equal(items.length, 1);
          assert.equal(items[0].url, 'https://videohost.com/1/0001.ts');
          done();
        });
        parser.end(Buffer.from(xml));
      });
    });
  });

  describe('Static playlist', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/example.mpd');
      let items: Item[] = [];
      let endlist = false;
      const parser = new DashMPDParser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          { url: 'main/video/720p/segment-1.ts', duration: 60000, seq: 1 },
          { url: 'main/video/720p/segment-2.ts', duration: 60000, seq: 2 },
          { url: 'main/video/720p/segment-3.ts', duration: 60000, seq: 3 },
          { url: 'main/video/720p/segment-4.ts', duration: 60000, seq: 4 },
          { url: 'main/video/720p/segment-5.ts', duration: 60000, seq: 5 },
          { url: 'main/video/720p/segment-6.ts', duration: 60000, seq: 6 },
          { url: 'main/video/720p/segment-7.ts', duration: 60000, seq: 7 },
          { url: 'main/video/720p/segment-8.ts', duration: 60000, seq: 8 },
          { url: 'main/video/720p/segment-9.ts', duration: 60000, seq: 9 },
          { url: 'main/video/720p/segment-10.ts', duration: 60000, seq: 10 },
        ]);
        done();
      });
    });
  });

  describe('Playlist with <segmentTemplate>', () => {
    it('Segments are generated and emitted', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/segment-template.mpd');
      let items: Item[] = [];
      let endlist = false;
      let timescale = 22050;
      const parser = new DashMPDParser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          { url: 'media/audio/und/init.mp4', duration: 0, seq: 1, init: true },
          {
            url: 'media/audio/und/seg-1.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 1,
          },
          {
            url: 'media/audio/und/seg-2.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 2,
          },
          {
            url: 'media/audio/und/seg-3.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 3,
          },
          {
            url: 'media/audio/und/seg-4.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 4,
          },
          {
            url: 'media/audio/und/seg-5.m4f',
            duration: (45056 / timescale) * 1000,
            seq: 5,
          },
          {
            url: 'media/audio/und/seg-6.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 6,
          },
          {
            url: 'media/audio/und/seg-7.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 7,
          },
          {
            url: 'media/audio/und/seg-8.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 8,
          },
          {
            url: 'media/audio/und/seg-9.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 9,
          },
          {
            url: 'media/audio/und/seg-10.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 10,
          },
          {
            url: 'media/audio/und/seg-11.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 11,
          },
          {
            url: 'media/audio/und/seg-12.m4f',
            duration: (45056 / timescale) * 1000,
            seq: 12,
          },
          {
            url: 'media/audio/und/seg-13.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 13,
          },
          {
            url: 'media/audio/und/seg-14.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 14,
          },
          {
            url: 'media/audio/und/seg-15.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 15,
          },
          {
            url: 'media/audio/und/seg-16.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 16,
          },
          {
            url: 'media/audio/und/seg-17.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 17,
          },
          {
            url: 'media/audio/und/seg-18.m4f',
            duration: (44032 / timescale) * 1000,
            seq: 18,
          },
          {
            url: 'media/audio/und/seg-19.m4f',
            duration: (3904 / timescale) * 1000,
            seq: 19,
          },
        ]);
        done();
      });
    });

    describe('Without initialization segment', () => {
      it('Segments are generated and emitted', (done) => {
        let filepath = path.resolve(
          __dirname,
          'playlists/segment-template-2.mpd',
        );
        let items: Item[] = [];
        let endlist = false;
        let timescale = 1000;
        const parser = new DashMPDParser();
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('endlist', () => {
          endlist = true;
        });
        parser.on('error', done);
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          assert.ok(endlist);
          assert.deepEqual(items, [
            {
              url: 'audio/und/seg-1.m4f',
              duration: (2000 / timescale) * 1000,
              seq: 1,
            },
            {
              url: 'audio/und/seg-2.m4f',
              duration: (2000 / timescale) * 1000,
              seq: 2,
            },
            {
              url: 'audio/und/seg-3.m4f',
              duration: (2000 / timescale) * 1000,
              seq: 3,
            },
            {
              url: 'audio/und/seg-4.m4f',
              duration: (2000 / timescale) * 1000,
              seq: 4,
            },
            {
              url: 'audio/und/seg-5.m4f',
              duration: (2000 / timescale) * 1000,
              seq: 5,
            },
          ]);
          done();
        });
      });
    });

    describe('Contains <SegmentTemplate> inside <Representation>', () => {
      it('Segments are emitted', (done) => {
        let filepath = path.resolve(__dirname, 'playlists/facebook.mpd');
        const parser = new DashMPDParser();
        let items: Item[] = [];
        let targetDuration = 0;
        parser.on('targetduration', (ms) => (targetDuration = ms));
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        fs.createReadStream(filepath)
          .pipe(parser)
          .on('end', () => {
            assert.equal(targetDuration, 1000);
            assert.deepEqual(items, [
              {
                url: '../live-md-v/122643152223588_0-init.m4v',
                duration: 0,
                seq: 1,
                init: true,
              },
              {
                url: '../live-md-v/122643152223588_0-36874.m4v',
                duration: 2000,
                seq: 36874,
              },
              {
                url: '../live-md-v/122643152223588_0-38874.m4v',
                duration: 2000,
                seq: 38874,
              },
              {
                url: '../live-md-v/122643152223588_0-40874.m4v',
                duration: 2000,
                seq: 40874,
              },
              {
                url: '../live-md-v/122643152223588_0-42874.m4v',
                duration: 2000,
                seq: 42874,
              },
              {
                url: '../live-md-v/122643152223588_0-44874.m4v',
                duration: 2000,
                seq: 44874,
              },
              {
                url: '../live-md-v/122643152223588_0-46874.m4v',
                duration: 2000,
                seq: 46874,
              },
              {
                url: '../live-md-v/122643152223588_0-48874.m4v',
                duration: 2000,
                seq: 48874,
              },
              {
                url: '../live-md-v/122643152223588_0-50874.m4v',
                duration: 2000,
                seq: 50874,
              },
              {
                url: '../live-md-v/122643152223588_0-52874.m4v',
                duration: 2000,
                seq: 52874,
              },
              {
                url: '../live-md-v/122643152223588_0-54874.m4v',
                duration: 2000,
                seq: 54874,
              },
            ]);
            done();
          });
      });

      it('Substitutes $Time$ in unscaled timescale units across repeats', (done) => {
        const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="audio/mp4">
      <Representation id="audio" bandwidth="128000">
        <SegmentTemplate timescale="48000" media="seg-$Time$.m4s">
          <SegmentTimeline>
            <S t="48000" d="96000" r="1" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
        const parser = new DashMPDParser();
        const items: Item[] = [];
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        parser.on('end', () => {
          assert.deepEqual(items, [
            { url: 'seg-48000.m4s', duration: 2000, seq: 1 },
            { url: 'seg-144000.m4s', duration: 2000, seq: 2 },
          ]);
          done();
        });
        parser.end(Buffer.from(xml));
      });

      it('Supports $Bandwidth$, $$, and %0[width]d format specifiers', (done) => {
        const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v1" bandwidth="500000">
        <SegmentTemplate
          timescale="1000"
          startNumber="7"
          initialization="$$init-$RepresentationID$-$Bandwidth$.mp4"
          media="seg-$Bandwidth$-$Number%05d$.m4s">
          <SegmentTimeline>
            <S d="2000" r="1" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
        const parser = new DashMPDParser();
        const items: Item[] = [];
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        parser.on('end', () => {
          assert.deepEqual(items, [
            {
              url: '$init-v1-500000.mp4',
              duration: 0,
              seq: 7,
              init: true,
            },
            { url: 'seg-500000-00007.m4s', duration: 2000, seq: 7 },
            { url: 'seg-500000-00008.m4s', duration: 2000, seq: 8 },
          ]);
          done();
        });
        parser.end(Buffer.from(xml));
      });

      it('Generates segments from <SegmentTemplate duration> without <SegmentTimeline>', (done) => {
        const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT5S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v1" bandwidth="500000">
        <SegmentTemplate
          timescale="1000"
          duration="2000"
          startNumber="1"
          media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
        const parser = new DashMPDParser();
        const items: Item[] = [];
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        parser.on('end', () => {
          assert.deepEqual(items, [
            { url: 'seg-1.m4s', duration: 2000, seq: 1 },
            { url: 'seg-2.m4s', duration: 2000, seq: 2 },
            { url: 'seg-3.m4s', duration: 2000, seq: 3 },
          ]);
          done();
        });
        parser.end(Buffer.from(xml));
      });
    });
  });

  describe('<BaseURL> scoping and hierarchy', () => {
    it('Preserves manifest-level <BaseURL> across <Period>', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <BaseURL>https://videohost.com/</BaseURL>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>video/</BaseURL>
        <SegmentList>
          <SegmentURL media="0001.ts" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items.length, 1);
        assert.equal(items[0].url, 'https://videohost.com/video/0001.ts');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Does not leak sibling <Representation> <BaseURL> into subsequent representations', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <BaseURL>https://videohost.com/</BaseURL>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="500000">
        <BaseURL>rep1/</BaseURL>
        <SegmentList>
          <SegmentURL media="rep1-0001.ts" />
        </SegmentList>
      </Representation>
      <Representation id="2" bandwidth="1000000">
        <SegmentList>
          <SegmentURL media="rep2-0001.ts" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser('2');
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items.length, 1);
        assert.equal(items[0].url, 'https://videohost.com/rep2-0001.ts');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Includes Representation-level <BaseURL> when generating segments from <SegmentTemplate>', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT4S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>https://videohost.com/video/</BaseURL>
        <SegmentTemplate
          timescale="1000"
          duration="2000"
          startNumber="1"
          media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items.length, 2);
        assert.equal(items[0].url, 'https://videohost.com/video/seg-1.m4s');
        assert.equal(items[1].url, 'https://videohost.com/video/seg-2.m4s');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Preserves AdaptationSet-level <BaseURL> for subsequent sibling representations', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <BaseURL>https://videohost.com/video/</BaseURL>
      <Representation id="1" bandwidth="500000">
        <SegmentList>
          <SegmentURL media="rep1-0001.ts" />
        </SegmentList>
      </Representation>
      <Representation id="2" bandwidth="1000000">
        <SegmentList>
          <SegmentURL media="rep2-0001.ts" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser('2');
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items.length, 1);
        assert.equal(items[0].url, 'https://videohost.com/video/rep2-0001.ts');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Resolves absolute child <BaseURL> overriding parent <BaseURL>', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <BaseURL>https://cdn1.com/dash/</BaseURL>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>https://cdn2.com/video/</BaseURL>
        <SegmentList>
          <SegmentURL media="0001.ts" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items.length, 1);
        assert.equal(items[0].url, 'https://cdn2.com/video/0001.ts');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Resolves root-relative child <BaseURL> against parent origin', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <BaseURL>https://cdn1.com/dash/</BaseURL>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>/video/</BaseURL>
        <SegmentList>
          <SegmentURL media="0001.ts" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items.length, 1);
        assert.equal(items[0].url, 'https://cdn1.com/video/0001.ts');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Resolves root-relative child <BaseURL> when bases are relative paths', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <BaseURL>main/</BaseURL>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>/video/</BaseURL>
        <SegmentList>
          <SegmentURL media="0001.ts" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items.length, 1);
        assert.equal(items[0].url, '/video/0001.ts');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Emits byte ranges for <Initialization range> and <SegmentURL mediaRange>', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>https://videohost.com/video.mp4</BaseURL>
        <SegmentList>
          <Initialization range="0-833" />
          <SegmentURL mediaRange="834-50000" />
          <SegmentURL mediaRange="50001-100000" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/video.mp4',
            seq: 1,
            init: true,
            duration: 0,
            range: { start: 0, end: 833 },
          },
          {
            url: 'https://videohost.com/video.mp4',
            seq: 1,
            duration: 0,
            range: { start: 834, end: 50000 },
          },
          {
            url: 'https://videohost.com/video.mp4',
            seq: 2,
            duration: 0,
            range: { start: 50001, end: 100000 },
          },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });
  });

  describe('<SegmentBase> single-file representations', () => {
    const filepath = path.resolve(__dirname, 'playlists/segment-base.mpd');

    it('Emits init segment with range and media segment starting after indexRange', (done) => {
      const parser = new DashMPDParser('1080p');
      const items: Item[] = [];
      let endlist = false;
      parser.on('item', (item) => items.push(item));
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      const rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/video-1080p.mp4',
            seq: 1,
            init: true,
            duration: 0,
            range: { start: 0, end: 834 },
          },
          {
            url: 'https://videohost.com/video-1080p.mp4',
            seq: 1,
            duration: 30000,
            range: { start: 1561 },
          },
        ]);
        done();
      });
    });

    it('Emits separate sourceURL init segment and full media segment', (done) => {
      const parser = new DashMPDParser('720p');
      const items: Item[] = [];
      let endlist = false;
      parser.on('item', (item) => items.push(item));
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      const rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/init-720p.mp4',
            seq: 1,
            init: true,
            duration: 0,
          },
          {
            url: 'https://videohost.com/video-720p.mp4',
            seq: 1,
            duration: 30000,
          },
        ]);
        done();
      });
    });

    it('Emits media segment without init segment when no Initialization tag exists', (done) => {
      const parser = new DashMPDParser('360p');
      const items: Item[] = [];
      let endlist = false;
      parser.on('item', (item) => items.push(item));
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      const rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/video-360p.mp4',
            seq: 1,
            duration: 30000,
          },
        ]);
        done();
      });
    });

    it('Emits media segment starting after indexRange when no Initialization tag exists', (done) => {
      const parser = new DashMPDParser('240p');
      const items: Item[] = [];
      let endlist = false;
      parser.on('item', (item) => items.push(item));
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      const rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/video-240p.mp4',
            seq: 1,
            duration: 30000,
            range: { start: 501 },
          },
        ]);
        done();
      });
    });

    it('Emits media segment starting after init range when indexRange is omitted', (done) => {
      const parser = new DashMPDParser('144p');
      const items: Item[] = [];
      let endlist = false;
      parser.on('item', (item) => items.push(item));
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      const rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/video-144p.mp4',
            seq: 1,
            init: true,
            duration: 0,
            range: { start: 0, end: 300 },
          },
          {
            url: 'https://videohost.com/video-144p.mp4',
            seq: 1,
            duration: 30000,
            range: { start: 301 },
          },
        ]);
        done();
      });
    });

    it('Emits media segment using RepresentationIndex range when indexRange is on RepresentationIndex', (done) => {
      const parser = new DashMPDParser('64p');
      const items: Item[] = [];
      let endlist = false;
      parser.on('item', (item) => items.push(item));
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      const rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'https://videohost.com/video-64p.mp4',
            seq: 1,
            duration: 30000,
            range: { start: 201 },
          },
        ]);
        done();
      });
    });

    it('Does not leak Representation-level <SegmentBase> to sibling representations', (done) => {
      const xml = `
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT30S">
  <Period duration="PT30S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="rep1" bandwidth="1000000">
        <BaseURL>rep1.mp4</BaseURL>
        <SegmentBase indexRange="0-100" />
      </Representation>
      <Representation id="rep2" bandwidth="2000000">
        <BaseURL>rep2/</BaseURL>
        <SegmentList duration="10000" timescale="1000">
          <SegmentURL media="rep2-seg1.mp4" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser('rep2');
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          {
            url: 'rep2/rep2-seg1.mp4',
            seq: 1,
            duration: 10000,
          },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });
  });

  describe('SegmentTimeline scoping and repeat semantics', () => {
    it('Does not leak a SegmentTimeline across sibling representations', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" media="r1-$Time$.m4s">
          <SegmentTimeline><S t="0" d="2000" /></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
      <Representation id="2">
        <SegmentTemplate timescale="1000" media="r2-$Time$.m4s">
          <SegmentTimeline>
            <S t="0" d="2000" />
            <S t="2000" d="2000" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser('2');
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          { url: 'r2-0.m4s', seq: 1, duration: 2000 },
          { url: 'r2-2000.m4s', seq: 2, duration: 2000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Expands S@r="-1" to the end of the Period', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT6S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" media="seg-$Time$.m4s">
          <SegmentTimeline><S t="0" d="2000" r="-1" /></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          { url: 'seg-0.m4s', seq: 1, duration: 2000 },
          { url: 'seg-2000.m4s', seq: 2, duration: 2000 },
          { url: 'seg-4000.m4s', seq: 3, duration: 2000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Honors an explicit S@t="0" after a non-zero time', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" media="seg-$Time$.m4s">
          <SegmentTimeline>
            <S t="1000" d="2000" />
            <S t="0" d="2000" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          { url: 'seg-1000.m4s', seq: 1, duration: 2000 },
          { url: 'seg-0.m4s', seq: 2, duration: 2000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Defaults @startNumber to 1 and @timescale to 1', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate media="seg-$Number$.m4s">
          <SegmentTimeline><S t="0" d="1000" /></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          { url: 'seg-1.m4s', seq: 1, duration: 1000000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });
  });

  describe('Relative <BaseURL> resolution', () => {
    it('Resolves relative BaseURL chains using URI semantics', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <BaseURL>dash/</BaseURL>
    <AdaptationSet mimeType="video/mp4">
      <BaseURL>video/</BaseURL>
      <Representation id="1">
        <BaseURL>720p/</BaseURL>
        <SegmentList>
          <SegmentURL media="seg.m4s" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items[0].url, 'dash/video/720p/seg.m4s');
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Treats a relative BaseURL without a trailing slash as a file', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <BaseURL>base</BaseURL>
        <SegmentList>
          <SegmentURL media="seg.m4s" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(items[0].url, 'seg.m4s');
        done();
      });
      parser.end(Buffer.from(xml));
    });
  });

  describe('Dynamic SegmentTemplate without Period duration', () => {
    it('Emits segments inside the time-shift buffer', (done) => {
      const clock = sinon.useFakeTimers({
        now: Date.parse('2020-01-01T00:00:10Z'),
      });
      const xml = `<?xml version="1.0"?>
<MPD type="dynamic" availabilityStartTime="2020-01-01T00:00:00Z"
     timeShiftBufferDepth="PT4S" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="2000"
          media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', (err) => {
        clock.restore();
        done(err);
      });
      parser.on('end', () => {
        clock.restore();
        assert.deepEqual(items, [
          { url: 'seg-4.m4s', seq: 4, duration: 2000 },
          { url: 'seg-5.m4s', seq: 5, duration: 2000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });
  });

  describe('External <RepresentationIndex>', () => {
    it('Does not skip media when the index is external and duration is known', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT30S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <BaseURL>video.mp4</BaseURL>
        <SegmentBase duration="30000" timescale="1000">
          <RepresentationIndex sourceURL="video.sidx" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          { url: 'video.mp4', seq: 1, duration: 30000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });
  });

  describe('DASH edge cases', () => {
    it('Ignores invalid byte ranges', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT10S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <BaseURL>video.mp4</BaseURL>
        <SegmentBase duration="10000" timescale="1000" indexRange="bad" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          { url: 'video.mp4', seq: 1, duration: 10000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Skips zero-duration timeline entries', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" media="seg-$Time$.m4s">
          <SegmentTimeline>
            <S t="0" d="0" />
            <S t="0" d="2000" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [{ url: 'seg-0.m4s', seq: 1, duration: 2000 }]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Expands r="-1" up to the next S@t', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" media="seg-$Time$.m4s">
          <SegmentTimeline>
            <S t="0" d="2000" r="-1" />
            <S t="6000" d="2000" />
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          { url: 'seg-0.m4s', seq: 1, duration: 2000 },
          { url: 'seg-2000.m4s', seq: 2, duration: 2000 },
          { url: 'seg-4000.m4s', seq: 3, duration: 2000 },
          { url: 'seg-6000.m4s', seq: 4, duration: 2000 },
        ]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Emits one segment when a dynamic MPD has no elapsed time', (done) => {
      const clock = sinon.useFakeTimers({
        now: Date.parse('2020-01-01T00:00:00Z'),
      });
      const xml = `<?xml version="1.0"?>
<MPD type="dynamic" availabilityStartTime="2020-01-01T00:00:00Z"
     xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="2000" media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', (err) => {
        clock.restore();
        done(err);
      });
      parser.on('end', () => {
        clock.restore();
        assert.deepEqual(items, [{ url: 'seg-1.m4s', seq: 1, duration: 2000 }]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Uses the whole elapsed window when timeShiftBufferDepth is absent', (done) => {
      const clock = sinon.useFakeTimers({
        now: Date.parse('2020-01-01T00:00:10Z'),
      });
      const xml = `<?xml version="1.0"?>
<MPD type="dynamic" availabilityStartTime="2020-01-01T00:00:00Z"
     xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="2000" media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', (err) => {
        clock.restore();
        done(err);
      });
      parser.on('end', () => {
        clock.restore();
        assert.deepEqual(
          items.map((item) => item.url),
          ['seg-1.m4s', 'seg-2.m4s', 'seg-3.m4s', 'seg-4.m4s', 'seg-5.m4s'],
        );
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Clamps a dynamic window to the Period duration', (done) => {
      const clock = sinon.useFakeTimers({
        now: Date.parse('2020-01-01T00:00:10Z'),
      });
      const xml = `<?xml version="1.0"?>
<MPD type="dynamic" availabilityStartTime="2020-01-01T00:00:00Z"
     timeShiftBufferDepth="PT4S" mediaPresentationDuration="PT8S"
     xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="2000" media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', (err) => {
        clock.restore();
        done(err);
      });
      parser.on('end', () => {
        clock.restore();
        assert.deepEqual(items, [{ url: 'seg-4.m4s', seq: 4, duration: 2000 }]);
        done();
      });
      parser.end(Buffer.from(xml));
    });

    it('Emits no media when a SegmentBase has no URL', (done) => {
      const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentBase />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const parser = new DashMPDParser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, []);
        done();
      });
      parser.end(Buffer.from(xml));
    });
  });

  it('Falls back when numeric attributes are invalid', (done) => {
    const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="abc" startNumber="nope" media="seg-$Number$.m4s">
          <SegmentTimeline><S t="0" d="1000" /></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', done);
    parser.on('end', () => {
      assert.deepEqual(items, [
        { url: 'seg-1.m4s', seq: 1, duration: 1000000 },
      ]);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Emits one segment for r="-1" without a known end', (done) => {
    const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" media="seg-$Time$.m4s">
          <SegmentTimeline><S t="0" d="2000" r="-1" /></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', done);
    parser.on('end', () => {
      assert.deepEqual(items, [{ url: 'seg-0.m4s', seq: 1, duration: 2000 }]);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Emits one segment for a dynamic MPD without availabilityStartTime', (done) => {
    const xml = `<?xml version="1.0"?>
<MPD type="dynamic" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="2000" media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', done);
    parser.on('end', () => {
      assert.deepEqual(items, [{ url: 'seg-1.m4s', seq: 1, duration: 2000 }]);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Uses the full Period when a dynamic MPD has not started yet', (done) => {
    const clock = sinon.useFakeTimers({
      now: Date.parse('2020-01-01T00:00:00Z'),
    });
    const xml = `<?xml version="1.0"?>
<MPD type="dynamic" availabilityStartTime="2020-01-01T00:00:00Z"
     mediaPresentationDuration="PT6S" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="2000" media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', (err) => {
      clock.restore();
      done(err);
    });
    parser.on('end', () => {
      clock.restore();
      assert.deepEqual(items, [
        { url: 'seg-1.m4s', seq: 1, duration: 2000 },
        { url: 'seg-2.m4s', seq: 2, duration: 2000 },
        { url: 'seg-3.m4s', seq: 3, duration: 2000 },
      ]);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Defaults SegmentBase @timescale to 1', (done) => {
    const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT30S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <BaseURL>video.mp4</BaseURL>
        <SegmentBase duration="30000" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', done);
    parser.on('end', () => {
      assert.deepEqual(items, [
        { url: 'video.mp4', seq: 1, duration: 30000000 },
      ]);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Ignores SegmentURL elements outside a SegmentList', (done) => {
    const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentURL media="orphan.ts" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', done);
    parser.on('end', () => {
      assert.deepEqual(items, []);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Emits a Representation with only a BaseURL as one segment', (done) => {
    const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT10S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <BaseURL>video.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', done);
    parser.on('end', () => {
      assert.deepEqual(items, [{ url: 'video.mp4', seq: 1, duration: 10000 }]);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Treats availabilityStartTime 0 as a real epoch time', (done) => {
    const clock = sinon.useFakeTimers({
      now: Date.parse('1970-01-01T00:00:10Z'),
    });
    const xml = `<?xml version="1.0"?>
<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z"
     timeShiftBufferDepth="PT4S" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="audio/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="2000" startNumber="0"
          media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', (err) => {
      clock.restore();
      done(err);
    });
    parser.on('end', () => {
      clock.restore();
      assert.deepEqual(items, [
        { url: 'seg-3.m4s', seq: 3, duration: 2000 },
        { url: 'seg-4.m4s', seq: 4, duration: 2000 },
      ]);
      done();
    });
    parser.end(Buffer.from(xml));
  });

  it('Handles Representations without mimeType or contentType', (done) => {
    const xml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT1S">
    <AdaptationSet>
      <Representation id="1">
        <BaseURL>media.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parser = new DashMPDParser();
    const items: Item[] = [];
    parser.on('item', (item) => items.push(item));
    parser.on('error', done);
    parser.on('end', () => {
      assert.deepEqual(items, [{ url: 'media.mp4', seq: 1, duration: 1000 }]);
      done();
    });
    parser.end(Buffer.from(xml));
  });
});
