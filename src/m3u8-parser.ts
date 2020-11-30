import { Writable } from 'stream';
import { Parser } from './parser';


/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 */
export default class m3u8Parser extends Writable implements Parser {
  private _lastLine: string;
  private _seq: number;
  private _nextItemDuration: number | null;
  private _nextItemRange: { start: number; end: number } | null;
  private _lastItemRangeEnd: number;

  constructor() {
    super();
    this._lastLine = '';
    this._seq = 0;
    this._nextItemDuration = null;
    this._nextItemRange = null;
    this._lastItemRangeEnd = 0;
    this.on('finish', () => {
      this._parseLine(this._lastLine);
      this.emit('end');
    });
  }

  private _parseAttrList(value: string) {
    let attrs: { [key: string]: string } = {};
    let regex = /([A-Z0-9-]+)=(?:"([^"]*?)"|([^,]*?))/g;
    let match;
    while ((match = regex.exec(value)) !== null) {
      attrs[match[1]] = match[2] || match[3];
    }
    return attrs;
  }

  private _parseRange(value: string) {
    if (!value) return null;
    let svalue = value.split('@');
    let start = svalue[1] ? parseInt(svalue[1]) : this._lastItemRangeEnd + 1;
    let end = start + parseInt(svalue[0]) - 1;
    let range = { start, end };
    this._lastItemRangeEnd = range.end;
    return range;
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
        case 'EXT-X-MEDIA-SEQUENCE':
          this._seq = parseInt(value);
          break;
        case 'EXT-X-MAP': {
          let attrs = this._parseAttrList(value);
          if (!attrs.URI) {
            this.destroy(
              new Error('`EXT-X-MAP` found without required attribute `URI`'));
            return;
          }
          this.emit('item', {
            url: attrs.URI,
            seq: this._seq,
            init: true,
            duration: 0,
            range: this._parseRange(attrs.BYTERANGE),
          });
          break;
        }
        case 'EXT-X-BYTERANGE': {
          this._nextItemRange = this._parseRange(value);
          break;
        }
        case 'EXTINF':
          this._nextItemDuration =
            Math.round(parseFloat(value.split(',')[0]) * 1000);
          break;
        case 'EXT-X-ENDLIST':
          this.emit('endlist');
          break;
      }
    } else if (!/^#/.test(line) && line.trim()) {
      // This is a segment
      this.emit('item', {
        url: line.trim(),
        seq: this._seq++,
        duration: this._nextItemDuration,
        range: this._nextItemRange,
      });
      this._nextItemRange = null;
    }
  }

  _write(chunk: Buffer, encoding: string, callback: () => void): void {
    let lines: string[] = chunk.toString('utf8').split('\n');
    if (this._lastLine) { lines[0] = this._lastLine + lines[0]; }
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
