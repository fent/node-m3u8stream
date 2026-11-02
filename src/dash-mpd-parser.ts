import { Writable } from 'stream';
import sax from 'sax';
import { durationStr } from './parse-time';
import { Parser, Variant, VariantFilter, selectVariant } from './parser';

/**
 * A wrapper around sax that emits segments.
 */
export default class DashMPDParser extends Writable implements Parser {
  private _chunks: Buffer[];
  private _targetFilter?: VariantFilter;

  constructor(targetID?: VariantFilter) {
    super();
    this._chunks = [];
    this._targetFilter = targetID;
  }

  _write(chunk: Buffer, encoding: string, callback: () => void): void {
    this._chunks.push(chunk);
    callback();
  }

  _final(callback: (err?: Error | null) => void): void {
    const xml = Buffer.concat(this._chunks).toString('utf8');
    this._parseMPD(xml, callback);
  }

  private _extractVariants(
    xml: string,
    callback: (err?: Error | null) => void,
  ): { variants: Variant[]; isStatic: boolean } | null {
    const variants: Variant[] = [];
    let currentAdaptation: Record<string, string> = {};
    let isStatic = true;

    const variantParser = sax.parser(false, { lowercase: true });
    variantParser.onerror = (err: Error) => {
      this.destroy(err);
      callback(err);
    };
    variantParser.onopentag = (node) => {
      if (node.name === 'mpd') {
        isStatic = node.attributes.type !== 'dynamic';
      } else if (node.name === 'adaptationset') {
        currentAdaptation = node.attributes as Record<string, string>;
      } else if (node.name === 'representation') {
        const id = node.attributes.id as string;
        if (!variants.some((v) => v.id === id)) {
          const widthStr = node.attributes.width || currentAdaptation.width;
          const heightStr = node.attributes.height || currentAdaptation.height;
          const bwStr =
            node.attributes.bandwidth || currentAdaptation.bandwidth;
          const codecs = (node.attributes.codecs ||
            currentAdaptation.codecs) as string | undefined;
          const frStr = (node.attributes.framerate ||
            node.attributes.maxframerate ||
            currentAdaptation.framerate ||
            currentAdaptation.maxframerate) as string | undefined;

          const width = widthStr ? parseInt(widthStr as string, 10) : undefined;
          const height = heightStr
            ? parseInt(heightStr as string, 10)
            : undefined;
          const bandwidth = bwStr ? parseInt(bwStr as string, 10) : undefined;
          let frameRate: number | undefined;
          if (frStr) {
            if (frStr.includes('/')) {
              const [n, d] = frStr.split('/').map(Number);
              frameRate = n / d;
            } else {
              frameRate = parseFloat(frStr);
            }
          }

          variants.push({
            id,
            index: variants.length,
            bandwidth: isNaN(bandwidth as number) ? undefined : bandwidth,
            width: isNaN(width as number) ? undefined : width,
            height: isNaN(height as number) ? undefined : height,
            resolution:
              width && height && !isNaN(width) && !isNaN(height)
                ? `${width}x${height}`
                : undefined,
            codecs,
            frameRate: isNaN(frameRate as number) ? undefined : frameRate,
          });
        }
      }
    };
    variantParser.onclosetag = (name) => {
      if (name === 'adaptationset') {
        currentAdaptation = {};
      }
    };
    variantParser.write(xml).close();

    if (this.destroyed) {
      return null;
    }

    return { variants, isStatic };
  }

