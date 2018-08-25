const Writable = require('stream').Writable;
const sax      = require('sax');


/**
 * A wrapper around sax that emits segments.
 *
 * @extends WRitableStream
 * @constructor
 */
module.exports = class DashMPDParser extends Writable {
  constructor(targetID) {
    super();
    this._parser = sax.createStream(false, { lowercasetags: true });
    this._parser.on('error', this.emit.bind(this, 'error'));

    let lastTag;
    let starttime = 0;
    let seq = 0;
    let timescale, offset, duration, baseURL;
    let timeline = [];
    let getSegments = false, startEmitted = false;
    let isStatic;
    let treeLevel;

    this._parser.on('opentag', (node) => {
      switch (node.name) {
        case 'mpd':
          starttime =
            new Date(node.attributes.availabilitystarttime).getTime();
          isStatic = node.attributes.type !== 'dynamic';
          break;
        case 'period':
          // Reset everything on <Period> tag.
          seq = 0;
          timescale = 1000;
          duration = 0;
          offset = 0;
          baseURL = [];
          treeLevel = 0;
          break;
        case 'segmentlist':
          seq = parseInt(node.attributes.startnumber, 10) || seq;
          timescale = parseInt(node.attributes.timescale, 10) || timescale;
          duration = parseInt(node.attributes.duration, 10) || duration;
          offset = parseInt(node.attributes.presentationtimeoffset, 10) || offset;
          if (!startEmitted) {
            startEmitted = true;
            if (offset) {
              starttime += offset;
            }
            this.emit('starttime', starttime);
          }
          break;
        case 'segmenttimeline':
        case 'baseurl':
          lastTag = node.name;
          break;
        case 's':
          timeline.push(parseInt(node.attributes.d, 10));
          break;
        case 'adaptationset':
        case 'representation':
          treeLevel++;
          if (targetID == null) {
            targetID = node.attributes.id;
          }
          getSegments = node.attributes.id === targetID + '';
          break;
        case 'segmenturl':
          if (getSegments) {
            let tl = timeline.shift();
            let segmentDuration = (tl || duration) / timescale * 1000;
            this.emit('item', {
              url: baseURL.filter(s => !!s).join('') + node.attributes.media,
              seq: seq++,
              duration: segmentDuration,
            });
          }
          break;
      }
    });
    
    const onEnd = () => {
      if (isStatic) { this.emit('endlist'); }
      if (!getSegments) {
        this.emit('error', new Error(`Representation '${targetID}' not found`));
      }
      this.emit('end');
    };

    this._parser.on('closetag', (tagName) => {
      switch (tagName) {
        case 'adaptationset':
        case 'representation':
          treeLevel--;
          break;
        case 'segmentlist':
          if (getSegments) {
            this.emit('endearly');
            onEnd();
            this._parser.removeAllListeners();
          }
          break;
      }
    });

    this._parser.on('text', (text) => {
      if (lastTag === 'baseurl') {
        baseURL[treeLevel] = text;
        lastTag = null;
      }
    });

    this.on('finish', onEnd);
  }

  _write(chunk, encoding, callback) {
    this._parser.write(chunk, encoding);
    callback();
  }
};
