import m3u8stream from '../dist/index';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { PassThrough } from 'stream';
import nock from 'nock';
import { spy } from 'sinon';
import { humanStr } from '../dist/parse-time';


nock.disableNetConnect();
const concat = (stream: PassThrough, callback: (err: Error, body: string) => void) => {
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => { body += chunk; });
  stream.on('error', callback);
  stream.on('end', () => { callback(null, body); });
};

describe('m3u8stream', () => {
  let setTimeout = global.setTimeout;
  before(() => { global.setTimeout = (fn, ms, ...args) => setTimeout(fn, 0, ...args); });
  after(() => { global.setTimeout = setTimeout; });

  describe('Simple media playlist', () => {
    it('Concatenates segments into stream', (done) => {
      let scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/simple.m3u8'))
        .get('/first.ts').reply(200, 'one')
        .get('/second.ts').reply(200, 'two')
        .get('/third.ts').reply(200, 'three');
      let stream = m3u8stream('http://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });

    it('Concatenates relative segments into stream', (done) => {
      let scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200,
          path.resolve(__dirname, 'playlists/simple_relative.m3u8'))
        .get('/first.ts').reply(200, 'one')
        .get('/second.ts').reply(200, 'two')
        .get('/third.ts').reply(200, 'three');
      let stream = m3u8stream('http://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });

    it('Tracks segment download progress', (done) => {
      let scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/simple.m3u8'))
        .get('/first.ts').reply(200, 'one')
        .get('/second.ts').reply(200, 'two')
        .get('/third.ts').reply(200, 'three');
      let stream = m3u8stream('http://media.example.com/playlist.m3u8');
      let progress: [m3u8stream.Progress, number, number][] = [];
      stream.on('progress', (segment, total, downloaded) => {
        progress.push([segment, total, downloaded]);
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothree');
        assert.deepEqual(progress, [
          [{
            duration: 9009,
            num: 1,
            size: 3,
            url: 'http://media.example.com/first.ts',
          }, 3, 3],
          [{
            duration: 9009,
            num: 2,
            size: 3,
            url: 'http://media.example.com/second.ts',
          }, 3, 6],
          [{
            duration: 3003,
            num: 3,
            size: 5,
            url: 'http://media.example.com/third.ts',
          }, 3, 11],
        ]);
        done();
      });

    });

    it('Forwards events from miniget', (done) => {
      let scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/simple.m3u8'))
        .get('/first.ts').reply(200, '1')
        .get('/second.ts').reply(200, '2')
        .get('/third.ts').reply(200, '3');
      let stream = m3u8stream('http://media.example.com/playlist.m3u8');
      let reqSpy = spy();
      let resSpy = spy();
      stream.on('request', reqSpy);
      stream.on('response', resSpy);
      concat(stream, (err) => {
        assert.ifError(err);
        scope.done();
        assert.equal(reqSpy.callCount, 4);
        assert.equal(resSpy.callCount, 4);
        done();
      });
    });

    describe('With `begin` set using relative format', () => {
      it('Starts stream on segment that matches `begin`', (done) => {
        let scope = nock('https://twitch.tv')
          .get('/videos/sc.m3u8')
          .replyWithFile(200, path.resolve(__dirname,
            'playlists/twitch-1.1.m3u8'))
          .get('/videos/3.ts').reply(200, 'the')
          .get('/videos/4.ts').reply(200, 'big')
          .get('/videos/5.ts').reply(200, 'brown')
          .get('/videos/6.ts').reply(200, 'fox')
          .get('/videos/7.ts').reply(200, 'jumped')
          .get('/videos/8.ts').reply(200, 'over')
          .get('/videos/9.ts').reply(200, 'the')
          .get('/videos/10.ts').reply(200, 'lazy')
          .get('/videos/11.ts').reply(200, 'dog')
          .get('/videos/12.ts').reply(200, 'and')
          .get('/videos/13.ts').reply(200, 'then')
          .get('/videos/14.ts').reply(200, 'went')
          .get('/videos/15.ts').reply(200, 'home');

        let stream = m3u8stream('https://twitch.tv/videos/sc.m3u8', { begin: '30s' });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, [
            'the',
            'big',
            'brown',
            'fox',
            'jumped',
            'over',
            'the',
            'lazy',
            'dog',
            'and',
            'then',
            'went',
            'home'
          ].join(''));
          done();
        });
      });
    });
  });

  describe('Live media playlist', () => {
    it('Refresh after nearing end of segment list', (done) => {
      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-2.1.m3u8'))
        .get('/fileSequence2681.ts').reply(200, 'apple')
        .get('/fileSequence2682.ts').reply(200, 'banana')
        .get('/fileSequence2683.ts').reply(200, 'cherry')
        .get('/fileSequence2684.ts').reply(200, 'durango')
        .get('/fileSequence2685.ts').reply(200, 'eggfruit')
        .get('/fileSequence2686.ts').reply(200, 'fig')
        .get('/fileSequence2687.ts').reply(200, 'grape')
        .get('/fileSequence2688.ts').reply(200, 'hackberry')
        .get('/fileSequence2689.ts').reply(200, 'imbe')
        .get('/fileSequence2690.ts').reply(200, 'java')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-2.2.m3u8'))
        .get('/fileSequence2691.ts').reply(200, 'kiwi')
        .get('/fileSequence2692.ts').reply(200, 'lime')
        .get('/fileSequence2693.ts').reply(200, 'melon')
        .get('/fileSequence2694.ts').reply(200, 'nut')
        .get('/fileSequence2695.ts').reply(200, 'orange')
        .get('/fileSequence2696.ts').reply(200, 'pear')
        .get('/fileSequence2697.ts').reply(200, 'melon')
        .get('/fileSequence2698.ts').reply(200, 'quince')
        .get('/fileSequence2699.ts').reply(200, 'raspberry')
        .get('/fileSequence2700.ts').reply(200, 'strawberry');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, [
          'apple',
          'banana',
          'cherry',
          'durango',
          'eggfruit',
          'fig',
          'grape',
          'hackberry',
          'imbe',
          'java',
          'kiwi',
          'lime',
          'melon',
          'nut',
          'orange',
          'pear',
          'melon',
          'quince',
          'raspberry',
          'strawberry'
        ].join(''));
        done();
      });
    });

    it('Stops on error getting playlist', (done) => {
      let scope = nock('http://mysite.com')
        .get('/pl.m3u8')
        .replyWithError('Nooo');
      let stream = m3u8stream('http://mysite.com/pl.m3u8', {
        requestOptions: { maxRetries: 0 } });
      stream.on('error', (err) => {
        scope.done();
        assert.equal(err.message, 'Nooo');
        done();
      });
      stream.on('end', () => {
        throw Error('Should not emit end');
      });
    });

    it('Stops on error refreshing playlist', (done) => {
      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts').reply(200, 'one')
        .get('/fileSequence2682.ts').reply(200, 'two')
        .get('/fileSequence2683.ts').reply(200, 'three')
        .get('/playlist.m3u8')
        .replyWithError('uh oh');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
        requestOptions: { maxRetries: 0 } });
      stream.on('error', (err) => {
        scope.done();
        assert.equal(err.message, 'uh oh');
        done();
      });
      stream.on('end', () => {
        throw Error('Should not emit end');
      });
    });

    it('Stops on error getting a segment', (done) => {
      let scope = nock('https://priv.example.com')
        .get('/playme.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts').reply(200, 'hello')
        .get('/fileSequence2682.ts').replyWithError('bad segment');
      let stream = m3u8stream('https://priv.example.com/playme.m3u8', {
        chunkReadahead: 1,
        requestOptions: { maxRetries: 0 },
      });
      stream.on('error', (err) => {
        assert.equal(err.message, 'bad segment');
        scope.done();
        done();
      });
      stream.on('end', () => {
        throw Error('Should not emit end');
      });
    });

    it('Handles retrieving same live playlist twice', (done) => {
      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts').reply(200, 'apple')
        .get('/fileSequence2682.ts').reply(200, 'banana')
        .get('/fileSequence2683.ts').reply(200, 'cherry')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-1.1.m3u8'))
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-1.2.m3u8'))
        .get('/fileSequence2684.ts').reply(200, 'fig')
        .get('/fileSequence2685.ts').reply(200, 'grape');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, [
          'apple',
          'banana',
          'cherry',
          'fig',
          'grape'
        ].join(''));
        done();
      });

    });

    describe('With dated segments', () => {
      describe('With `begin` set to now', () => {
        it('Starts stream on segment that matches `begin`', (done) => {
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(200, path.resolve(__dirname,
              'playlists/youtube-live-1.1.m3u8'))
            .get('/fileSequence0005.ts').reply(200, '05')
            .get('/fileSequence0006.ts').reply(200, '06')
            .get('/fileSequence0007.ts').reply(200, '07')
            .get('/fileSequence0008.ts').reply(200, '08')
            .get('/playlist.m3u8')
            .replyWithFile(200, path.resolve(__dirname,
              'playlists/youtube-live-1.2.m3u8'))
            .get('/fileSequence0009.ts').reply(200, '09')
            .get('/fileSequence0010.ts').reply(200, '10')
            .get('/fileSequence0011.ts').reply(200, '11')
            .get('/fileSequence0012.ts').reply(200, '12');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: Date.now()
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, [
              '05',
              '06',
              '07',
              '08',
              '09',
              '10',
              '11',
              '12'
            ].join(''));
            done();
          });
        });
      });

      describe('With `begin` set using relative format', () => {
        it('Starts stream on segment that matches `begin`', (done) => {
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(200, path.resolve(__dirname,
              'playlists/youtube-live-1.1.m3u8'))
            .get('/fileSequence0003.ts').reply(200, '03')
            .get('/fileSequence0004.ts').reply(200, '04')
            .get('/fileSequence0005.ts').reply(200, '05')
            .get('/fileSequence0006.ts').reply(200, '06')
            .get('/fileSequence0007.ts').reply(200, '07')
            .get('/fileSequence0008.ts').reply(200, '08')
            .get('/playlist.m3u8')
            .replyWithFile(200, path.resolve(__dirname,
              'playlists/youtube-live-1.2.m3u8'))
            .get('/fileSequence0009.ts').reply(200, '09')
            .get('/fileSequence0010.ts').reply(200, '10')
            .get('/fileSequence0011.ts').reply(200, '11')
            .get('/fileSequence0012.ts').reply(200, '12');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', { begin: '10s' });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, [
              '03',
              '04',
              '05',
              '06',
              '07',
              '08',
              '09',
              '10',
              '11',
              '12'
            ].join(''));
            done();
          });
        });
      });
    });

    describe('Destroy stream', () => {
      describe('Right away', () => {
        it('Ends stream right away with no data', (done) => {
          let stream = m3u8stream('https://whatever.com/playlist.m3u8');
          concat(stream, (err, body) => {
            assert.ifError(err);
            assert.equal(body, '');
            done();
          });
          stream.end();
        });
      });

      describe('In the middle of the segments list', () => {
        it('Stops stream from emitting more data and ends it', (done) => {
          let scope = nock('https://priv.example.com')
            .get('/playlist.m3u8')
            .replyWithFile(200, path.resolve(__dirname,
              'playlists/live-2.1.m3u8'))
            .get('/fileSequence2681.ts').reply(200, 'apple')
            .get('/fileSequence2682.ts').reply(200, 'banana')
            .get('/fileSequence2683.ts').reply(200, 'cherry')
            .get('/fileSequence2684.ts').reply(200, 'durango')
            .get('/fileSequence2685.ts').reply(200, 'whatever');
          let stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
            chunkReadahead: 1,
          });
          stream.on('progress', ({ num }) => {
            if (num === 5) {
              stream.end();
            }
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, [
              'apple',
              'banana',
              'cherry',
              'durango',
              'whatever',
            ].join(''));
            done();
          });
        });
      });
    });
  });

  describe('DASH MPD playlist', () => {
    it('Concatenates egments into stream', (done) => {
      let scope = nock('https://videohost.com')
        .get('/playlist.mpd')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/multi-representation.mpd'))
        .get('/134/0001.ts').reply(200, '01')
        .get('/134/0002.ts').reply(200, '02')
        .get('/134/0003.ts').reply(200, '03')
        .get('/134/0004.ts').reply(200, '04')
        .get('/134/0005.ts').reply(200, '05')
        .get('/134/0006.ts').reply(200, '06')
        .get('/134/0007.ts').reply(200, '07')
        .get('/134/0008.ts').reply(200, '08')
        .get('/134/0009.ts').reply(200, '09')
        .get('/134/0010.ts').reply(200, '10');
      let stream = m3u8stream('https://videohost.com/playlist.mpd', {
        id: '134',
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, [
          '01',
          '02',
          '03',
          '04',
          '05',
          '06',
          '07',
          '08',
          '09',
          '10'
        ].join(''));
        done();
      });
    });
  });

  describe('m3u8 playlist with ranges', () => {
    it('Makes ranged requests', (done) => {
      let filename = path.resolve(__dirname, 'playlists/main.mp4');
      const replyWithRange = function(this: nock.ReplyFnContext) {
        const range = this.req.headers.range;
        assert.ok(range);
        const rangeMatch = range.match(/bytes=(\d+)-(\d+)/);
        return fs.createReadStream(filename, {
          start: parseInt(rangeMatch[1]), end: parseInt(rangeMatch[2]),
        });
      };
      let scope = nock('https://somethingsomething.fyi')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/x-byterange-1.m3u8'))
        .get('/main.mp4').reply(200, replyWithRange)
        .get('/main.mp4').reply(200, replyWithRange)
        .get('/main.mp4').reply(200, replyWithRange)
        .get('/main.mp4').reply(200, replyWithRange)
        .get('/main.mp4').reply(200, replyWithRange);
      let stream = m3u8stream('https://somethingsomething.fyi/playlist.m3u8');
      let segments: m3u8stream.Progress[] = [];
      stream.on('progress', (segment) => segments.push(segment));
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.deepEqual(segments, [
          { url: 'main.mp4',
            num: 1, size: 50, duration: 0 },
          { url: 'main.mp4',
            num: 2, size: 75, duration: 4969 },
          { url: 'main.mp4',
            num: 3, size: 70, duration: 4969 },
          { url: 'main.mp4',
            num: 4, size: 70, duration: 4969 },
          { url: 'main.mp4',
            num: 5, size: 80, duration: 4969 },
        ]);
        assert.equal(body, fs.readFileSync(filename, 'utf8'));
        done();
      });
    });
  });

  describe('With a bad parser', () => {
    it('Throws bad parser error', () => {
      assert.throws(() => {
        m3u8stream('http://media.example.com/playlist.m3u8', {
          // @ts-ignore
          parser: 'baaaaad'
        });
      }, /parser '\w+' not supported/);
    });
  });

  describe('Exposes parse-time', () => {
    assert.equal(m3u8stream.parseTimestamp, humanStr);
  });
});
