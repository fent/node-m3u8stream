'use strict';

const Writable = require('stream').Writable;


/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 *
 * @extends WritableStream
 * @constructor
 */
module.exports = class m3u8parser extends Writable {
  constructor(options) {
    super({ decodeStrings: false });
    this.options = options;
    this._firstLines = [];
    this.first = true;
    this._lastLine = '';
    this.on('finish', () => {
      this._parseLine(this._lastLine);
      this.emit('end');
    });
  }

  _parseLine(line) {
    var tag = line.match(/^#(EXT[A-Z0-9-]+)(?::(.*))?/);
    if (tag) {
      // This is a tag.
      this.emit('tag', tag[1], tag[2] || null);

    } else if (!/^#/.test(line) && line.trim()) {
      // This is a segment
      this.emit('item', line.trim());
    }
  }

  _write(chunk, encoding, callback) {
    var lines = chunk.toString('utf8').split('\n');
    if (this._lastLine) { lines[0] = this._lastLine + lines[0]; }
    if (!this.options.youtubeFormatting) {
      lines.forEach((line, i) => {
        if (i < lines.length - 1) {
          this._parseLine(line);
        } else {
          // Save the last line in case it has been broken up.
          this._lastLine = line;
        }
      });
    } else {
      this._lastLine = lines[lines.length - 2];
    }
    if (this.first) {
      this._firstLines = lines;
      this.first = false;
    }
    callback();
  }

  _final(callback) {
    if (this.options.youtubeFormatting) {
      const firstIndex = this._firstLines.findIndex(a => a.includes('#EXTINF'));
      for (let i = 0; i < firstIndex.length - 1; i++) {
        this._parseLine(this._firstLines[i]);
      }
      this._parseLine(this._lastLine);
    }
    console.log('end');
    callback();
  }
};
