import assert from 'assert';
import nock from 'nock';
import KeyManager from '../dist/key-manager';

nock.disableNetConnect();

describe('KeyManager', () => {
  it('Aborts in-flight key requests when cleared', async () => {
    const scope = nock('https://media.example.com')
      .get('/key.php')
      .delay(100)
      .reply(200, Buffer.alloc(16));

    const keyManager = new KeyManager();
    const pending = keyManager.getKey('https://media.example.com/key.php');
    await new Promise((resolve) => setTimeout(resolve, 25));
    keyManager.clear();

    await assert.rejects(pending, /Key request cancelled/);
    scope.done();
  });
});
