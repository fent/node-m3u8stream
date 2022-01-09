import { Writable } from 'stream';
import sax from 'sax';
import { durationStr } from './parse-time';
import { Parser } from './parser';


/**
 * A wrapper around sax that emits segments.
 */
export default class DashMPDParser extends Writable implements Parser {
  private _parser: Writable;

  constructor(targetID?: string) {
    super();
    this._parser = sax.createStream(false, { lowercase: true });
    this._parser.on('error', this.destroy.bind(this));

    let lastTag: string | null;
    let currtime = 0;
    let seq = 0;
    let segmentTemplate: { initialization?: string; media: string };
    let timescale: number, offset: number, duration: number, baseURL: string[];
    let timeline: {
      duration: number;
      repeat: number;
      time: number;
    }[] = [];
    let getSegments = false;
    let gotSegments = false;
    let isStatic: boolean;
    let treeLevel: number;
    let periodStart: number;

    const tmpl = (str: string): string => {
      const context: { [key: string]: string | number | undefined } = {
        RepresentationID: targetID,
        Number: seq,
        Time: currtime,
      };
      return str.replace(/\$(\w+)\$/g, (m, p1) => `${context[p1]}`);
    };

    this._parser.on('opentag', node => {
      switch (node.name) {
        case 'mpd':
          currtime =
            node.attributes.availabilitystarttime ?
              new Date(node.attributes.availabilitystarttime).getTime() : 0;
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
          periodStart = durationStr(node.attributes.start) || 0;
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
          timeline.push({
            duration: parseInt(node.attributes.d),
            repeat: parseInt(node.attributes.r),
            time: parseInt(node.attributes.t),
          });
          break;
        case 'adaptationset':
        case 'representation':
          treeLevel++;
          if (!targetID) {
            targetID = node.attributes.id;
          }
          getSegments = node.attributes.id === `${targetID}`;
          if (getSegments) {
            if (periodStart) {
              currtime += periodStart;
            }
            if (offset) {
              currtime -= offset / timescale * 1000;
            }
            this.emit('starttime', currtime);
          }
          break;
        case 'initialization':
          if (getSegments) {
            this.emit('item', {
              url: baseURL.filter(s => !!s).join('') + node.attributes.sourceurl,
              seq: seq,
              init: true,
              duration: 0,
            });
          }
          break;
        case 'segmenturl':
          if (getSegments) {
            gotSegments = true;
            let tl = timeline.shift();
            let segmentDuration = (tl?.duration || duration) / timescale * 1000;
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

    const onEnd = (): void => {
      if (isStatic) { this.emit('endlist'); }
      if (!getSegments) {
        this.destroy(Error(`Representation '${targetID}' not found`));
      } else {
        this.emit('end');
      }
    };

    this._parser.on('closetag', tagName => {
      switch (tagName) {
        case 'adaptationset':
        case 'representation':
          treeLevel--;
          if (segmentTemplate && timeline.length) {
            gotSegments = true;
            if (segmentTemplate.initialization) {
              this.emit('item', {
                url: baseURL.filter(s => !!s).join('') +
                tmpl(segmentTemplate.initialization),
                seq: seq,
                init: true,
                duration: 0,
              });
            }
            for (let { duration: itemDuration, repeat, time } of timeline) {
              itemDuration = itemDuration / timescale * 1000;
              repeat = repeat || 1;
              currtime = time || currtime;
              for (let i = 0; i < repeat; i++) {
                this.emit('item', {
                  url: baseURL.filter(s => !!s).join('') +
                  tmpl(segmentTemplate.media),
                  seq: seq++,
                  duration: itemDuration,
                });
                currtime += itemDuration;
              }
            }
          }
          if (gotSegments) {
            this.emit('endearly');
            onEnd();
            this._parser.removeAllListeners();
            this.removeAllListeners('finish');
          }
          break;
      }
    });

    this._parser.on('text', text => {
      if (lastTag === 'baseurl') {
        baseURL[treeLevel] = text;
        lastTag = null;
      }
    });

    this.on('finish', onEnd);
  }

  _write(chunk: Buffer, encoding: string, callback: () => void): void {
    this._parser.write(chunk);
    callback();
  }
}
