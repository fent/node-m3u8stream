const assert = require('assert');
const parseTime = require('../lib/parse-time');


describe('parse-time', () => {
  it('Time format 00:00:00.000', () => {
    assert.equal(parseTime('25.000'), 25000);
    assert.equal(parseTime('05:30'), 60000 * 5 + 30000);
    assert.equal(parseTime('01:05:30'), 60000 * 60 + 60000 * 5 + 30000);
    assert.equal(parseTime('1:30.123'), 60000 + 30000 + 123);
  });

  it('Time format 0ms, 0s, 0m, 0h', () => {
    assert.equal(parseTime('2ms'), 2);
    assert.equal(parseTime('1m'), 60000);
    assert.equal(parseTime('1m10s'), 60000 + 10000);
    assert.equal(parseTime('2hm10s500ms'), 3600000 * 2 + 10000 + 500);
  });

  it('No format', () => {
    assert.equal(parseTime('1000'), 1000);
    assert.equal(parseTime(200), 200);
  });
});
