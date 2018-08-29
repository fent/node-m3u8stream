const m3u8stream = require('..');
const path       = require('path');
const assert     = require('assert');
const nock       = require('nock');


function concat(stream, callback) {
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => { body += chunk; });
  stream.on('error', callback);
  stream.on('end', () => { callback(null, body); });
}

describe('m3u8stream', () => {
  let setTimeout = global.setTimeout;
  before(() => { global.setTimeout = (fn) => { setTimeout(fn); }; });
  after(() => { global.setTimeout = setTimeout; });
  before(() => { nock.disableNetConnect(); });
  after(() => { nock.enableNetConnect(); });

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
  });

  describe('Live media playlist', () => {
    it('Refresh after nearing end of segment list', (done) => {
      let scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-2.1.m3u8'))
        .get('/fileSequence2681.ts').reply(() => {
          process.nextTick(passSomeTime);
          return 'apple';
        })
        .get('/fileSequence2682.ts').reply(200, 'banana')
        .get('/fileSequence2683.ts').reply(200, 'cherry')
        .get('/fileSequence2684.ts').reply(200, 'durango')
        .get('/fileSequence2685.ts').reply(200, 'eggfruit')
        .get('/fileSequence2686.ts').reply(200, 'fig')
        .get('/fileSequence2687.ts').reply(200, 'grape')
        .get('/fileSequence2688.ts').reply(200, 'hackberry')
        .get('/fileSequence2689.ts').reply(200, 'imbe')
        .get('/fileSequence2690.ts').reply(200, 'java');

      function passSomeTime() {
        scope.get('/playlist.m3u8')
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
      }

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
      let stream = m3u8stream('http://mysite.com/pl.m3u8');
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
        .get('/fileSequence2681.ts').reply(() => {
          process.nextTick(() => {
            scope
              .get('/playlist.m3u8')
              .replyWithError('uh oh');
          });
          return 'one';
        })
        .get('/fileSequence2682.ts').reply(200, 'two')
        .get('/fileSequence2683.ts').reply(200, 'three');

      let stream = m3u8stream('https://priv.example.com/playlist.m3u8');
      stream.on('error', (err) => {
        scope.done();
        assert.equal(err.message, 'uh oh');
        done();
      });
      stream.on('end', () => {
        throw new Error('Should not emit end');
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
      });
      stream.on('error', (err) => {
        assert.equal(err.message, 'bad segment');
        scope.done();
        done();
      });
      stream.on('end', () => {
        throw new Error('Should not emit end');
      });
    });

    describe('With dated segments', () => {
      describe('With `begin` set to now', () => {
        it('Starts stream on segment that matches `begin`', (done) => {
          let scope = nock('https://yt.com')
            .get('/playlist.m3u8')
            .replyWithFile(200, path.resolve(__dirname,
              'playlists/youtube-live-1.1.m3u8'))
            .get('/fileSequence0005.ts').reply(() => {
              process.nextTick(passSomeTime);
              return '05';
            })
            .get('/fileSequence0006.ts').reply(200, '06')
            .get('/fileSequence0007.ts').reply(200, '07')
            .get('/fileSequence0008.ts').reply(200, '08');

          function passSomeTime() {
            scope.get('/playlist.m3u8')
              .replyWithFile(200, path.resolve(__dirname,
                'playlists/youtube-live-1.2.m3u8'))
              .get('/fileSequence0009.ts').reply(200, '09')
              .get('/fileSequence0010.ts').reply(200, '10')
              .get('/fileSequence0011.ts').reply(200, '11')
              .get('/fileSequence0012.ts').reply(200, '12');
          }

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
            .get('/fileSequence0003.ts').reply(() => {
              process.nextTick(passSomeTime);
              return '03';
            })
            .get('/fileSequence0004.ts').reply(200, '04')
            .get('/fileSequence0005.ts').reply(200, '05')
            .get('/fileSequence0006.ts').reply(200, '06')
            .get('/fileSequence0007.ts').reply(200, '07')
            .get('/fileSequence0008.ts').reply(200, '08');

          function passSomeTime() {
            scope.get('/playlist.m3u8')
              .replyWithFile(200, path.resolve(__dirname,
                'playlists/youtube-live-1.2.m3u8'))
              .get('/fileSequence0009.ts').reply(200, '09')
              .get('/fileSequence0010.ts').reply(200, '10')
              .get('/fileSequence0011.ts').reply(200, '11')
              .get('/fileSequence0012.ts').reply(200, '12');
          }

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

      describe('With `begin` set in the past', () => {
        it('Starts stream on segment that matches `begin`', (done) => {
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
            .get('/fileSequence2685.ts').reply(() => {
              stream.end();
              return 'whatever';
            });
          let stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
            chunkReadahead: 1,
          });
          concat(stream, (err, body) => {
            assert.ifError(err);
            scope.done();
            assert.equal(body, [
              'apple',
              'banana',
              'cherry',
              'durango',
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
        parser: 'dash-mpd',
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

  describe('With a bad parser', () => {
    it('Throws bad parser error', () => {
      assert.throws(() => {
        m3u8stream('http://media.example.com/playlist.m3u8', {
          parser: 'baaaaad'
        });
      }, /parser '\w+' not supported/);
    });
  });
});
