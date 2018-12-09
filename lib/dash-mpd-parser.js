const Writable  = require('stream').Writable;
const sax       = require('sax');
const parseTime = require('./parse-time');


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
    let currtime = 0;
    let seq = 0;
    let segmentTemplate;
    let timescale, offset, duration, baseURL;
    let timeline = [];
    let getSegments = false;
    let isStatic;
    let treeLevel;
    let periodStart;

    const tmpl = (str) => {
      const context = {
        RepresentationID: targetID,
        Number: seq,
        Time: currtime,
      };
      return str.replace(/\$(\w+)\$/g, (m, p1) => context[p1]);
    };

    this._parser.on('opentag', (node) => {
      switch (node.name) {
        case 'mpd':
          currtime =
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
          periodStart = parseTime.durationStr(node.attributes.start) || 0;
          break;
        case 'segmentlist':
          seq = parseInt(node.attributes.startnumber) || seq;
          timescale = parseInt(node.attributes.timescale) || timescale;
          duration = parseInt(node.attributes.duration) || duration;
          offset = parseInt(node.attributes.presentationtimeoffset) || offset;
          break;
        case 'segmenttemplate':
          segmentTemplate = node.attributes;
          seq = parseInt(node.attributes.startnumber) || seq;
          timescale = parseInt(node.attributes.timescale) || timescale;
          break;
        case 'segmenttimeline':
        case 'baseurl':
          lastTag = node.name;
          break;
        case 's':
          timeline.push([
            parseInt(node.attributes.d),
            parseInt(node.attributes.r)
          ]);
          break;
        case 'adaptationset':
        case 'representation':
          treeLevel++;
          if (targetID == null) {
            targetID = node.attributes.id;
          }
          getSegments = node.attributes.id === targetID + '';
          if (getSegments) {
            if (periodStart) {
              currtime += periodStart;
            }
            if (offset) {
              currtime -= offset / timescale * 1000;
            }
            this.emit('starttime', currtime);
          }
          if (getSegments && segmentTemplate && timeline.length) {
            if (segmentTemplate.initialization) {
              this.emit('item', {
                url: baseURL.filter(s => !!s).join('') +
                  tmpl(segmentTemplate.initialization),
                seq: seq - 1,
                duration: 0,
              });
            }
            for (let [duration, repeat] of timeline) {
              duration = duration / timescale * 1000;
              repeat = repeat || 1;
              for (let i = 0; i < repeat; i++) {
                this.emit('item', {
                  url: baseURL.filter(s => !!s).join('') +
                    tmpl(segmentTemplate.media),
                  seq: seq++,
                  duration,
                });
                currtime += duration;
              }
            }
          }
          break;
        case 'initialization':
          if (getSegments) {
            this.emit('item', {
              url: baseURL.filter(s => !!s).join('') + node.attributes.sourceurl,
              seq: seq++,
              duration: 0,
            });
          }
          break;
        case 'segmenturl':
          if (getSegments) {
            let tl = timeline.shift();
            let segmentDuration = (tl && tl[0] || duration) / timescale * 1000;
            this.emit('item', {
              url: baseURL.filter(s => !!s).join('') + node.attributes.media,
              seq: seq++,
              duration: segmentDuration,
            });
            currtime += segmentDuration;
          }
          break;
      }
    });
    
    const onEnd = () => {
      if (isStatic) { this.emit('endlist'); }
      if (!getSegments) {
        this.emit('error', Error(`Representation '${targetID}' not found`));
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
