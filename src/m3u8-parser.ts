import { Writable } from 'stream';
import { Parser, KeyInfo } from './parser';

const X_KEY_METHODS = ['NONE', 'AES-128', 'SAMPLE-AES'];

/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 */
export default class m3u8Parser extends Writable implements Parser {
  private _lastLine: string;
  private _seq: number;
  private _nextItemDuration: number | null;
  private _nextItemRange: { start: number; end: number } | null;
  private _lastItemRangeEnd: number;
  private _expectVariantURI: boolean;
  private _nextVariantAttrs: { [key: string]: string } | null;
  private _variantIndex: number;
  private _currentKey: KeyInfo | null;
  private _unsupportedKey: boolean;
  private _discontinuitySeq: number;
  private _hasDiscontinuity: boolean;
  private _nextItemDiscontinuity: boolean;

  constructor() {
    super();
    this._lastLine = '';
    this._seq = 0;
    this._nextItemDuration = null;
    this._nextItemRange = null;
    this._lastItemRangeEnd = 0;
    this._expectVariantURI = false;
    this._nextVariantAttrs = null;
    this._variantIndex = 0;
    this._currentKey = null;
    this._unsupportedKey = false;
    this._discontinuitySeq = 0;
    this._hasDiscontinuity = false;
    this._nextItemDiscontinuity = false;
    this.on('finish', () => {
      this._parseLine(this._lastLine);
      this.emit('end');
    });
  }

  private _parseAttrList(value: string) {
    let attrs: { [key: string]: string } = {};
    let quoted: { [key: string]: boolean } = {};
    let i = 0;
    const len = value.length;
    while (i < len) {
      while (i < len && (value[i] === ',' || value[i] === ' ')) {
        i++;
      }
      const keyStart = i;
      while (i < len && /[A-Z0-9-]/.test(value[i])) {
        i++;
      }
      if (i === keyStart || value[i] !== '=') {
        const nextComma = value.indexOf(',', i);
        if (nextComma === -1) break;
        i = nextComma + 1;
        continue;
      }
      const key = value.slice(keyStart, i);
      i++;
      if (value[i] === '"') {
        i++;
        const valEnd = value.indexOf('"', i);
        if (valEnd === -1) break;
        attrs[key] = value.slice(i, valEnd);
        quoted[key] = true;
        i = valEnd + 1;
      } else {
        const comma = value.indexOf(',', i);
        const valEnd = comma === -1 ? len : comma;
        attrs[key] = value.slice(i, valEnd);
        quoted[key] = false;
        i = valEnd + 1;
      }
    }
    return { attrs, quoted };
  }

  private _parseRange(value: string, updateLastItemRangeEnd = true) {
    if (!value) return null;
    let svalue = value.split('@');
    let start = svalue[1] ? parseInt(svalue[1]) : this._lastItemRangeEnd + 1;
    let end = start + parseInt(svalue[0]) - 1;
    let range = { start, end };
    if (updateLastItemRangeEnd) {
      this._lastItemRangeEnd = range.end;
    }
    return range;
  }

  private _canUseKey(): boolean {
    if (!this._currentKey && this._unsupportedKey) {
      this.destroy(new Error('`EXT-X-KEY` uses an unsupported `KEYFORMAT`'));
      return false;
    }
    return true;
  }

