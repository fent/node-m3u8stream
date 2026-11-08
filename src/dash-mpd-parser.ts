import { Writable } from 'stream';
import sax from 'sax';
import { durationStr } from './parse-time';
import { Parser, Variant, VariantFilter, selectVariant } from './parser';

const isAbsolute = (url: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);

const resolveURI = (bases: string[], target: string): string => {
  const parts = [...bases.filter((s) => !!s), target];

  let lastAbsIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (isAbsolute(parts[i])) {
      lastAbsIdx = i;
    }
  }

  if (lastAbsIdx !== -1) {
    let current = parts[lastAbsIdx];
    for (let i = lastAbsIdx + 1; i < parts.length; i++) {
      current = new URL(parts[i], current).href;
    }
    return current;
  }

  let result: string[] = [];
  for (const part of parts) {
    if (part.startsWith('/')) {
      result = [part];
    } else {
      result.push(part);
    }
  }
  return result.join('');
};

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
    let periodDuration = 0;
    let mpdDuration = 0;

    const tmpl = (str: string, time?: number): string => {
      const context: { [key: string]: string | number | undefined } = {
        RepresentationID: targetID,
        Bandwidth: chosen.bandwidth,
        Number: seq,
        Time: time,
      };
      return str.replace(/\$(?:(\w+)(?:%0(\d+)d)?)?\$/g, (m, key, width) => {
        if (!key) {
          return '$';
        }
        const val = `${context[key]}`;
        return width ? val.padStart(parseInt(width, 10), '0') : val;
      });
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
          mpdDuration = durationStr(
            node.attributes.mediapresentationduration as string,
          );
          if (node.attributes.minimumupdateperiod) {
            this.emit(
              'targetduration',
              durationStr(node.attributes.minimumupdateperiod as string),
            );
          }
          break;
        case 'period':
          // Reset everything on <Period> tag.
          seq = 0;
          timescale = 1000;
          duration = 0;
          offset = 0;
          treeLevel = 1;
          baseURL.length = 1;
          periodStart = durationStr(node.attributes.start as string) || 0;
          periodDuration =
            durationStr(node.attributes.duration as string) || mpdDuration;
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
          duration =
            parseInt(node.attributes.duration as string, 10) || duration;
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
          baseURL.length = treeLevel;
          break;
        case 'representation':
          treeLevel++;
          baseURL.length = treeLevel;
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
              url: resolveURI(baseURL, node.attributes.sourceurl as string),
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
              url: resolveURI(baseURL, node.attributes.media as string),
              seq: seq++,
              duration: segmentDuration,
            });
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
        case 'period':
          baseURL.length = treeLevel;
          treeLevel--;
          break;
        case 'adaptationset':
          baseURL.length = treeLevel;
          treeLevel--;
          break;
        case 'representation':
          if (
            getSegments &&
            segmentTemplate &&
            !timeline.length &&
            duration &&
            periodDuration
          ) {
            timeline.push({
              duration,
              repeat:
                Math.ceil(periodDuration / ((duration / timescale) * 1000)) - 1,
              time: 0,
            });
          }
          if (getSegments && segmentTemplate && timeline.length) {
            gotSegments = true;
            if (segmentTemplate.initialization) {
              this.emit('item', {
                url: resolveURI(baseURL, tmpl(segmentTemplate.initialization)),
                seq: seq,
                init: true,
                duration: 0,
              });
            }
            let segTime = 0;
            for (let { duration: timelineDuration, repeat, time } of timeline) {
              const segmentDuration = (timelineDuration / timescale) * 1000;
              const count = (repeat || 0) + 1;
              segTime = time || segTime;
              for (let i = 0; i < count; i++) {
                this.emit('item', {
                  url: resolveURI(
                    baseURL,
                    tmpl(segmentTemplate.media, segTime),
                  ),
                  seq: seq++,
                  duration: segmentDuration,
                });
                segTime += timelineDuration;
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
          baseURL.length = treeLevel;
          treeLevel--;
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
