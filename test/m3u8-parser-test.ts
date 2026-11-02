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
      const parser = new m3u8Parser();
      parser.on('item', (item) => {
        items.push(item);
      });
      parser.on('variant', (variant) => {
        variants.push(variant);
      });
      parser.on('error', done);
      let rs = fs.createReadStream(filepath, { highWaterMark: 16 });
      rs.pipe(parser);
      rs.on('end', () => {
        assert.equal(items.length, 0);
        assert.deepEqual(variants, [
          { url: 'low/low.m3u8', index: 0, name: 'low' },
          { url: 'hi/hi.m3u8', index: 1, name: 'hi' },
          { url: 'audio/audio.m3u8', index: 2, name: null },
        ]);
        done();
      });
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
      it('Emits error when IV does not start with 0x or is not 32 hex chars', (done) => {
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
});
