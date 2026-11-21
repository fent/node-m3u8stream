import m3u8stream from '../dist/index';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { PassThrough } from 'stream';
import nock from 'nock';
import { spy, stub } from 'sinon';
import { humanStr } from '../dist/parse-time';

nock.disableNetConnect();
const concat = (
  stream: PassThrough,
  callback: (err: Error | null, body: string) => void,
) => {
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    body += chunk;
  });
  stream.on('error', callback);
  stream.on('end', () => {
    callback(null, body);
  });
};

describe('m3u8stream', () => {
  let setTimeout = global.setTimeout;
  before(() => {
    global.setTimeout = process.nextTick as typeof global.setTimeout;
  });
  after(() => {
    global.setTimeout = setTimeout;
  });

  describe('Simple media playlist', () => {
    it('Concatenates segments into stream', (done) => {
      let scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/simple.m3u8'))
        .get('/first.ts')
        .reply(200, 'one')
        .get('/second.ts')
        .reply(200, 'two')
        .get('/third.ts')
        .reply(200, 'three');
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
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/simple_relative.m3u8'),
        )
        .get('/first.ts')
        .reply(200, 'one')
        .get('/second.ts')
        .reply(200, 'two')
        .get('/third.ts')
        .reply(200, 'three');
      let stream = m3u8stream('http://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });

    it('Resolves relative segments against redirected playlist URL', (done) => {
      let redirectScope = nock('http://media.example.com')
        .get('/redirect.m3u8')
        .reply(302, '', {
          Location: 'http://cdn.example.com/hls/sub/playlist.m3u8',
        });
      let cdnScope = nock('http://cdn.example.com')
        .get('/hls/sub/playlist.m3u8')
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/simple_relative.m3u8'),
        )
        .get('/hls/sub/first.ts')
        .reply(200, 'one')
        .get('/hls/sub/second.ts')
        .reply(200, 'two')
        .get('/hls/sub/third.ts')
        .reply(200, 'three');
      let stream = m3u8stream('http://media.example.com/redirect.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        redirectScope.done();
        cdnScope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });

    it('Follows a relative redirect Location', (done) => {
      let redirectScope = nock('http://media.example.com')
        .get('/relative-redirect.m3u8')
        .reply(302, '', {
          Location: '/hls/sub/playlist.m3u8',
        });
      let cdnScope = nock('http://media.example.com')
        .get('/hls/sub/playlist.m3u8')
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/simple_relative.m3u8'),
        )
        .get('/hls/sub/first.ts')
        .reply(200, 'one')
        .get('/hls/sub/second.ts')
        .reply(200, 'two')
        .get('/hls/sub/third.ts')
        .reply(200, 'three');
      let stream = m3u8stream(
        'http://media.example.com/relative-redirect.m3u8',
      );
      concat(stream, (err, body) => {
        assert.ifError(err);
        redirectScope.done();
        cdnScope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });

    it('Tracks segment download progress', (done) => {
      let scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/simple.m3u8'))
        .get('/first.ts')
        .reply(200, 'one')
        .get('/second.ts')
        .reply(200, 'two')
        .get('/third.ts')
        .reply(200, 'three');
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
          [
            {
              duration: 9009,
              num: 1,
              size: 3,
              url: 'http://media.example.com/first.ts',
            },
            3,
            3,
          ],
          [
            {
              duration: 9009,
              num: 2,
              size: 3,
              url: 'http://media.example.com/second.ts',
            },
            3,
            6,
          ],
          [
            {
              duration: 3003,
              num: 3,
              size: 5,
              url: 'http://media.example.com/third.ts',
            },
            3,
            11,
          ],
        ]);
        done();
      });
    });

    it('Forwards events from miniget', (done) => {
      let scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/simple.m3u8'))
        .get('/first.ts')
        .reply(200, '1')
        .get('/second.ts')
        .reply(200, '2')
        .get('/third.ts')
        .reply(200, '3');
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
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/twitch-1.1.m3u8'),
          )
          .get('/videos/3.ts')
          .reply(200, 'the')
          .get('/videos/4.ts')
          .reply(200, 'big')
          .get('/videos/5.ts')
          .reply(200, 'brown')
          .get('/videos/6.ts')
          .reply(200, 'fox')
          .get('/videos/7.ts')
          .reply(200, 'jumped')
          .get('/videos/8.ts')
          .reply(200, 'over')
          .get('/videos/9.ts')
          .reply(200, 'the')
          .get('/videos/10.ts')
          .reply(200, 'lazy')
          .get('/videos/11.ts')
          .reply(200, 'dog')
          .get('/videos/12.ts')
          .reply(200, 'and')
          .get('/videos/13.ts')
          .reply(200, 'then')
          .get('/videos/14.ts')
          .reply(200, 'went')
          .get('/videos/15.ts')
          .reply(200, 'home');

        let stream = m3u8stream('https://twitch.tv/videos/sc.m3u8', {
          begin: '30s',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(
            body,
            [
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
              'home',
            ].join(''),
          );
          done();
        });
      });
    });

    describe('With `begin` and `end` set', () => {
      it('Clips the stream between begin and end', (done) => {
        let scope = nock('https://twitch.tv')
          .get('/videos/sc.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/twitch-1.1.m3u8'),
          )
          .get('/videos/3.ts')
          .reply(200, 'the')
          .get('/videos/4.ts')
          .reply(200, 'big')
          .get('/videos/5.ts')
          .reply(200, 'brown');

        let stream = m3u8stream('https://twitch.tv/videos/sc.m3u8', {
          begin: '30s',
          end: '1m',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'thebigbrown');
          done();
        });
      });
    });

    describe('With `duration` set', () => {
      it('Clips the stream to the given duration', (done) => {
        let scope = nock('https://twitch.tv')
          .get('/videos/sc.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/twitch-1.1.m3u8'),
          )
          .get('/videos/3.ts')
          .reply(200, 'the')
          .get('/videos/4.ts')
          .reply(200, 'big');

        let stream = m3u8stream('https://twitch.tv/videos/sc.m3u8', {
          begin: '30s',
          duration: '20s',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'thebig');
          done();
        });
      });

      it('Clips from the start when only duration is set on a dated playlist', (done) => {
        const playlist = [
          '#EXTM3U',
          '#EXT-X-TARGETDURATION:5',
          '#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00.000Z',
          '#EXTINF:5,',
          'first.ts',
          '#EXTINF:5,',
          'second.ts',
          '#EXT-X-ENDLIST',
        ].join('\n');
        const scope = nock('https://media.example.com')
          .get('/playlist.m3u8')
          .reply(200, playlist)
          .get('/first.ts')
          .reply(200, 'first');
        const stream = m3u8stream('https://media.example.com/playlist.m3u8', {
          duration: '5s',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'first');
          done();
        });
      });
    });

    describe('With both `end` and `duration` set', () => {
      it('Throws a TypeError', () => {
        assert.throws(() => {
          m3u8stream('https://twitch.tv/videos/sc.m3u8', {
            end: '1m',
            duration: '30s',
          });
        }, /Options `end` and `duration` cannot be used together/);
      });
    });

    describe('With `begin` >= `end`', () => {
      it('Throws a RangeError', () => {
        assert.throws(() => {
          m3u8stream('https://twitch.tv/videos/sc.m3u8', {
            begin: '1m',
            end: '30s',
          });
        }, /Option `begin` must be before `end`/);
      });
    });
  });

  describe('Master playlist', () => {
    const masterFile = path.resolve(__dirname, 'playlists/master-named.m3u8');
    const mediaFile = path.resolve(__dirname, 'playlists/simple_relative.m3u8');
    const variantScope = (variantPath: string) =>
      nock('http://media.example.com')
        .get('/master.m3u8')
        .replyWithFile(200, masterFile)
        .get(variantPath)
        .replyWithFile(200, mediaFile)
        .get(variantPath.replace(/[^/]+\.m3u8$/, 'first.ts'))
        .reply(200, 'one')
        .get(variantPath.replace(/[^/]+\.m3u8$/, 'second.ts'))
        .reply(200, 'two')
        .get(variantPath.replace(/[^/]+\.m3u8$/, 'third.ts'))
        .reply(200, 'three');

    it('Follows the first variant stream by default', (done) => {
      let scope = variantScope('/low/low.m3u8');
      let stream = m3u8stream('http://media.example.com/master.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });

    describe('With `id` matching a variant name', () => {
      it('Follows that variant stream', (done) => {
        let scope = variantScope('/hi/hi.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: 'hi',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });
    });

    describe('With `id` matching the last part of a variant URI', () => {
      it('Follows that variant stream', (done) => {
        let scope = variantScope('/audio/audio.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: 'audio.m3u8',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });
    });

    describe('With `id` matching a variant position', () => {
      it('Follows that variant stream', (done) => {
        let scope = variantScope('/audio/audio.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: '2',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });
    });

    describe('With `id` matching quality keywords', () => {
      it('Follows highest bandwidth variant stream with "highest"', (done) => {
        let scope = variantScope('/hi/hi.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: 'highest',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });

      it('Follows lowest bandwidth variant stream with "lowest"', (done) => {
        let scope = variantScope('/audio/audio.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: 'lowest',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });
    });

    describe('With `id` matching resolution shorthand', () => {
      it('Follows matching resolution with "1080p"', (done) => {
        let scope = variantScope('/hi/hi.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: '1080p',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });

      it('Follows matching resolution with "720p"', (done) => {
        let scope = variantScope('/low/low.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: '720p',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });

      it('Follows matching resolution with "1920x1080"', (done) => {
        let scope = variantScope('/hi/hi.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: '1920x1080',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });
    });

    describe('With `id` as a custom predicate function', () => {
      it('Follows matching variant stream', (done) => {
        let scope = variantScope('/hi/hi.m3u8');
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: (v) => v.frameRate === 60,
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'onetwothree');
          done();
        });
      });
    });

    describe('With a live master playlist', () => {
      it('Refreshes the child media playlist as new segments appear', (done) => {
        let masterScope = nock('https://priv.example.com')
          .get('/master.m3u8')
          .replyWithFile(200, masterFile);

        let liveScope = nock('https://priv.example.com')
          .get('/low/low.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/live-2.1.m3u8'),
          )
          .get('/fileSequence2681.ts')
          .reply(200, 'apple')
          .get('/fileSequence2682.ts')
          .reply(200, 'banana')
          .get('/fileSequence2683.ts')
          .reply(200, 'cherry')
          .get('/fileSequence2684.ts')
          .reply(200, 'durango')
          .get('/fileSequence2685.ts')
          .reply(200, 'eggfruit')
          .get('/fileSequence2686.ts')
          .reply(200, 'fig')
          .get('/fileSequence2687.ts')
          .reply(200, 'grape')
          .get('/fileSequence2688.ts')
          .reply(200, 'hackberry')
          .get('/fileSequence2689.ts')
          .reply(200, 'imbe')
          .get('/fileSequence2690.ts')
          .reply(200, 'java')
          .get('/low/low.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/live-2.2.m3u8'),
          )
          .get('/fileSequence2691.ts')
          .reply(200, 'kiwi')
          .get('/fileSequence2692.ts')
          .reply(200, 'lime')
          .get('/fileSequence2693.ts')
          .reply(200, 'mango')
          .get('/fileSequence2694.ts')
          .reply(200, 'nectarine')
          .get('/fileSequence2695.ts')
          .reply(200, 'orange')
          .get('/fileSequence2696.ts')
          .reply(200, 'papaya')
          .get('/fileSequence2697.ts')
          .reply(200, 'quince')
          .get('/fileSequence2698.ts')
          .reply(200, 'raspberry')
          .get('/fileSequence2699.ts')
          .reply(200, 'strawberry')
          .get('/fileSequence2700.ts')
          .reply(200, 'tangerine');

        let stream = m3u8stream('https://priv.example.com/master.m3u8');
        concat(stream, (err, body) => {
          assert.ifError(err);
          masterScope.done();
          liveScope.done();
          assert.equal(body.slice(0, 15), 'applebananacher');
          assert.ok(body.endsWith('strawberrytangerine'));
          done();
        });
      });
    });

    describe('With `id` that is not found', () => {
      it('Emits error', (done) => {
        let scope = nock('http://media.example.com')
          .get('/master.m3u8')
          .replyWithFile(200, masterFile);
        let stream = m3u8stream('http://media.example.com/master.m3u8', {
          id: 'nope',
        });
        stream.on('error', (err) => {
          scope.done();
          assert.equal(err.message, "variant stream 'nope' not found");
          done();
        });
        stream.on('end', () => {
          throw Error('Should not emit end');
        });
      });
    });
  });

  describe('Live media playlist', () => {
    it('Refresh after nearing end of segment list', (done) => {
      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-2.1.m3u8'))
        .get('/fileSequence2681.ts')
        .reply(200, 'apple')
        .get('/fileSequence2682.ts')
        .reply(200, 'banana')
        .get('/fileSequence2683.ts')
        .reply(200, 'cherry')
        .get('/fileSequence2684.ts')
        .reply(200, 'durango')
        .get('/fileSequence2685.ts')
        .reply(200, 'eggfruit')
        .get('/fileSequence2686.ts')
        .reply(200, 'fig')
        .get('/fileSequence2687.ts')
        .reply(200, 'grape')
        .get('/fileSequence2688.ts')
        .reply(200, 'hackberry')
        .get('/fileSequence2689.ts')
        .reply(200, 'imbe')
        .get('/fileSequence2690.ts')
        .reply(200, 'java')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-2.2.m3u8'))
        .get('/fileSequence2691.ts')
        .reply(200, 'kiwi')
        .get('/fileSequence2692.ts')
        .reply(200, 'lime')
        .get('/fileSequence2693.ts')
        .reply(200, 'melon')
        .get('/fileSequence2694.ts')
        .reply(200, 'nut')
        .get('/fileSequence2695.ts')
        .reply(200, 'orange')
        .get('/fileSequence2696.ts')
        .reply(200, 'pear')
        .get('/fileSequence2697.ts')
        .reply(200, 'melon')
        .get('/fileSequence2698.ts')
        .reply(200, 'quince')
        .get('/fileSequence2699.ts')
        .reply(200, 'raspberry')
        .get('/fileSequence2700.ts')
        .reply(200, 'strawberry');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(
          body,
          [
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
            'strawberry',
          ].join(''),
        );
        done();
      });
    });

    it('Stops on error getting playlist', (done) => {
      let scope = nock('http://mysite.com')
        .get('/pl.m3u8')
        .replyWithError('Nooo');
      let stream = m3u8stream('http://mysite.com/pl.m3u8', {
        requestOptions: { maxRetries: 0 },
      });
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
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts')
        .reply(200, 'one')
        .get('/fileSequence2682.ts')
        .reply(200, 'two')
        .get('/fileSequence2683.ts')
        .reply(200, 'three')
        .get('/playlist.m3u8')
        .replyWithError('uh oh');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
        requestOptions: { maxRetries: 0 },
      });
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
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts')
        .reply(200, 'hello')
        .get('/fileSequence2682.ts')
        .replyWithError('bad segment');
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
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts')
        .reply(200, 'apple')
        .get('/fileSequence2682.ts')
        .reply(200, 'banana')
        .get('/fileSequence2683.ts')
        .reply(200, 'cherry')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.1.m3u8'))
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.2.m3u8'))
        .get('/fileSequence2684.ts')
        .reply(200, 'fig')
        .get('/fileSequence2685.ts')
        .reply(200, 'grape');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(
          body,
          ['apple', 'banana', 'cherry', 'fig', 'grape'].join(''),
        );
        done();
      });
    });

    it('Reloads after the target duration, or half of it when unchanged', (done) => {
      let nextTick = global.setTimeout;
      let delays: number[] = [];
      global.setTimeout = ((fn: () => void, ms: number) => {
        delays.push(ms);
        return nextTick(fn);
      }) as typeof global.setTimeout;
      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts')
        .reply(200, 'apple')
        .get('/fileSequence2682.ts')
        .reply(200, 'banana')
        .get('/fileSequence2683.ts')
        .reply(200, 'cherry')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.1.m3u8'))
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.2.m3u8'))
        .get('/fileSequence2684.ts')
        .reply(200, 'fig')
        .get('/fileSequence2685.ts')
        .reply(200, 'grape');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      concat(stream, (err) => {
        try {
          assert.ifError(err);
          scope.done();
          assert.deepEqual(
            delays.map((ms) => Math.round(ms / 1000)),
            [8, 4],
          );
          done();
        } finally {
          global.setTimeout = nextTick;
        }
      });
    });

    it('Reloads HLS playlist after half the target duration when refresh contains 0 segments', (done) => {
      let nextTick = global.setTimeout;
      let delays: number[] = [];
      global.setTimeout = ((fn: () => void, ms: number) => {
        delays.push(ms);
        return nextTick(fn);
      }) as typeof global.setTimeout;

      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts')
        .reply(200, 'apple')
        .get('/fileSequence2682.ts')
        .reply(200, 'banana')
        .get('/fileSequence2683.ts')
        .reply(200, 'cherry')
        .get('/playlist.m3u8')
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/live-empty.m3u8'),
        )
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/live-1.2.m3u8'))
        .get('/fileSequence2684.ts')
        .reply(200, 'fig')
        .get('/fileSequence2685.ts')
        .reply(200, 'grape');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      concat(stream, (err) => {
        try {
          assert.ifError(err);
          scope.done();
          assert.deepEqual(
            delays.map((ms) => Math.round(ms / 1000)),
            [8, 4],
          );
          done();
        } finally {
          global.setTimeout = nextTick;
        }
      });
    });

    it('Deduplicates unchanged EXT-X-MAP initialization segment across refreshes', (done) => {
      const liveMap1 = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:1',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:5,',
        'seg1.m4s',
        '#EXTINF:5,',
        'seg2.m4s',
      ].join('\n');
      const liveMap2 = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:2',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:5,',
        'seg2.m4s',
        '#EXTINF:5,',
        'seg3.m4s',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .reply(200, liveMap1)
        .get('/init.mp4')
        .reply(200, '[init]')
        .get('/seg1.m4s')
        .reply(200, 'one')
        .get('/seg2.m4s')
        .reply(200, 'two')
        .get('/playlist.m3u8')
        .reply(200, liveMap2)
        .get('/seg3.m4s')
        .reply(200, 'three');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, '[init]onetwothree');
        done();
      });
    });

    describe('With dated segments', () => {
      describe('With `begin` set to now', () => {
        it('Starts stream on segment that matches `begin`', (done) => {
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0005.ts')
            .reply(200, '05')
            .get('/fileSequence0006.ts')
            .reply(200, '06')
            .get('/fileSequence0007.ts')
            .reply(200, '07')
            .get('/fileSequence0008.ts')
            .reply(200, '08')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.2.m3u8'),
            )
            .get('/fileSequence0009.ts')
            .reply(200, '09')
            .get('/fileSequence0010.ts')
            .reply(200, '10')
            .get('/fileSequence0011.ts')
            .reply(200, '11')
            .get('/fileSequence0012.ts')
            .reply(200, '12');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: Date.now(),
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(
              body,
              ['05', '06', '07', '08', '09', '10', '11', '12'].join(''),
            );
            done();
          });
        });

        it('Clips live stream when `duration` is set with absolute `begin`', (done) => {
          let starttime = new Date('2018-06-12T22:34:06.340+00:00').getTime();
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0003.ts')
            .reply(200, '03')
            .get('/fileSequence0004.ts')
            .reply(200, '04');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: starttime + 13713,
            duration: 9977,
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, '0304');
            done();
          });
        });

        it('Clips live stream when absolute `end` is set with absolute `begin`', (done) => {
          let starttime = new Date('2018-06-12T22:34:06.340+00:00').getTime();
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0003.ts')
            .reply(200, '03')
            .get('/fileSequence0004.ts')
            .reply(200, '04');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: starttime + 13713,
            end: starttime + 23690,
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, '0304');
            done();
          });
        });
      });

      describe('With `begin` set using relative format', () => {
        it('Starts stream on segment that matches `begin`', (done) => {
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0003.ts')
            .reply(200, '03')
            .get('/fileSequence0004.ts')
            .reply(200, '04')
            .get('/fileSequence0005.ts')
            .reply(200, '05')
            .get('/fileSequence0006.ts')
            .reply(200, '06')
            .get('/fileSequence0007.ts')
            .reply(200, '07')
            .get('/fileSequence0008.ts')
            .reply(200, '08')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.2.m3u8'),
            )
            .get('/fileSequence0009.ts')
            .reply(200, '09')
            .get('/fileSequence0010.ts')
            .reply(200, '10')
            .get('/fileSequence0011.ts')
            .reply(200, '11')
            .get('/fileSequence0012.ts')
            .reply(200, '12');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: '10s',
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(
              body,
              ['03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].join(
                '',
              ),
            );
            done();
          });
        });

        it('Clips live stream when `duration` is set', (done) => {
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0003.ts')
            .reply(200, '03')
            .get('/fileSequence0004.ts')
            .reply(200, '04');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: '10s',
            duration: '10s',
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, '0304');
            done();
          });
        });

        it('Clips live stream when `end` is set using relative format', (done) => {
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0003.ts')
            .reply(200, '03')
            .get('/fileSequence0004.ts')
            .reply(200, '04');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: '10s',
            end: '20s',
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, '0304');
            done();
          });
        });

        it('Clips live stream when relative `begin` and absolute `end` are mixed', (done) => {
          let starttime = new Date('2018-06-12T22:34:06.340+00:00').getTime();
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0003.ts')
            .reply(200, '03')
            .get('/fileSequence0004.ts')
            .reply(200, '04');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: '13713ms',
            end: starttime + 23690,
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, '0304');
            done();
          });
        });

        it('Clips live stream when absolute `begin` and relative `end` are mixed', (done) => {
          let starttime = new Date('2018-06-12T22:34:06.340+00:00').getTime();
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            )
            .get('/fileSequence0003.ts')
            .reply(200, '03')
            .get('/fileSequence0004.ts')
            .reply(200, '04');

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: starttime + 13713,
            end: '23690ms',
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, '0304');
            done();
          });
        });

        it('Emits RangeError when mixed relative `begin` >= absolute `end`', (done) => {
          let starttime = new Date('2018-06-12T22:34:06.340+00:00').getTime();
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
            );

          let stream = m3u8stream('https://yt.com/playlist.m3u8', {
            begin: '30s',
            end: starttime + 10000,
          });
          stream.on('error', (err) => {
            if (!(err instanceof RangeError)) {
              return;
            }
            scope.done();
            assert.equal(err.message, 'Option `begin` must be before `end`');
            done();
          });
          stream.on('end', () => {
            throw Error('Should not emit end');
          });
        });
      });
    });

    describe('With `begin` set to "live"', () => {
      it('Starts stream on live edge within liveBuffer for undated segments', (done) => {
        let scope = nock('https://priv.example.com')
          .get('/playlist.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/live-2.1.m3u8'),
          )
          .get('/fileSequence2688.ts')
          .reply(200, 'hackberry')
          .get('/fileSequence2689.ts')
          .reply(200, 'imbe')
          .get('/fileSequence2690.ts')
          .reply(200, 'java')
          .get('/playlist.m3u8')
          .reply(200, '#EXTM3U\n#EXT-X-ENDLIST\n');

        let stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
          begin: 'live',
          liveBuffer: 20000,
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'hackberryimbejava');
          done();
        });
      });

      it('Starts stream on live edge within liveBuffer for dated segments', (done) => {
        let scope = nock('https://yt.com')
          .get('/playlist.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
          )
          .get('/fileSequence0006.ts')
          .reply(200, '06')
          .get('/fileSequence0007.ts')
          .reply(200, '07')
          .get('/fileSequence0008.ts')
          .reply(200, '08')
          .get('/playlist.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/youtube-live-1.2.m3u8'),
          )
          .get('/fileSequence0009.ts')
          .reply(200, '09')
          .get('/fileSequence0010.ts')
          .reply(200, '10')
          .get('/fileSequence0011.ts')
          .reply(200, '11')
          .get('/fileSequence0012.ts')
          .reply(200, '12');

        let stream = m3u8stream('https://yt.com/playlist.m3u8', {
          begin: 'live',
          liveBuffer: 15000,
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, '06070809101112');
          done();
        });
      });

      it('Clips live stream when `duration` is set with begin "live"', (done) => {
        let scope = nock('https://priv.example.com')
          .get('/playlist.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/live-2.1.m3u8'),
          )
          .get('/fileSequence2688.ts')
          .reply(200, 'hackberry')
          .get('/fileSequence2689.ts')
          .reply(200, 'imbe');

        let stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
          begin: 'live',
          liveBuffer: 20000,
          duration: '15s',
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, 'hackberryimbe');
          done();
        });
      });

      it('Clips live edge to an absolute end within liveBuffer', (done) => {
        const starttime = new Date('2018-06-12T22:34:06.340+00:00').getTime();
        const scope = nock('https://yt.com')
          .get('/playlist.m3u8')
          .replyWithFile(
            200,
            path.resolve(__dirname, 'playlists/youtube-live-1.1.m3u8'),
          )
          .get('/fileSequence0001.ts')
          .reply(200, '01')
          .get('/fileSequence0002.ts')
          .reply(200, '02')
          .get('/fileSequence0003.ts')
          .reply(200, '03')
          .get('/fileSequence0004.ts')
          .reply(200, '04');
        const stream = m3u8stream('https://yt.com/playlist.m3u8', {
          begin: 'live',
          liveBuffer: 20000,
          end: starttime + 23690 + 20000,
        });
        concat(stream, (err, body) => {
          assert.ifError(err);
          scope.done();
          assert.equal(body, '01020304');
          done();
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

        it('Destroys stream right away with stream.destroy()', (done) => {
          let stream = m3u8stream('https://whatever.com/playlist.m3u8');
          stream.on('close', done);
          stream.destroy();
        });
      });

      describe('In the middle of the segments list', () => {
        it('Stops stream from emitting more data and ends it', (done) => {
          let scope = nock('https://priv.example.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/live-2.1.m3u8'),
            )
            .get('/fileSequence2681.ts')
            .reply(200, 'apple')
            .get('/fileSequence2682.ts')
            .reply(200, 'banana')
            .get('/fileSequence2683.ts')
            .reply(200, 'cherry')
            .get('/fileSequence2684.ts')
            .reply(200, 'durango')
            .get('/fileSequence2685.ts')
            .reply(200, 'whatever');
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
            assert.equal(
              body,
              ['apple', 'banana', 'cherry', 'durango', 'whatever'].join(''),
            );
            done();
          });
        });

        it('Cleans up in-flight requests when destroyed with stream.destroy()', (done) => {
          let scope = nock('https://priv.example.com')
            .get('/playlist.m3u8')
            .replyWithFile(
              200,
              path.resolve(__dirname, 'playlists/live-2.1.m3u8'),
            )
            .get('/fileSequence2681.ts')
            .reply(200, 'apple')
            .get('/fileSequence2682.ts')
            .delay(50)
            .reply(200, 'banana')
            .get('/fileSequence2683.ts')
            .delay(50)
            .reply(200, 'cherry');
          let stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
            chunkReadahead: 3,
          });
          let body = '';
          stream.setEncoding('utf8');
          stream.on('data', (chunk: string) => {
            body += chunk;
          });
          stream.on('progress', ({ num }) => {
            if (num === 1) {
              stream.destroy();
            }
          });
          stream.on('close', () => {
            scope.done();
            assert.equal(body, 'apple');
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
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/multi-representation.mpd'),
        )
        .get('/134/0001.ts')
        .reply(200, '01')
        .get('/134/0002.ts')
        .reply(200, '02')
        .get('/134/0003.ts')
        .reply(200, '03')
        .get('/134/0004.ts')
        .reply(200, '04')
        .get('/134/0005.ts')
        .reply(200, '05')
        .get('/134/0006.ts')
        .reply(200, '06')
        .get('/134/0007.ts')
        .reply(200, '07')
        .get('/134/0008.ts')
        .reply(200, '08')
        .get('/134/0009.ts')
        .reply(200, '09')
        .get('/134/0010.ts')
        .reply(200, '10');
      let stream = m3u8stream('https://videohost.com/playlist.mpd', {
        id: '134',
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(
          body,
          ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].join(''),
        );
        done();
      });
    });

    it('Reloads DASH playlist after half segment duration when refresh contains 0 segments', (done) => {
      let nextTick = global.setTimeout;
      let delays: number[] = [];
      global.setTimeout = ((fn: () => void, ms: number) => {
        delays.push(ms);
        return nextTick(fn);
      }) as typeof global.setTimeout;

      let scope = nock('https://videohost.com')
        .get('/playlist.mpd')
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/live-dash-1.1.mpd'),
        )
        .get('/0001.ts')
        .reply(200, '01')
        .get('/playlist.mpd')
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/live-dash-1.2.mpd'),
        )
        .get('/playlist.mpd')
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/live-dash-1.3.mpd'),
        )
        .get('/0002.ts')
        .reply(200, '02');

      let stream = m3u8stream('https://videohost.com/playlist.mpd', {
        id: '1',
      });
      concat(stream, (err) => {
        try {
          assert.ifError(err);
          scope.done();
          assert.deepEqual(
            delays.map((ms) => Math.round(ms / 1000)),
            [2, 1],
          );
          done();
        } finally {
          global.setTimeout = nextTick;
        }
      });
    });

    it('Makes ranged requests for DASH segments with mediaRange and range', (done) => {
      const mpdXml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>video.mp4</BaseURL>
        <SegmentList>
          <Initialization range="0-3" />
          <SegmentURL mediaRange="4-7" />
          <SegmentURL mediaRange="8-11" />
        </SegmentList>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      let scope = nock('https://videohost.com')
        .get('/playlist.mpd')
        .reply(200, mpdXml)
        .get('/video.mp4')
        .matchHeader('Range', 'bytes=0-3')
        .reply(206, 'init')
        .get('/video.mp4')
        .matchHeader('Range', 'bytes=4-7')
        .reply(206, 'seg1')
        .get('/video.mp4')
        .matchHeader('Range', 'bytes=8-11')
        .reply(206, 'seg2');
      let stream = m3u8stream('https://videohost.com/playlist.mpd');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'initseg1seg2');
        done();
      });
    });

    it('Streams DASH playlist using <SegmentBase> with byte ranges', (done) => {
      let mpdXml = `
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1" bandwidth="1000000">
        <BaseURL>video.mp4</BaseURL>
        <SegmentBase indexRange="4-9">
          <Initialization range="0-3" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      let scope = nock('https://videohost.com')
        .get('/playlist.mpd')
        .reply(200, mpdXml)
        .get('/video.mp4')
        .matchHeader('Range', 'bytes=0-3')
        .reply(206, 'init')
        .get('/video.mp4')
        .matchHeader('Range', 'bytes=10-')
        .reply(206, 'media');
      let stream = m3u8stream('https://videohost.com/playlist.mpd');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'initmedia');
        done();
      });
    });

    it('Streams segments from every Period', (done) => {
      const mpdXml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT2S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="1000" media="p1-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
  <Period start="PT2S" duration="PT2S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="1000" media="p2-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const scope = nock('https://videohost.com')
        .get('/playlist.mpd')
        .reply(200, mpdXml)
        .get('/p1-1.m4s')
        .reply(200, '1')
        .get('/p1-2.m4s')
        .reply(200, '1')
        .get('/p2-1.m4s')
        .reply(200, '2')
        .get('/p2-2.m4s')
        .reply(200, '2');
      const stream = m3u8stream('https://videohost.com/playlist.mpd');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, '1122');
        done();
      });
    });

    it('Deduplicates identical DASH segment URLs across Periods', (done) => {
      const mpdXml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT1S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="1000" media="same-1.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
  <Period start="PT1S" duration="PT1S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="1000" media="same-1.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const scope = nock('https://videohost.com')
        .get('/playlist.mpd')
        .reply(200, mpdXml)
        .get('/same-1.m4s')
        .reply(200, '1');
      const stream = m3u8stream('https://videohost.com/playlist.mpd');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, '1');
        done();
      });
    });

    it('Bounds the DASH deduplication cache', (done) => {
      const mpdXml = `<?xml version="1.0"?>
<MPD type="static" xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period duration="PT1001S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="1">
        <SegmentTemplate timescale="1000" duration="1000" media="seg-$Number$.m4s" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
      const scope = nock('https://videohost.com')
        .get('/playlist.mpd')
        .reply(200, mpdXml)
        .get(/\/seg-\d+\.m4s$/)
        .times(1001)
        .reply(200, 'x');
      const stream = m3u8stream('https://videohost.com/playlist.mpd');
      concat(stream, (err, body) => {
        try {
          assert.ifError(err);
          scope.done();
          assert.equal(body.length, 1001);
          done();
        } catch (assertionError) {
          done(assertionError as Error);
        }
      });
    });
  });

  describe('m3u8 playlist with ranges', () => {
    it('Makes ranged requests', (done) => {
      let filename = path.resolve(__dirname, 'playlists/main.mp4');
      function replyWithRange(this: nock.ReplyFnContext) {
        /* eslint no-invalid-this: off */
        const range = this.req.headers.range;
        assert.ok(range);
        const rangeMatch = range.match(/bytes=(\d+)-(\d+)/);
        if (!rangeMatch) {
          throw Error(`Bad range: ${range}`);
        }
        return fs.createReadStream(filename, {
          start: parseInt(rangeMatch[1]),
          end: parseInt(rangeMatch[2]),
        });
      }
      let scope = nock('https://somethingsomething.fyi')
        .get('/playlist.m3u8')
        .replyWithFile(
          200,
          path.resolve(__dirname, 'playlists/x-byterange-1.m3u8'),
        )
        .get('/main.mp4')
        .reply(200, replyWithRange)
        .get('/main.mp4')
        .reply(200, replyWithRange)
        .get('/main.mp4')
        .reply(200, replyWithRange)
        .get('/main.mp4')
        .reply(200, replyWithRange)
        .get('/main.mp4')
        .reply(200, replyWithRange);
      let stream = m3u8stream('https://somethingsomething.fyi/playlist.m3u8');
      let segments: m3u8stream.Progress[] = [];
      stream.on('progress', (segment) => segments.push(segment));
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.deepEqual(segments, [
          { url: 'main.mp4', num: 1, size: 50, duration: 0 },
          { url: 'main.mp4', num: 2, size: 75, duration: 4969 },
          { url: 'main.mp4', num: 3, size: 70, duration: 4969 },
          { url: 'main.mp4', num: 4, size: 70, duration: 4969 },
          { url: 'main.mp4', num: 5, size: 80, duration: 4969 },
        ]);
        assert.equal(body, fs.readFileSync(filename, 'utf8'));
        done();
      });
    });
  });

  describe('Encrypted media playlist', () => {
    const key = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
    const iv = Buffer.from('bf9840dc7d7fa163301a6c38844d6239', 'hex');

    const encrypt = (text: string, keyBuf: Buffer, ivBuf: Buffer): Buffer => {
      const cipher = crypto.createCipheriv('aes-128-cbc', keyBuf, ivBuf);
      return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    };

    it('Decrypts AES-128 segments using specified IV', (done) => {
      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/x-key.m3u8'))
        .get('/sig.php')
        .reply(200, key, { 'Cache-Control': 'max-age=3600' })
        .get('/main1.mp4')
        .reply(200, encrypt('one', key, iv))
        .get('/main2.mp4')
        .reply(200, encrypt('two', key, iv))
        .get('/main3.mp4')
        .reply(200, encrypt('three', key, iv))
        .get('/main4.mp4')
        .reply(200, encrypt('four', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothreefour');
        done();
      });
    });

    it('Forwards miniget events from key requests', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
        '#EXTINF:5,',
        'seg1.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(200, key)
        .get('/seg1.ts')
        .reply(200, encrypt('one', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      let requests = 0;
      stream.on('request', () => requests++);
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'one');
        assert.equal(requests, 3);
        done();
      });
    });

    it('Decrypts segments using sequence number IV when IV attribute is omitted', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:1',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
        '#EXTINF:5,',
        'seg1.ts',
        '#EXTINF:5,',
        'seg2.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const iv1 = Buffer.alloc(16);
      iv1.writeBigUInt64BE(BigInt(1), 8);
      const iv2 = Buffer.alloc(16);
      iv2.writeBigUInt64BE(BigInt(2), 8);

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(200, key, { 'Cache-Control': 'max-age=3600' })
        .get('/seg1.ts')
        .reply(200, encrypt('seq_one', key, iv1))
        .get('/seg2.ts')
        .reply(200, encrypt('seq_two', key, iv2));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'seq_oneseq_two');
        done();
      });
    });

    it('Resolves relative key URI against variant playlist URL when following master playlist', (done) => {
      const masterPlaylist = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=1280000',
        'variants/sub/prog.m3u8',
      ].join('\n');

      const variantPlaylist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:1',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
        '#EXTINF:5,',
        'seg1.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const iv1 = Buffer.alloc(16);
      iv1.writeBigUInt64BE(BigInt(1), 8);

      let scope = nock('https://media.example.com')
        .get('/master.m3u8')
        .reply(200, masterPlaylist)
        .get('/variants/sub/prog.m3u8')
        .reply(200, variantPlaylist)
        .get('/variants/sub/sig.php')
        .reply(200, key)
        .get('/variants/sub/seg1.ts')
        .reply(200, encrypt('variant_seg', key, iv1));

      let stream = m3u8stream('https://media.example.com/master.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'variant_seg');
        done();
      });
    });

    it('Emits error when METHOD is SAMPLE-AES', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="./sig.php"',
        '#EXTINF:5,',
        'sample.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sample.ts')
        .reply(200, 'sample_data');

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      stream.on('error', (err) => {
        assert.equal(err.message, '`SAMPLE-AES` encryption is not supported');
        scope.done();
        done();
      });
    });

    it('Emits error when only an unsupported KEYFORMAT key is available', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",KEYFORMAT="com.apple.streamingkeydelivery"',
        '#EXTINF:5,',
        'sample.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist);

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      stream.on('error', (err) => {
        assert.match(err.message, /unsupported `KEYFORMAT`/);
        scope.done();
        done();
      });
    });

    it('Uses an identity key when an unsupported key is also declared', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./fairplay.php",KEYFORMAT="com.apple.streamingkeydelivery"',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
        '#EXTINF:5,',
        'sample.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(200, key)
        .get('/sample.ts')
        .reply(200, encrypt('sample_data', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'sample_data');
        done();
      });
    });

    const assertStreamError = (
      stream: m3u8stream.Stream,
      scope: nock.Scope,
      expected: string | RegExp | null,
      done: (err?: any) => void,
    ) => {
      let called = false;
      stream.on('error', (err) => {
        if (!called) {
          called = true;
          if (expected instanceof RegExp) {
            assert.match(err.message, expected);
          } else if (typeof expected === 'string') {
            assert.equal(err.message, expected);
          } else {
            assert.ok(err);
          }
          scope.done();
          done();
        }
      });
    };

    it('Emits error when key request fails', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
        '#EXTINF:5,',
        'main1.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(404, 'not found')
        .get('/main1.mp4')
        .reply(200, encrypt('one', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      assertStreamError(stream, scope, /Status code: 404/, done);
    });

    it('Emits error when key is not 16 octets', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
        '#EXTINF:5,',
        'main1.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(200, Buffer.alloc(8))
        .get('/main1.mp4')
        .reply(200, encrypt('one', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      assertStreamError(
        stream,
        scope,
        'Invalid key length: expected 16 octets, got 8',
        done,
      );
    });

    it('Emits error when decipher fails to decrypt segment', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
        '#EXTINF:5,',
        'main1.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(200, key)
        .get('/main1.mp4')
        .reply(200, Buffer.from('corrupted ciphertext that fails cbc'));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      assertStreamError(stream, scope, null, done);
    });

    it('Emits error when encrypted segment request errors', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
        '#EXTINF:5,',
        'main1.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(200, key)
        .get('/main1.mp4')
        .replyWithError('segment download failed');

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      assertStreamError(stream, scope, 'segment download failed', done);
    });

    it('Preserves segment playback order when key resolution is delayed', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:1',
        '#EXT-X-KEY:METHOD=AES-128,URI="./slow-key.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
        '#EXTINF:5,',
        'seg1.mp4',
        '#EXT-X-KEY:METHOD=NONE',
        '#EXTINF:5,',
        'seg2.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/slow-key.php')
        .delay(50)
        .reply(200, key, { 'Cache-Control': 'max-age=3600' })
        .get('/seg1.mp4')
        .reply(200, encrypt('first', key, iv))
        .get('/seg2.mp4')
        .reply(200, 'second');

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'firstsecond');
        done();
      });
    });

    const testKeyCaching = (
      keyPath: string,
      headers: { [key: string]: string } | undefined,
      expectKeyRequests: number,
      done: (err?: any) => void,
    ) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:1',
        `#EXT-X-KEY:METHOD=AES-128,URI=".${keyPath}",IV=0xbf9840dc7d7fa163301a6c38844d6239`,
        '#EXTINF:5,',
        'seg1.mp4',
        '#EXTINF:5,',
        'seg2.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist);

      for (let i = 0; i < expectKeyRequests; i++) {
        if (headers) {
          scope = scope.get(keyPath).reply(200, key, headers);
        } else {
          scope = scope.get(keyPath).reply(200, key);
        }
      }

      scope = scope
        .get('/seg1.mp4')
        .reply(200, encrypt('one', key, iv))
        .get('/seg2.mp4')
        .reply(200, encrypt('two', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8', {
        chunkReadahead: 1,
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwo');
        done();
      });
    };

    it('Refetches key for subsequent segments if response lacks Cache-Control/Expires', (done) => {
      testKeyCaching('/uncached-key.php', undefined, 2, done);
    });

    it('Caches key for subsequent segments if response contains Expires header', (done) => {
      testKeyCaching(
        '/expires-key.php',
        { Expires: 'Wed, 21 Oct 2030 07:28:00 GMT' },
        1,
        done,
      );
    });

    it('Refetches key if response contains Cache-Control: no-cache', (done) => {
      testKeyCaching(
        '/nocache-key.php',
        { 'Cache-Control': 'no-cache' },
        2,
        done,
      );
    });

    it('Refetches key if response contains Cache-Control: max-age=0', (done) => {
      testKeyCaching(
        '/max-age-zero-key.php',
        { 'Cache-Control': 'max-age=0' },
        2,
        done,
      );
    });

    it('Refetches key if response contains expired Expires header', (done) => {
      testKeyCaching(
        '/expired-key.php',
        { Expires: 'Wed, 21 Oct 2020 07:28:00 GMT' },
        2,
        done,
      );
    });

    it('Shares in-flight key request across concurrent segments', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:1',
        '#EXT-X-KEY:METHOD=AES-128,URI="./concurrent-key.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
        '#EXTINF:5,',
        'seg1.mp4',
        '#EXTINF:5,',
        'seg2.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/concurrent-key.php')
        .delay(30)
        .reply(200, key, { 'Cache-Control': 'no-cache' })
        .get('/seg1.mp4')
        .reply(200, encrypt('one', key, iv))
        .get('/seg2.mp4')
        .reply(200, encrypt('two', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8', {
        chunkReadahead: 2,
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwo');
        done();
      });
    });

    it('Evicts expired key from cache and refetches', (done) => {
      let now = 1700000000000;
      const clock = stub(Date, 'now').callsFake(() => now);

      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:1',
        '#EXT-X-KEY:METHOD=AES-128,URI="./ttl-key.php",IV=0xbf9840dc7d7fa163301a6c38844d6239',
        '#EXTINF:5,',
        'seg1.mp4',
        '#EXTINF:5,',
        'seg2.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/ttl-key.php')
        .reply(200, key, { 'Cache-Control': 'max-age=60' })
        .get('/seg1.mp4')
        .reply(200, encrypt('one', key, iv))
        .get('/ttl-key.php')
        .reply(200, key, { 'Cache-Control': 'max-age=60' })
        .get('/seg2.mp4')
        .reply(200, encrypt('two', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8', {
        chunkReadahead: 1,
      });
      stream.on('progress', (p) => {
        if (p.num === 1) {
          now += 120 * 1000;
        }
      });
      concat(stream, (err, body) => {
        clock.restore();
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwo');
        done();
      });
    });

    it('Destroys request when stream ends before decipher resolves', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
        '#EXTINF:5,',
        'main1.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .delay(50)
        .reply(200, key)
        .get('/main1.mp4')
        .reply(200, encrypt('one', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      stream.on('request', (req: any) => {
        if (req.path === '/main1.mp4') {
          setTimeout(() => {
            stream.end();
          }, 10);
        }
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        assert.equal(body, '');
        scope.done();
        done();
      });
    });

    it('Destroys request when stream ends as decipher resolves', (done) => {
      const playlist = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-KEY:METHOD=AES-128,URI="./sig.php"',
        '#EXTINF:5,',
        'main1.mp4',
        '#EXT-X-ENDLIST',
      ].join('\n');

      let scope = nock('https://media.example.com')
        .get('/playlist.m3u8')
        .reply(200, playlist)
        .get('/sig.php')
        .reply(200, key)
        .get('/main1.mp4')
        .reply(200, encrypt('one', key, iv));

      let stream = m3u8stream('https://media.example.com/playlist.m3u8');
      stream.on('response', (res: any) => {
        if (res.req.path === '/sig.php') {
          res.on('end', () => {
            Promise.resolve().then(() => stream.end());
          });
        }
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        assert.equal(body, '');
        setImmediate(() => {
          scope.done();
          done();
        });
      });
    });
  });

  describe('With a bad parser', () => {
    it('Throws bad parser error', () => {
      assert.throws(() => {
        m3u8stream('http://media.example.com/playlist.m3u8', {
          // @ts-ignore
          parser: 'baaaaad',
        });
      }, /parser '\w+' not supported/);
    });
  });

  describe('Exposes parse-time', () => {
    assert.equal(m3u8stream.parseTimestamp, humanStr);
  });
});
