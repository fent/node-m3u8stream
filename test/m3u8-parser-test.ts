import m3u8Parser from '../dist/m3u8-parser';
import { Item } from '../dist/parser';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

describe('m3u8 parser', () => {
  describe('Parse segments from a simple playlist', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/simple.m3u8');
      let items: Item[] = [];
      let endlist = false;
      const parser = new m3u8Parser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath, { highWaterMark: 16 });
      rs.pipe(parser);
      rs.on('end', () => {
        assert.ok(endlist);
        assert.deepEqual(items, [
          {
            url: 'http://media.example.com/first.ts',
            seq: 0,
            duration: 9009,
            range: undefined,
            key: undefined,
          },
          {
            url: 'http://media.example.com/second.ts',
            seq: 1,
            duration: 9009,
            range: undefined,
            key: undefined,
          },
          {
            url: 'http://media.example.com/third.ts',
            seq: 2,
            duration: 3003,
            range: undefined,
            key: undefined,
          },
        ]);
        done();
      });
    });
  });

  describe('Parse a master playlist', () => {
    it('Emits all variant streams and no segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/master-named.m3u8');
      let items: Item[] = [];
      let variants: any[] = [];
      let media: any[] = [];
      const parser = new m3u8Parser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('variant', (variant) => {
        variants.push(variant);
      });
      parser.on('media', (m) => {
        media.push(m);
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath, { highWaterMark: 16 });
      rs.pipe(parser);
      rs.on('end', () => {
        assert.equal(items.length, 0);
        assert.deepEqual(variants, [
          {
            url: 'low/low.m3u8',
            index: 0,
            bandwidth: 1280000,
            resolution: '1280x720',
            width: 1280,
            height: 720,
            codecs: undefined,
            frameRate: 30,
            audio: 'aac',
            video: undefined,
            subtitles: undefined,
            closedCaptions: undefined,
          },
          {
            url: 'hi/hi.m3u8',
            index: 1,
            bandwidth: 2560000,
            resolution: '1920x1080',
            width: 1920,
            height: 1080,
            codecs: undefined,
            frameRate: 60,
            audio: 'aac',
            video: undefined,
            subtitles: undefined,
            closedCaptions: undefined,
          },
          {
            url: 'audio/audio.m3u8',
            index: 2,
            bandwidth: 65000,
            resolution: undefined,
            width: undefined,
            height: undefined,
            codecs: 'mp4a.40.2',
            frameRate: undefined,
            audio: undefined,
            video: undefined,
            subtitles: undefined,
            closedCaptions: undefined,
          },
        ]);
        assert.deepEqual(media, [
          {
            type: 'AUDIO',
            groupId: 'aac',
            name: 'English',
            uri: 'audio/audio.m3u8',
            language: 'en',
            default: true,
            autoselect: true,
            channels: undefined,
            characteristics: undefined,
          },
        ]);
        done();
      });
    });

    it('Parses variant stream with missing bandwidth and attributes', (done) => {
      const playlist =
        '#EXTM3U\n#EXT-X-STREAM-INF:CODECS="mp4a.40.2"\naudio.m3u8\n';
      const parser = new m3u8Parser();
      const variants: any[] = [];
      parser.on('variant', (v) => variants.push(v));
      parser.on('error', done);
      parser.on('end', () => {
        assert.equal(variants.length, 1);
        assert.strictEqual(variants[0].bandwidth, undefined);
        assert.strictEqual(variants[0].resolution, undefined);
        assert.strictEqual(variants[0].frameRate, undefined);
        done();
      });
      parser.end(playlist);
    });
  });

  describe('Parse `EXT-X-MEDIA`', () => {
    const expectError = (tag: string, message: string, done: Mocha.Done) => {
      const parser = new m3u8Parser();
      parser.on('error', (err) => {
        assert.equal(err.message, message);
        done();
      });
      parser.end(`#EXTM3U\n${tag}\n#EXTINF:1,\nseg.ts\n`);
    };

    it('Emits an error when TYPE is missing or invalid', (done) => {
      expectError(
        '#EXT-X-MEDIA:GROUP-ID="a",NAME="n",URI="a.m3u8"',
        '`EXT-X-MEDIA` found without a valid required `TYPE` attribute',
        done,
      );
    });

    it('Emits an error when GROUP-ID or NAME is missing', (done) => {
      expectError(
        '#EXT-X-MEDIA:TYPE=AUDIO,NAME="n",URI="a.m3u8"',
        '`EXT-X-MEDIA` requires `GROUP-ID` and `NAME` attributes',
        done,
      );
    });

    it('Emits an error when GROUP-ID is not quoted', (done) => {
      expectError(
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=a,NAME="n",URI="a.m3u8"',
        '`EXT-X-MEDIA` attribute `GROUP-ID` must be quoted',
        done,
      );
    });

    it('Emits an error when NAME is not quoted', (done) => {
      expectError(
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME=n,URI="a.m3u8"',
        '`EXT-X-MEDIA` attribute `NAME` must be quoted',
        done,
      );
    });

    it('Emits an error when CLOSED-CAPTIONS has a URI', (done) => {
      expectError(
        '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="a",NAME="n",URI="a.m3u8"',
        '`EXT-X-MEDIA` with `TYPE=CLOSED-CAPTIONS` must not have a `URI` attribute',
        done,
      );
    });

    it('Emits an error when a rendition URI is missing', (done) => {
      expectError(
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="n"',
        '`EXT-X-MEDIA` found without required `URI` attribute',
        done,
      );
    });

    it('Emits an error when URI is not quoted', (done) => {
      expectError(
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="n",URI=a.m3u8',
        '`EXT-X-MEDIA` attribute `URI` must be quoted',
        done,
      );
    });

    it('Emits optional rendition attributes', (done) => {
      const parser = new m3u8Parser();
      const media: any[] = [];
      parser.on('media', (m) => media.push(m));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(media, [
          {
            type: 'SUBTITLES',
            groupId: 'subs',
            name: 'French',
            uri: 'fr.m3u8',
            language: 'fr',
            forced: true,
            channels: '2',
            characteristics: 'public.accessibility',
          },
        ]);
        done();
      });
      parser.end(
        [
          '#EXTM3U',
          '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="French",URI="fr.m3u8",' +
            'LANGUAGE="fr",FORCED=YES,CHANNELS="2",CHARACTERISTICS="public.accessibility"',
        ].join('\n'),
      );
    });
  });

  describe('Parse segments from a live playlist', () => {
    it('Emits all segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/live-1.1.m3u8');
      let items: Item[] = [];
      let endlist = false;
      const parser = new m3u8Parser();
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
        assert.ok(!endlist);
        assert.deepEqual(items, [
          {
            url: 'https://priv.example.com/fileSequence2681.ts',
            seq: 2681,
            duration: 7975,
            range: undefined,
            key: undefined,
          },
          {
            url: 'https://priv.example.com/fileSequence2682.ts',
            seq: 2682,
            duration: 7941,
            range: undefined,
            key: undefined,
          },
          {
            url: 'https://priv.example.com/fileSequence2683.ts',
            seq: 2683,
            duration: 7975,
            range: undefined,
            key: undefined,
          },
        ]);
        done();
      });
    });
  });

  describe('Plalist contains `EXT-X-MAP`', () => {
    it('Emits initialization segment', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/x-map-1.m3u8');
      let items: Item[] = [];
      let endlist = false;
      const parser = new m3u8Parser();
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
            url: 'init.mp4',
            init: true,
            seq: 1,
            duration: 0,
            range: undefined,
            key: undefined,
          },
          {
            url: 'main1.mp4',
            seq: 1,
            duration: 4969,
            range: undefined,
            key: undefined,
          },
          {
            url: 'main2.mp4',
            seq: 2,
            duration: 4969,
            range: undefined,
            key: undefined,
          },
          {
            url: 'main3.mp4',
            seq: 3,
            duration: 4969,
            range: undefined,
            key: undefined,
          },
          {
            url: 'main4.mp4',
            seq: 4,
            duration: 4969,
            range: undefined,
            key: undefined,
          },
        ]);
        done();
      });
    });

    describe('Without `URI`', () => {
      it('Emits error', (done) => {
        let filepath = path.resolve(__dirname, 'playlists/x-map-2.m3u8');
        let items: Item[] = [];
        let endlist = false;
        const parser = new m3u8Parser();
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('endlist', () => {
          endlist = true;
        });
        parser.on('error', (err) => {
          assert.ok(!endlist);
          assert.equal(items.length, 0);
          assert.ok(err);
          done();
        });
        let rs = fs.createReadStream(filepath);
        rs.pipe(parser);
        rs.on('end', () => {
          done(new Error('should not emit end'));
        });
      });
    });

    describe('Twice in one playlist', () => {
      it('Emits initialization segment', (done) => {
        let filepath = path.resolve(__dirname, 'playlists/x-map-3.m3u8');
        let items: Item[] = [];
        let endlist = false;
        const parser = new m3u8Parser();
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
              url: 'main.mp4',
              init: true,
              seq: 1,
              duration: 0,
              range: { start: 0, end: 49 },
              key: undefined,
            },
            {
              url: 'main.mp4',
              seq: 1,
              duration: 4969,
              range: { start: 50, end: 124 },
              key: undefined,
            },
            {
              url: 'main.mp4',
              seq: 2,
              duration: 4969,
              range: { start: 125, end: 194 },
              key: undefined,
            },
            {
              url: 'main.mp4',
              init: true,
              seq: 3,
              duration: 0,
              range: { start: 195, end: 244 },
              key: undefined,
            },
            {
              url: 'main.mp4',
              seq: 3,
              duration: 4969,
              range: { start: 245, end: 314 },
              key: undefined,
            },
            {
              url: 'main.mp4',
              seq: 4,
              duration: 4969,
              range: { start: 315, end: 394 },
              key: undefined,
            },
          ]);
          done();
        });
      });
    });
  });

  describe('Playlist contains `EXT-X-BYTERANGE`', () => {
    it('Emits items with range', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/x-byterange-1.m3u8');
      let items: Item[] = [];
      let endlist = false;
      const parser = new m3u8Parser();
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
            url: 'main.mp4',
            init: true,
            seq: 1,
            duration: 0,
            range: { start: 0, end: 49 },
            key: undefined,
          },
          {
            url: 'main.mp4',
            seq: 1,
            duration: 4969,
            range: { start: 50, end: 124 },
            key: undefined,
          },
          {
            url: 'main.mp4',
            seq: 2,
            duration: 4969,
            range: { start: 125, end: 194 },
            key: undefined,
          },
          {
            url: 'main.mp4',
            seq: 3,
            duration: 4969,
            range: { start: 195, end: 264 },
            key: undefined,
          },
          {
            url: 'main.mp4',
            seq: 4,
            duration: 4969,
            range: { start: 265, end: 344 },
            key: undefined,
          },
        ]);
        done();
      });
    });
  });

  describe('Playlist combines `EXT-X-BYTERANGE` with `EXT-X-MAP` byte ranges', () => {
    it('Keeps the implicit media offset relative to the previous media segment', (done) => {
      const parser = new m3u8Parser();
      const items: Item[] = [];
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          {
            url: 'seg.ts',
            seq: 0,
            duration: 2000,
            range: { start: 0, end: 99 },
            key: undefined,
          },
          {
            url: 'init.mp4',
            seq: 1,
            init: true,
            duration: 0,
            range: { start: 1000, end: 1099 },
            key: undefined,
          },
          {
            url: 'seg.ts',
            seq: 1,
            duration: 2000,
            range: { start: 100, end: 149 },
            key: undefined,
          },
        ]);
        done();
      });
      parser.end(
        [
          '#EXTM3U',
          '#EXTINF:2,',
          '#EXT-X-BYTERANGE:100@0',
          'seg.ts',
          '#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@1000"',
          '#EXTINF:2,',
          '#EXT-X-BYTERANGE:50',
          'seg.ts',
          '#EXT-X-ENDLIST',
        ].join('\n'),
      );
    });
  });

  describe('Playlist contains `EXT-X-KEY`', () => {
    it('Attaches key to media segments', (done) => {
      let filepath = path.resolve(__dirname, 'playlists/x-key.m3u8');
      let items: Item[] = [];
      let endlist = false;
      const parser = new m3u8Parser();
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
            url: 'main1.mp4',
            seq: 1,
            duration: 4969,
            range: undefined,
            key: {
              method: 'AES-128',
              uri: './sig.php',
              iv: '0xbf9840dc7d7fa163301a6c38844d6239',
              keyformat: 'identity',
            },
          },
          {
            url: 'main2.mp4',
            seq: 2,
            duration: 4969,
            range: undefined,
            key: {
              method: 'AES-128',
              uri: './sig.php',
              iv: '0xbf9840dc7d7fa163301a6c38844d6239',
              keyformat: 'identity',
            },
          },
          {
            url: 'main3.mp4',
            seq: 3,
            duration: 4969,
            range: undefined,
            key: {
              method: 'AES-128',
              uri: './sig.php',
              iv: '0xbf9840dc7d7fa163301a6c38844d6239',
              keyformat: 'identity',
            },
          },
          {
            url: 'main4.mp4',
            seq: 4,
            duration: 4969,
            range: undefined,
            key: {
              method: 'AES-128',
              uri: './sig.php',
              iv: '0xbf9840dc7d7fa163301a6c38844d6239',
              keyformat: 'identity',
            },
          },
        ]);
        done();
      });
    });

    const testPlaylistError = (
      file: string,
      expectedMessage: string,
      done: (err?: any) => void,
    ) => {
      let filepath = path.resolve(__dirname, file);
      let items: Item[] = [];
      let endlist = false;
      const parser = new m3u8Parser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('endlist', () => {
        endlist = true;
      });
      parser.on('error', (err) => {
        assert.ok(!endlist);
        assert.equal(items.length, 0);
        assert.equal(err.message, expectedMessage);
        done();
      });
      let rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        done(new Error('should not emit end'));
      });
    };

    describe('Without `METHOD` attribute', () => {
      it('Emits error', (done) => {
        testPlaylistError(
          'playlists/x-key-no-method.m3u8',
          '`EXT-X-KEY` found without required attribute `METHOD`',
          done,
        );
      });
    });

    describe('With invalid `METHOD`', () => {
      it('Emits error', (done) => {
        testPlaylistError(
          'playlists/x-key-bad-method.m3u8',
          '`EXT-X-KEY` found with invalid `METHOD` value',
          done,
        );
      });
    });

    describe('Without `URI` attribute', () => {
      it('Emits error', (done) => {
        testPlaylistError(
          'playlists/x-key-no-uri.m3u8',
          '`EXT-X-KEY` found without required attribute `URI`',
          done,
        );
      });

      it('Emits error when URI is not quoted', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` attribute `URI` must be quoted',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI=./sig.php',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });
    });

    describe('With invalid `IV` format', () => {
      it('Emits error when IV does not start with 0x or contains invalid hex', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` found with invalid `IV` attribute format',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",IV=12345',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });
    });

    describe('With a shortened `IV` value', () => {
      it('Accepts a shortened 128-bit IV value', (done) => {
        const parser = new m3u8Parser();
        const items: Item[] = [];
        parser.on('item', (item) => items.push(item));
        parser.on('error', done);
        parser.on('end', () => {
          assert.equal(items.length, 1);
          assert.equal(items[0].key?.iv, '0x1');
          done();
        });
        parser.end(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",IV=0x1',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
      });
    });

    describe('With unquoted attributes', () => {
      it('Emits error when KEYFORMAT is not quoted', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` attribute `KEYFORMAT` must be quoted',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",KEYFORMAT=identity',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });

      it('Emits error when KEYFORMATVERSIONS is not quoted', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` attribute `KEYFORMATVERSIONS` must be quoted',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",KEYFORMATVERSIONS=1',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });
    });

    describe('With invalid `KEYFORMATVERSIONS` format', () => {
      it('Emits error when KEYFORMATVERSIONS is not integers separated by /', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` found with invalid `KEYFORMATVERSIONS` attribute format',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",KEYFORMATVERSIONS="abc"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });

      it('Emits error when KEYFORMAT is identity and KEYFORMATVERSIONS is not 1', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` with `KEYFORMAT="identity"` requires `KEYFORMATVERSIONS="1"`',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",KEYFORMATVERSIONS="2"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });

      it('Parses KEYFORMATVERSIONS when explicitly provided', (done) => {
        let items: Item[] = [];
        const parser = new m3u8Parser();
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('error', done);
        parser.on('end', () => {
          assert.equal(items.length, 1);
          assert.deepEqual(items[0].key, {
            method: 'AES-128',
            uri: './sig.php',
            iv: undefined,
            keyformat: 'identity',
            keyformatversions: '1',
          });
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",KEYFORMATVERSIONS="1"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });
    });

    describe('With multiple KEYFORMAT tags', () => {
      it('Emits an error when no identity key is available', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.match(err.message, /unsupported `KEYFORMAT`/);
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm",' +
              'KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1/2"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });

      it('Prefers identity key when another KEYFORMAT precedes or succeeds it', (done) => {
        let items: Item[] = [];
        const parser = new m3u8Parser();
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('error', done);
        parser.on('end', () => {
          assert.equal(items.length, 2);
          assert.deepEqual(items[0].key, {
            method: 'AES-128',
            uri: './sig.php',
            iv: undefined,
            keyformat: 'identity',
          });
          assert.deepEqual(items[1].key, {
            method: 'AES-128',
            uri: './sig2.php',
            iv: undefined,
            keyformat: 'identity',
          });
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm",KEYFORMAT="com.apple.streamingkeydelivery"',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig2.php"',
            '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm2",KEYFORMAT="com.apple.streamingkeydelivery"',
            '#EXTINF:5,',
            'main2.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });

      it('Emits an error when an unsupported key applies to EXT-X-MAP', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.match(err.message, /unsupported `KEYFORMAT`/);
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="skd://drm",KEYFORMAT="com.apple.streamingkeydelivery"',
            '#EXT-X-MAP:URI="init.mp4"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });
    });

    describe('With METHOD=NONE', () => {
      it('Clears active key for following segments', (done) => {
        let items: Item[] = [];
        const parser = new m3u8Parser();
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('error', done);
        parser.on('end', () => {
          assert.equal(items.length, 2);
          assert.ok(items[0].key);
          assert.equal(items[0].key?.method, 'AES-128');
          assert.equal(items[1].key, undefined);
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-KEY:METHOD=NONE',
            '#EXTINF:5,',
            'main2.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });

      it('Emits error when METHOD=NONE contains extra attributes', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` with `METHOD=NONE` must not contain other attributes',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=NONE,URI="./sig.php"',
            '#EXTINF:5,',
            'main1.mp4',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });
    });

    describe('With EXT-X-MAP and active key', () => {
      it('Attaches key to initialization segment', (done) => {
        let items: Item[] = [];
        const parser = new m3u8Parser();
        parser.on('item', (item) => {
          items.push(item);
        });
        parser.on('error', done);
        parser.on('end', () => {
          assert.equal(items.length, 1);
          assert.ok(items[0].init);
          assert.ok(items[0].key);
          assert.equal(items[0].key?.method, 'AES-128');
          assert.equal(items[0].key?.iv, '0xbf9840dc7d7fa163301a6c38844d6239');
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
            '#EXT-X-MAP:URI="init.mp4"',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });

      it('Emits error when EXT-X-MAP active key lacks IV attribute', (done) => {
        const parser = new m3u8Parser();
        parser.on('error', (err) => {
          assert.equal(
            err.message,
            '`EXT-X-KEY` applying to `EXT-X-MAP` requires an explicit `IV` attribute',
          );
          done();
        });
        parser.write(
          [
            '#EXTM3U',
            '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
            '#EXT-X-MAP:URI="init.mp4"',
            '#EXT-X-ENDLIST',
          ].join('\n'),
        );
        parser.end();
      });
    });
  });

  describe('Malformed playlist missing EXTINF or with invalid duration', () => {
    it('Emits duration 0 when EXTINF is missing or invalid', (done) => {
      let items: Item[] = [];
      const parser = new m3u8Parser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          {
            url: 'first.ts',
            seq: 0,
            duration: 0,
            range: undefined,
            key: undefined,
          },
          {
            url: 'second.ts',
            seq: 1,
            duration: 5000,
            range: undefined,
            key: undefined,
          },
          {
            url: 'third.ts',
            seq: 2,
            duration: 0,
            range: undefined,
            key: undefined,
          },
        ]);
        done();
      });
      parser.write(
        [
          '#EXTM3U',
          'first.ts',
          '#EXTINF:5,',
          'second.ts',
          '#EXTINF:invalid,',
          'third.ts',
          '#EXT-X-ENDLIST',
        ].join('\n'),
      );
      parser.end();
    });
  });

  describe('Playlist contains `EXT-X-DISCONTINUITY` and `EXT-X-DISCONTINUITY-SEQUENCE`', () => {
    it('Parses discontinuity tags and sequence numbers', (done) => {
      const filepath = path.resolve(__dirname, 'playlists/discontinuity.m3u8');
      const items: Item[] = [];
      const discontinuities: number[] = [];
      const parser = new m3u8Parser();
      parser.on('item', (item) => items.push(item));
      parser.on('discontinuity', (seq) => discontinuities.push(seq));
      parser.on('error', done);
      const rs = fs.createReadStream(filepath);
      rs.pipe(parser);
      rs.on('end', () => {
        assert.deepEqual(discontinuities, [4, 5]);
        assert.deepEqual(items, [
          {
            url: 'seg-100.ts',
            seq: 100,
            duration: 10000,
            range: undefined,
            key: undefined,
            discontinuitySequence: 3,
          },
          {
            url: 'seg-101.ts',
            seq: 101,
            duration: 10000,
            range: undefined,
            key: undefined,
            discontinuitySequence: 3,
          },
          {
            url: 'ad-102.ts',
            seq: 102,
            duration: 5000,
            range: undefined,
            key: undefined,
            discontinuity: true,
            discontinuitySequence: 4,
          },
          {
            url: 'ad-103.ts',
            seq: 103,
            duration: 5000,
            range: undefined,
            key: undefined,
            discontinuitySequence: 4,
          },
          {
            url: 'seg-104.ts',
            seq: 104,
            duration: 10000,
            range: undefined,
            key: undefined,
            discontinuity: true,
            discontinuitySequence: 5,
          },
        ]);
        done();
      });
    });

    it('Defaults discontinuity sequence to 0 when EXT-X-DISCONTINUITY-SEQUENCE is omitted', (done) => {
      const items: Item[] = [];
      const parser = new m3u8Parser();
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(items, [
          {
            url: 'first.ts',
            seq: 0,
            duration: 4000,
            range: undefined,
            key: undefined,
          },
          {
            url: 'second.ts',
            seq: 1,
            duration: 4000,
            range: undefined,
            key: undefined,
            discontinuity: true,
            discontinuitySequence: 1,
          },
        ]);
        done();
      });
      parser.write(
        [
          '#EXTM3U',
          '#EXTINF:4,',
          'first.ts',
          '#EXT-X-DISCONTINUITY',
          '#EXTINF:4,',
          'second.ts',
          '#EXT-X-ENDLIST',
        ].join('\n'),
      );
      parser.end();
    });
  });

  describe('Malformed attribute lists', () => {
    it('Parses long malformed attribute lists in linear time', (done) => {
      const parser = new m3u8Parser();
      const start = Date.now();
      parser.on('error', (err) => {
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 500, `expected < 500ms, took ${elapsed}ms`);
        assert.match(
          err.message,
          /`EXT-X-MAP` found without required attribute `URI`/,
        );
        done();
      });
      parser.write(
        ['#EXTM3U', `#EXT-X-MAP:${'A'.repeat(64000)}`, '#EXT-X-ENDLIST'].join(
          '\n',
        ),
      );
      parser.end();
    });

    it('Skips invalid tokens and ignores unterminated quoted values', (done) => {
      const items: Item[] = [];
      const parser = new m3u8Parser();
      parser.on('item', (item) => items.push(item));
      parser.on('error', done);
      parser.on('end', () => {
        assert.deepEqual(
          items.map((item) => item.url),
          ['init.mp4', 'seg1.ts'],
        );
        done();
      });
      parser.write(
        [
          '#EXTM3U',
          '#EXT-X-MAP:INVALID, bad=1, URI="init.mp4", BYTERANGE="unterminated',
          '#EXTINF:4,',
          'seg1.ts',
          '#EXT-X-ENDLIST',
        ].join('\n'),
      );
      parser.end();
    });
  });
});
