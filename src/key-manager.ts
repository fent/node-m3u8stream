import crypto from 'crypto';
import miniget from 'miniget';
import { KeyInfo } from './parser';

interface CachedKey {
  buffer: Buffer;
  expiresAt: number;
}

const getKeyExpiration = (headers: {
  'cache-control'?: string;
  expires?: string;
}): number => {
  const cc = headers['cache-control'];
  if (cc) {
    if (/no-cache|no-store/.test(cc)) {
      return 0;
    }
    const match = cc.match(/max-age=(\d+)/);
    if (match) {
      const maxAge = parseInt(match[1], 10);
      return maxAge > 0 ? Date.now() + maxAge * 1000 : 0;
    }
  }
  if (headers.expires) {
    const expiresTime = Date.parse(headers.expires);
    if (!isNaN(expiresTime) && expiresTime > Date.now()) {
      return expiresTime;
    }
  }
  return 0;
};

const createSegmentDecipher = (
  keyBuffer: Buffer,
  ivHex: string | undefined,
  seq: number,
): crypto.Decipher => {
  let iv: Buffer;
  if (ivHex) {
    iv = Buffer.from(ivHex.slice(2).padStart(32, '0'), 'hex');
  } else {
    iv = Buffer.alloc(16);
    iv.writeBigUInt64BE(BigInt(seq), 8);
  }
  return crypto.createDecipheriv('aes-128-cbc', keyBuffer, iv);
};

export default class KeyManager {
  private _keyCache = new Map<string, CachedKey>();
  private _inflightKeys = new Map<string, Promise<Buffer>>();
  private _requests = new Map<miniget.Stream, (err: Error) => void>();
  private _requestOptions?: miniget.Options;
  private _forwardEvents?: (req: miniget.Stream) => void;

  constructor(
    requestOptions?: miniget.Options,
    forwardEvents?: (req: miniget.Stream) => void,
  ) {
    this._requestOptions = requestOptions;
    this._forwardEvents = forwardEvents;
  }

  getKey(keyUrl: string): Promise<Buffer> {
    const cached = this._keyCache.get(keyUrl);
    if (cached) {
      if (Date.now() < cached.expiresAt) {
        return Promise.resolve(cached.buffer);
      }
      this._keyCache.delete(keyUrl);
    }
    const inflight = this._inflightKeys.get(keyUrl);
    if (inflight) {
      return inflight;
    }
    let keyReq: miniget.Stream | undefined;
    const promise = new Promise<Buffer>((resolve, reject) => {
      keyReq = miniget(keyUrl, this._requestOptions);
      this._requests.set(keyReq, reject);
      if (this._forwardEvents) {
        this._forwardEvents(keyReq);
      }
      let expiresAt = 0;
      keyReq.on('response', (res: any) => {
        expiresAt = getKeyExpiration(res.headers);
      });
      let chunks: Buffer[] = [];
      keyReq.on('data', (chunk: Buffer) => chunks.push(chunk));
      keyReq.on('end', () => {
        const keyBuffer = Buffer.concat(chunks);
        if (keyBuffer.length !== 16) {
          reject(
            new Error(
              `Invalid key length: expected 16 octets, got ${keyBuffer.length}`,
            ),
          );
          return;
        }
        if (expiresAt > Date.now()) {
          this._keyCache.set(keyUrl, { buffer: keyBuffer, expiresAt });
        }
        resolve(keyBuffer);
      });
      keyReq.on('error', reject);
    }).finally(() => {
      this._inflightKeys.delete(keyUrl);
      if (keyReq) {
        this._requests.delete(keyReq);
      }
    });

    this._inflightKeys.set(keyUrl, promise);
    return promise;
  }

  async getDecipher(
    key: KeyInfo | null | undefined,
    playlistURL: string,
    seq: number,
  ): Promise<crypto.Decipher | null> {
    if (!key) {
      return null;
    }
    if (key.method === 'SAMPLE-AES') {
      throw Error('`SAMPLE-AES` encryption is not supported');
    }
    const keyUrl = new URL(key.uri as string, playlistURL).toString();
    const keyBuffer = await this.getKey(keyUrl);
    return createSegmentDecipher(keyBuffer, key.iv, seq);
  }

  clear(): void {
    for (const [request, reject] of this._requests) {
      request.destroy();
      reject(new Error('Key request cancelled'));
    }
    this._requests.clear();
    this._keyCache.clear();
    this._inflightKeys.clear();
  }
}
