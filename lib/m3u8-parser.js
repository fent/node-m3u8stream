const Writable = require('stream').Writable;
const util     = require('util');


/**
 * A very simple m3u8 playlist file parser that detects tags and segments.
 *
 * @extends WritableStream
 * @constructor
 */
var m3u8parser = module.exports = function(req) {
  var lastLine = '';
  var self = this;
  this.savedLines = [];
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
  this.parseLines = function() {
    console.log("Parsing Lines...");
    let lengthToWait = this.savedLines[this.savedLines.length-2];
    if (!lengthToWait) {
      console.log(this.savedLines);
      console.log(`LTW: Undefined`);
      console.log(lengthToWait);
      self.emit('ytdl-end');
      return;
    }
    lengthToWait = parseInt(lengthToWait.replace(/#EXTINF:/g, "").replace(/,/g, ""));
    var line = this.savedLines[this.savedLines.length-1];
    console.log(lengthToWait);
    console.log(line);
    // lines.shift();
    // var line = lines[lines.length-1];
    parseLine(line);
    setTimeout(() => {
      this.savedLines = [];
      self.emit('ytdl-end');
    }, lengthToWait*1000);
  }

  Writable.call(this, {
    decodeStrings: false,
  }),

  this._write = function(chunk, encoding, callback) {
    var lines = chunk.toString('utf8').split('\n');
    if (lastLine) { lines[0] = lastLine + lines[0]; }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (i < lines.length - 1) {
        this.savedLines.push(line);
      } else {
        // Save the last line in case it has been broken up.
        lastLine = line;
      }
    }
    callback();
  };

  this.on('end', function() {
    this.parseLines();
  });

  this.on('finish', function() {
    parseLine(lastLine);
    self.emit('end');
  });
};

util.inherits(m3u8parser, Writable);