  private _parseMPD(xml: string, callback: (err?: Error | null) => void): void {
    const extracted = this._extractVariants(xml, callback);
    if (!extracted) {
      return;
    }
    const { variants, isStatic } = extracted;

    const chosen = selectVariant(variants, this._targetFilter);
    if (!chosen) {
      if (isStatic) {
        this.emit('endlist');
      }
      const filterDesc =
        typeof this._targetFilter === 'function'
          ? `${this._targetFilter}`
          : this._targetFilter;
      this.destroy(new Error(`Representation '${filterDesc}' not found`));
      callback();
      return;
    }

    const targetID = chosen.id;
    let lastTag: string | null = null;
    let currtime = 0;
    let seq = 0;
    let segmentTemplate: { initialization?: string; media: string } | null =
      null;
    let timescale = 1000;
    let offset = 0;
    let duration = 0;
    let baseURL: string[] = [];
    let timeline: {
      duration: number;
      repeat: number;
      time: number;
    }[] = [];
    let getSegments = false;
    let gotSegments = false;
    let treeLevel = 0;
    let periodStart = 0;

    const tmpl = (str: string): string => {
      const context: { [key: string]: string | number | undefined } = {
        RepresentationID: targetID,
        Number: seq,
        Time: currtime,
      };
      return str.replace(/\$(\w+)\$/g, (m, key) => `${context[key]}`);
    };

    const segmentParser = sax.parser(false, { lowercase: true });
    segmentParser.onopentag = (node) => {
      switch (node.name) {
        case 'mpd':
          currtime = node.attributes.availabilitystarttime
            ? new Date(
                node.attributes.availabilitystarttime as string,
              ).getTime()
            : 0;
          break;
        case 'period':
          // Reset everything on <Period> tag.
          seq = 0;
          timescale = 1000;
          duration = 0;
          offset = 0;
          baseURL = [];
          treeLevel = 0;
          periodStart = durationStr(node.attributes.start as string) || 0;
          break;
        case 'segmentlist':
          seq = parseInt(node.attributes.startnumber as string, 10) || seq;
          timescale =
            parseInt(node.attributes.timescale as string, 10) || timescale;
          duration =
            parseInt(node.attributes.duration as string, 10) || duration;
          offset =
            parseInt(node.attributes.presentationtimeoffset as string, 10) ||
            offset;
          break;
        case 'segmenttemplate':
          segmentTemplate = node.attributes as {
            initialization?: string;
            media: string;
          };
          seq = parseInt(node.attributes.startnumber as string, 10) || seq;
          timescale =
            parseInt(node.attributes.timescale as string, 10) || timescale;
          break;
        case 'segmenttimeline':
        case 'baseurl':
          lastTag = node.name;
          break;
        case 's':
          timeline.push({
            duration: parseInt(node.attributes.d as string, 10),
            repeat: parseInt(node.attributes.r as string, 10),
            time: parseInt(node.attributes.t as string, 10),
          });
          break;
        case 'adaptationset':
          treeLevel++;
          break;
        case 'representation':
          treeLevel++;
          getSegments = node.attributes.id === `${targetID}`;
          if (getSegments) {
            if (periodStart) {
              currtime += periodStart;
            }
            if (offset) {
              currtime -= (offset / timescale) * 1000;
            }
            this.emit('starttime', currtime);
          }
          break;
        case 'initialization':
          if (getSegments) {
            this.emit('item', {
              url:
                baseURL.filter((s) => !!s).join('') + node.attributes.sourceurl,
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
            let segmentDuration =
              ((tl?.duration || duration) / timescale) * 1000;
            this.emit('item', {
              url: baseURL.filter((s) => !!s).join('') + node.attributes.media,
              seq: seq++,
              duration: segmentDuration,
            });
            currtime += segmentDuration;
          }
          break;
      }
    };

    let ended = false;
    const onEnd = (): void => {
      if (ended) return;
      ended = true;
      if (isStatic) {
        this.emit('endlist');
      }
      this.emit('end');
    };

    segmentParser.onclosetag = (tagName) => {
      switch (tagName) {
        case 'adaptationset':
          treeLevel--;
          break;
        case 'representation':
          treeLevel--;
          if (getSegments && segmentTemplate && timeline.length) {
            gotSegments = true;
            if (segmentTemplate.initialization) {
              this.emit('item', {
                url:
                  baseURL.filter((s) => !!s).join('') +
                  tmpl(segmentTemplate.initialization),
                seq: seq,
                init: true,
                duration: 0,
              });
            }
            for (let { duration: itemDuration, repeat, time } of timeline) {
              itemDuration = (itemDuration / timescale) * 1000;
              repeat = repeat || 1;
              currtime = time || currtime;
              for (let i = 0; i < repeat; i++) {
                this.emit('item', {
                  url:
                    baseURL.filter((s) => !!s).join('') +
                    tmpl(segmentTemplate.media),
                  seq: seq++,
                  duration: itemDuration,
                });
                currtime += itemDuration;
              }
            }
          }
          if (getSegments) {
            if (gotSegments) {
              this.emit('endearly');
              onEnd();
              delete (segmentParser as any).onopentag;
              delete (segmentParser as any).onclosetag;
              delete (segmentParser as any).ontext;
            }
            getSegments = false;
          }
          break;
      }
    };

    segmentParser.ontext = (text) => {
      if (lastTag === 'baseurl') {
        baseURL[treeLevel] = text;
        lastTag = null;
      }
    };

    segmentParser.write(xml).close();
    onEnd();
    callback();
  }
}
