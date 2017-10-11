const m3u8stream = require('..');
const path       = require('path');
const assert     = require('assert');
const nock       = require('nock');
const sinon      = require('sinon');


function concat(stream, callback) {
  var body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => { body += chunk; });
  stream.on('error', callback);
  stream.on('end', () => { callback(null, body); });
}

describe('m3u8stream', () => {
  before(() => { nock.disableNetConnect(); });
  after(() => { nock.enableNetConnect(); });

  describe('Simple media playlist', () => {
    it('Concatenates segments into stream', (done) => {
      var scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname, 'playlists/simple.m3u8'))
        .get('/first.ts').reply(200, 'one')
        .get('/second.ts').reply(200, 'two')
        .get('/third.ts').reply(200, 'three');
      var stream = m3u8stream('http://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });

    it('Concatenates relative segments into stream', (done) => {
      var scope = nock('http://media.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200,
          path.resolve(__dirname, 'playlists/simple_relative.m3u8'))
        .get('/first.ts').reply(200, 'one')
        .get('/second.ts').reply(200, 'two')
        .get('/third.ts').reply(200, 'three');
      var stream = m3u8stream('http://media.example.com/playlist.m3u8');
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothree');
        done();
      });
    });
  });

  describe('Live media playlist', () => {
    var clock;
    before(() => { clock = sinon.useFakeTimers(); });
    after(() => { clock.restore(); });

    it('Refreshes after some time', (done) => {
      var scope = nock('https://priv.example.com')
        .get('/playlist.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts').reply(200, 'one')
        .get('/fileSequence2682.ts').reply(() => {
          process.nextTick(passSomeTime);
          return 'two';
        });

      function passSomeTime() {
        scope.get('/playlist.m3u8')
          .replyWithFile(200, path.resolve(__dirname,
            'playlists/live-1.2.m3u8'))
          .get('/fileSequence2683.ts').reply(200, 'three')
          .get('/fileSequence2684.ts').reply(200, 'four')
          .get('/fileSequence2685.ts').reply(200, 'five');
        clock.tick(1000 * 10);
      }

      var stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
        chunkReadahead: 1,
        refreshInterval: 1000 * 10,
      });
      concat(stream, (err, body) => {
        assert.ifError(err);
        scope.done();
        assert.equal(body, 'onetwothreefourfive');
        done();
      });
    });

    it('Refresh after nearing end of segment list', (done) => {
      var scope = nock('https://priv.example.com')
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

      var stream = m3u8stream('https://priv.example.com/playlist.m3u8');
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
      var scope = nock('http://mysite.com')
        .get('/pl.m3u8')
        .replyWithError('Nooo');
      var stream = m3u8stream('http://mysite.com/pl.m3u8');
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
      var scope = nock('https://priv.example.com')
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

      var stream = m3u8stream('https://priv.example.com/playlist.m3u8');
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
      var scope = nock('https://priv.example.com')
        .get('/playme.m3u8')
        .replyWithFile(200, path.resolve(__dirname,
          'playlists/live-1.1.m3u8'))
        .get('/fileSequence2681.ts').reply(200, 'hello')
        .get('/fileSequence2682.ts').replyWithError('bad segment');
      var stream = m3u8stream('https://priv.example.com/playme.m3u8', {
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

    describe('Destroy stream', () => {
      describe('Right away', () => {
        it('Ends stream right away with no data', (done) => {
          var stream = m3u8stream('https://whatever.com/playlist.m3u8');
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
          var scope = nock('https://priv.example.com')
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
          var stream = m3u8stream('https://priv.example.com/playlist.m3u8', {
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
});
