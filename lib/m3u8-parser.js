const Writable = require('stream').Writable;
const util     = require('util');


/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 *
 * @extends WritableStream
 * @constructor
 */
var m3u8parser = module.exports = function() {
  var lastLine = '';
  var self = this;
  function parseLine(line) {
    var tag = line.match(/^#(EXT[A-Z0-9\-]+)(?::(.*))?/);
    if (tag) {
      // This is a tag.
      self.emit('tag', tag[1], tag[2] || null);

    } else if (!/^#/.test(line) && line.trim()) {
      // This is a segment
      self.emit('item', line.trim());
    }
  }

  Writable.call(this, {
    decodeStrings: false,
  }),

  this._write = function(chunk, encoding, callback) {
    var lines = chunk.toString('utf8').split('\n');
    if (lastLine) { lines[0] = lastLine + lines[0]; }
    lines.forEach(function(line, i) {
      if (i < lines.length - 1) {
        parseLine(line);
      } else {
        // Save the last line in case it has been broken up.
        lastLine = line;
      }
    });
    callback();
  };

  this.on('finish', function() {
    parseLine(lastLine);
    self.emit('end');
  });
};

util.inherits(m3u8parser, Writable);
