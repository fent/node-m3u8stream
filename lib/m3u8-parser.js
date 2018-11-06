const Writable = require('stream').Writable;


/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 *
 * @extends WritableStream
 * @constructor
 */
module.exports = class m3u8Parser extends Writable {
  constructor() {
    super();
    this._lastLine = '';
    this._seq = 0;
    this._nextItemDuration = null;
    this.on('finish', () => {
      this._parseLine(this._lastLine);
      this.emit('end');
    });
  }

  _parseLine(line) {
    let match = line.match(/^#(EXT[A-Z0-9-]+)(?::(.*))?/);
    if (match) {
      // This is a tag.
      const tag = match[1];
      const value = match[2] || null;
      switch (tag) {
        case 'EXT-X-PROGRAM-DATE-TIME':
          this.emit('starttime', new Date(value).getTime());
          break;
        case 'EXT-X-MEDIA-SEQUENCE':
          this._seq = parseInt(value);
          break;
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
      });
    }
  }

  _write(chunk, encoding, callback) {
    let lines = chunk.toString('utf8').split('\n');
    if (this._lastLine) { lines[0] = this._lastLine + lines[0]; }
    lines.forEach((line, i) => {
      if (i < lines.length - 1) {
        this._parseLine(line);
      } else {
        // Save the last line in case it has been broken up.
        this._lastLine = line;
      }
    });
    callback();
  }
};
