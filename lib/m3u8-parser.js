const Writable = require('stream').Writable;
const util     = require('util');


/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 *
 * @extends WritableStream
 * @constructor
 */
var m3u8parser = module.exports = function(ytdlOptions) {
  var lastLine = '';
  var self = this;
  self.ytdlSavedLines = [];
  if (ytdlOptions) {
    self.isYtdlCore = ytdlOptions.isYtdlCore;
    self.isFirstTime = ytdlOptions.firstTime;
  }
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
  function ytdlParse() {
    var time = self.ytdlSavedLines[self.ytdlSavedLines.length - 2];
    if (!time) {
      self.emit('ytdl-error', new Error('Time is null/undefined.\n' + time));
      return;
    }
    time = parseInt(time.replace(/#EXTINF:/g, "").replace(/,/g, ""));
    if (self.isFirstTime) time = 1;
    var line = self.ytdlSavedLines[self.ytdlSavedLines.length-1];
    if (!line) {
      self.emit('ytdl-error', new Error('Line is null/undefined.\n' + time));
      return;
    }
    parseLine(line);
    var timeout = setTimeout(function() {
      self.ytdlSavedLines = [];
      return self.emit('ytdl-end');
      clearTimeout(timeout); // Just in case timeout is still set, we want to make sure it's destroyed.
    }, time * 1000);
  }

  Writable.call(this, {
    decodeStrings: false,
  }),

  this._write = function(chunk, encoding, callback) {
    var lines = chunk.toString('utf8').split('\n');
    if (lastLine) { lines[0] = lastLine + lines[0]; }
    if (this.isYtdlCore) {
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (i < lines.length - 1) {
          self.ytdlSavedLines.push(line);
        } else {
          // Save the last line in case it has been broken up.
          lastLine = line;
        }
      }
    } else {
      lines.forEach(function(line, i) {
        if (i < lines.length - 1) {
          parseLine(line);
        } else {
          // Save the last line in case it has been broken up.
          lastLine = line;
        }
      });
    }
    callback();
  };

  this.on('end', function() {
    if (this.isYtdlCore) {
      ytdlParse();
    }
  });

  this.on('finish', function() {
    parseLine(lastLine);
    self.emit('end');
  });
};

util.inherits(m3u8parser, Writable);