  _parseLine(line: string): void {
    let match = line.match(/^#(EXT[A-Z0-9-]+)(?::(.*))?/);
    if (match) {
      // This is a tag.
      const tag = match[1];
      const value = match[2] || '';
      switch (tag) {
        case 'EXT-X-PROGRAM-DATE-TIME':
          this.emit('starttime', new Date(value).getTime());
          break;
        case 'EXT-X-DISCONTINUITY-SEQUENCE':
          this._discontinuitySeq = parseInt(value, 10);
          this._hasDiscontinuity = true;
          break;
        case 'EXT-X-DISCONTINUITY':
          this._discontinuitySeq++;
          this._hasDiscontinuity = true;
          this._nextItemDiscontinuity = true;
          this.emit('discontinuity', this._discontinuitySeq);
          break;
        case 'EXT-X-MEDIA-SEQUENCE':
          this._seq = parseInt(value);
          break;
        case 'EXT-X-TARGETDURATION':
          this.emit('targetduration', parseFloat(value) * 1000);
          break;
        case 'EXT-X-KEY': {
          let { attrs, quoted } = this._parseAttrList(value);
          if (!attrs.METHOD) {
            this.destroy(
              new Error(
                '`EXT-X-KEY` found without required attribute `METHOD`',
              ),
            );
            return;
          }
          if (!X_KEY_METHODS.includes(attrs.METHOD)) {
            this.destroy(
              new Error('`EXT-X-KEY` found with invalid `METHOD` value'),
            );
            return;
          }
          if (attrs.METHOD !== 'NONE') {
            if (!attrs.URI) {
              this.destroy(
                new Error('`EXT-X-KEY` found without required attribute `URI`'),
              );
              return;
            }
            if (!quoted.URI) {
              this.destroy(
                new Error('`EXT-X-KEY` attribute `URI` must be quoted'),
              );
              return;
            }
            if ('KEYFORMAT' in attrs && !quoted.KEYFORMAT) {
              this.destroy(
                new Error('`EXT-X-KEY` attribute `KEYFORMAT` must be quoted'),
              );
              return;
            }
            if ('KEYFORMATVERSIONS' in attrs && !quoted.KEYFORMATVERSIONS) {
              this.destroy(
                new Error(
                  '`EXT-X-KEY` attribute `KEYFORMATVERSIONS` must be quoted',
                ),
              );
              return;
            }
          }
          if (attrs.IV && !/^0x[0-9a-f]{1,32}$/i.test(attrs.IV)) {
            this.destroy(
              new Error('`EXT-X-KEY` found with invalid `IV` attribute format'),
            );
            return;
          }
          if (attrs.METHOD === 'NONE') {
            if (Object.keys(attrs).length > 1) {
              this.destroy(
                new Error(
                  '`EXT-X-KEY` with `METHOD=NONE` must not contain other attributes',
                ),
              );
              return;
            }
            this._currentKey = null;
            this._unsupportedKey = false;
            break;
          }
          attrs.KEYFORMAT = attrs.KEYFORMAT ?? 'identity';
          if ('KEYFORMATVERSIONS' in attrs) {
            if (!/^[1-9]\d*(?:\/[1-9]\d*)*$/.test(attrs.KEYFORMATVERSIONS)) {
              this.destroy(
                new Error(
                  '`EXT-X-KEY` found with invalid `KEYFORMATVERSIONS` attribute format',
                ),
              );
              return;
            }
          }
          if (attrs.KEYFORMAT !== 'identity') {
            this._unsupportedKey = true;
            break;
          }
          if ('KEYFORMATVERSIONS' in attrs && attrs.KEYFORMATVERSIONS !== '1') {
            this.destroy(
              new Error(
                '`EXT-X-KEY` with `KEYFORMAT="identity"` requires `KEYFORMATVERSIONS="1"`',
              ),
            );
            return;
          }
          this._unsupportedKey = false;
          this._currentKey = {
            method: attrs.METHOD as 'AES-128' | 'SAMPLE-AES',
            uri: attrs.URI,
            iv: attrs.IV,
            keyformat: attrs.KEYFORMAT,
            ...(attrs.KEYFORMATVERSIONS
              ? { keyformatversions: attrs.KEYFORMATVERSIONS }
              : {}),
          };
          break;
        }
        case 'EXT-X-MAP': {
          let attrs = this._parseAttrList(value).attrs;
          if (!attrs.URI) {
            this.destroy(
              new Error('`EXT-X-MAP` found without required attribute `URI`'),
            );
            return;
          }
          if (this._currentKey && !this._currentKey.iv) {
            this.destroy(
              new Error(
                '`EXT-X-KEY` applying to `EXT-X-MAP` requires an explicit `IV` attribute',
              ),
            );
            return;
          }
          if (!this._canUseKey()) {
            return;
          }
          this.emit('item', {
            url: attrs.URI,
            seq: this._seq,
            init: true,
            duration: 0,
            range: this._parseRange(attrs.BYTERANGE, false) ?? undefined,
            key: this._currentKey ?? undefined,
          });
          break;
        }
        case 'EXT-X-BYTERANGE': {
          this._nextItemRange = this._parseRange(value);
          break;
        }
        case 'EXTINF': {
          const parsed = parseFloat(value.split(',')[0]);
          this._nextItemDuration = isNaN(parsed)
            ? 0
            : Math.round(parsed * 1000);
          break;
        }
        case 'EXT-X-ENDLIST':
          this.emit('endlist');
          break;
        case 'EXT-X-STREAM-INF':
          this._nextVariantAttrs = this._parseAttrList(value).attrs;
          this._expectVariantURI = true;
          break;
        case 'EXT-X-MEDIA': {
          let { attrs, quoted } = this._parseAttrList(value);
          const type = attrs.TYPE;
          if (
            !type ||
            !['AUDIO', 'VIDEO', 'SUBTITLES', 'CLOSED-CAPTIONS'].includes(type)
          ) {
            this.destroy(
              new Error(
                '`EXT-X-MEDIA` found without a valid required `TYPE` attribute',
              ),
            );
            return;
          }
          if (!attrs['GROUP-ID'] || !attrs.NAME) {
            this.destroy(
              new Error(
                '`EXT-X-MEDIA` requires `GROUP-ID` and `NAME` attributes',
              ),
            );
            return;
          }
          for (const name of ['GROUP-ID', 'NAME']) {
            if (!quoted[name]) {
              this.destroy(
                new Error(
                  `\`EXT-X-MEDIA\` attribute \`${name}\` must be quoted`,
                ),
              );
              return;
            }
          }
          if (type === 'CLOSED-CAPTIONS') {
            if (attrs.URI) {
              this.destroy(
                new Error(
                  '`EXT-X-MEDIA` with `TYPE=CLOSED-CAPTIONS` must not have a `URI` attribute',
                ),
              );
              return;
            }
          } else if (!attrs.URI) {
            this.destroy(
              new Error('`EXT-X-MEDIA` found without required `URI` attribute'),
            );
            return;
          }
          if (attrs.URI && !quoted.URI) {
            this.destroy(
              new Error('`EXT-X-MEDIA` attribute `URI` must be quoted'),
            );
            return;
          }
          this.emit('media', {
            type: type as 'AUDIO' | 'VIDEO' | 'SUBTITLES' | 'CLOSED-CAPTIONS',
            groupId: attrs['GROUP-ID'],
            name: attrs.NAME,
            uri: attrs.URI,
            language: attrs.LANGUAGE,
            ...(attrs.DEFAULT === 'YES' ? { default: true } : {}),
            ...(attrs.AUTOSELECT === 'YES' ? { autoselect: true } : {}),
            ...(attrs.FORCED === 'YES' ? { forced: true } : {}),
            channels: attrs.CHANNELS,
            characteristics: attrs.CHARACTERISTICS,
          });
          break;
        }
      }
    } else if (!/^#/.test(line) && line.trim()) {
      if (this._expectVariantURI) {
        // This is a variant stream of a master playlist.
        const attrs = this._nextVariantAttrs as { [key: string]: string };
        const bandwidth = attrs.BANDWIDTH
          ? parseInt(attrs.BANDWIDTH, 10)
          : undefined;
        let width: number | undefined;
        let height: number | undefined;
        const resolution = attrs.RESOLUTION;
        if (resolution) {
          const [w, h] = resolution.split(/x/i).map((n) => parseInt(n, 10));
          width = w;
          height = h;
        }
        const frameRate = attrs['FRAME-RATE']
          ? parseFloat(attrs['FRAME-RATE'])
          : undefined;
        this.emit('variant', {
          url: line.trim(),
          index: this._variantIndex++,
          bandwidth,
          resolution,
          width,
          height,
          codecs: attrs.CODECS,
          frameRate,
          audio: attrs.AUDIO,
          video: attrs.VIDEO,
          subtitles: attrs.SUBTITLES,
          closedCaptions: attrs['CLOSED-CAPTIONS'],
        });
        this._expectVariantURI = false;
        this._nextVariantAttrs = null;
        return;
      }
      // This is a segment
      if (!this._canUseKey()) {
        return;
      }
      this.emit('item', {
        url: line.trim(),
        seq: this._seq++,
        duration: this._nextItemDuration || 0,
        range: this._nextItemRange ?? undefined,
        key: this._currentKey ?? undefined,
        ...(this._nextItemDiscontinuity ? { discontinuity: true } : {}),
        ...(this._hasDiscontinuity
          ? { discontinuitySequence: this._discontinuitySeq }
          : {}),
      });
      this._nextItemDuration = null;
      this._nextItemRange = null;
      this._nextItemDiscontinuity = false;
    }
  }

  _write(chunk: Buffer, encoding: string, callback: () => void): void {
    let lines: string[] = chunk.toString('utf8').split('\n');
    if (this._lastLine) {
      lines[0] = this._lastLine + lines[0];
    }
    lines.forEach((line: string, i: number) => {
      if (this.destroyed) return;
      if (i < lines.length - 1) {
        this._parseLine(line);
      } else {
        // Save the last line in case it has been broken up.
        this._lastLine = line;
      }
    });
    callback();
  }
}
