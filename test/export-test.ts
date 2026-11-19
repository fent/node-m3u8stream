import assert from 'node:assert';
import m3u8stream, { m3u8stream as namedM3u8Stream } from '..';

describe('Exports', () => {
  it('Exposes function as default and named export', () => {
    assert.strictEqual(m3u8stream, namedM3u8Stream);
    assert.strictEqual(m3u8stream.m3u8stream, m3u8stream);
    assert.strictEqual(m3u8stream.default, m3u8stream);
  });
});
