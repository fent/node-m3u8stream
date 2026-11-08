import DashMPDParser from '../dist/dash-mpd-parser';
import { Item } from '../dist/parser';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

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
          { url: 'main/video/720p/segment-1.ts', duration: 60000, seq: 0 },
          { url: 'main/video/720p/segment-2.ts', duration: 60000, seq: 1 },
          { url: 'main/video/720p/segment-3.ts', duration: 60000, seq: 2 },
          { url: 'main/video/720p/segment-4.ts', duration: 60000, seq: 3 },
          { url: 'main/video/720p/segment-5.ts', duration: 60000, seq: 4 },
          { url: 'main/video/720p/segment-6.ts', duration: 60000, seq: 5 },
          { url: 'main/video/720p/segment-7.ts', duration: 60000, seq: 6 },
          { url: 'main/video/720p/segment-8.ts', duration: 60000, seq: 7 },
          { url: 'main/video/720p/segment-9.ts', duration: 60000, seq: 8 },
          { url: 'main/video/720p/segment-10.ts', duration: 60000, seq: 9 },
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
              url: 'audio/und/seg-0.m4f',
              duration: (2000 / timescale) * 1000,
              seq: 0,
            },
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
                seq: 0,
                init: true,
              },
              {
                url: '../live-md-v/122643152223588_0-36874.m4v',
                duration: 2000,
                seq: 0,
              },
              {
                url: '../live-md-v/122643152223588_0-38874.m4v',
                duration: 2000,
                seq: 1,
              },
              {
                url: '../live-md-v/122643152223588_0-40874.m4v',
                duration: 2000,
                seq: 2,
              },
              {
                url: '../live-md-v/122643152223588_0-42874.m4v',
                duration: 2000,
                seq: 3,
              },
              {
                url: '../live-md-v/122643152223588_0-44874.m4v',
                duration: 2000,
                seq: 4,
              },
              {
                url: '../live-md-v/122643152223588_0-46874.m4v',
                duration: 2000,
                seq: 5,
              },
              {
                url: '../live-md-v/122643152223588_0-48874.m4v',
                duration: 2000,
                seq: 6,
              },
              {
                url: '../live-md-v/122643152223588_0-50874.m4v',
                duration: 2000,
                seq: 7,
              },
              {
                url: '../live-md-v/122643152223588_0-52874.m4v',
                duration: 2000,
                seq: 8,
              },
              {
                url: '../live-md-v/122643152223588_0-54874.m4v',
                duration: 2000,
                seq: 9,
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
            { url: 'seg-48000.m4s', duration: 2000, seq: 0 },
            { url: 'seg-144000.m4s', duration: 2000, seq: 1 },
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
  });
});
