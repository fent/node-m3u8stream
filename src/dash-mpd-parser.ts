import { Writable } from 'stream';
import sax from 'sax';
import { durationStr } from './parse-time';
import { Parser, Variant, VariantFilter, isSet, selectVariant } from './parser';

type ByteRange = { start: number; end: number };
type Initialization = { sourceURL?: string; range?: ByteRange };
type TimelineEntry = { duration?: number; repeat?: number; time?: number };

interface SegmentTemplateInfo {
  initialization?: string;
  media?: string;
  timescale?: number;
  startNumber?: number;
  duration?: number;
  presentationTimeOffset?: number;
}

interface SegmentListInfo {
  timescale?: number;
  duration?: number;
  startNumber?: number;
  presentationTimeOffset?: number;
  initialization?: Initialization;
  segmentURLs: { media?: string; mediaRange?: ByteRange }[];
}

interface SegmentBaseInfo {
  timescale?: number;
  duration?: number;
  presentationTimeOffset?: number;
  indexRange?: ByteRange;
  initialization?: Initialization;
  representationIndex?: Initialization;
}

const isAbsolute = (url: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);

const resolveRelativeURI = (base: string, target: string): string => {
  const origin = 'http://relative.invalid';
  const absoluteBase = base.startsWith('/');
  const href = new URL(target, `${origin}/${base.replace(/^\/+/, '')}`).href;
  const resolved = href.slice(origin.length);
  return absoluteBase || target.startsWith('/')
    ? resolved
    : resolved.replace(/^\//, '');
};

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

  let result = parts[0] || '';
  for (let i = 1; i < parts.length; i++) {
    result = resolveRelativeURI(result, parts[i]);
  }
  return result;
};

const parseByteRange = (rangeStr?: string): ByteRange | null => {
  if (!rangeStr) {
    return null;
  }
  const [start, end] = rangeStr.split('-').map((n) => parseInt(n, 10));
  if (isNaN(start) || isNaN(end)) {
    return null;
  }
  return { start, end };
};

const parseOptionalInt = (value?: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
};

const mergeDefined = <T extends object>(
  base: T | undefined,
  next: Partial<T>,
): T => {
  const result: Partial<T> = { ...base };
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (isSet(next[key])) {
      result[key] = next[key];
    }
  }
  return result as T;
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
          const mimeType = (node.attributes.mimetype ||
            currentAdaptation.mimetype) as string | undefined;
          const contentType = (node.attributes.contenttype ||
            currentAdaptation.contenttype ||
            (mimeType ? mimeType.split('/')[0] : undefined)) as
            string | undefined;
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
            contentType,
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
    let ended = false;

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
    let treeLevel = 0;
    let isTarget = false;
    let availabilityStartTime: number | undefined;
    let mpdDuration = 0;
    let timeShiftBufferDepth = 0;
    let periodStart = 0;
    let periodDuration = 0;
    let gotSegments = false;

    const baseURLs: string[] = [];
    const templates: (SegmentTemplateInfo | undefined)[] = [];
    const timelines: (TimelineEntry[] | undefined)[] = [];
    const segmentLists: (SegmentListInfo | undefined)[] = [];
    const segmentBases: (SegmentBaseInfo | undefined)[] = [];
    const initializations: (Initialization | undefined)[] = [];

    const resetLevel = (level: number): void => {
      baseURLs[level] = '';
      templates[level] = undefined;
      timelines[level] = undefined;
      segmentLists[level] = undefined;
      segmentBases[level] = undefined;
      initializations[level] = undefined;
    };

    const getTemplate = (level: number): SegmentTemplateInfo | undefined => {
      let result: SegmentTemplateInfo | undefined;
      for (let i = 1; i <= level; i++) {
        const template = templates[i];
        if (template) {
          result = mergeDefined(result, template);
        }
      }
      return result;
    };

    const getList = (level: number): SegmentListInfo | undefined => {
      let result: SegmentListInfo | undefined;
      for (let i = 1; i <= level; i++) {
        const list = segmentLists[i];
        if (list) {
          result = mergeDefined(result, list);
          if (list.segmentURLs.length) {
            result.segmentURLs = list.segmentURLs;
          }
        }
      }
      return result;
    };

    const getBase = (level: number): SegmentBaseInfo | undefined => {
      let result: SegmentBaseInfo | undefined;
      for (let i = 1; i <= level; i++) {
        const base = segmentBases[i];
        if (base) {
          result = mergeDefined(result, base);
        }
      }
      return result;
    };

    const getInitialization = (level: number): Initialization | undefined => {
      for (let i = level; i >= 1; i--) {
        if (initializations[i]) {
          return initializations[i];
        }
      }
      return undefined;
    };

    const getTimeline = (level: number): TimelineEntry[] | undefined => {
      for (let i = level; i >= 1; i--) {
        if (timelines[i]?.length) {
          return timelines[i];
        }
      }
      return undefined;
    };

    const templateValue = (
      str: string,
      number: number,
      time?: number,
    ): string => {
      const context: { [key: string]: string | number | undefined } = {
        RepresentationID: targetID,
        Bandwidth: chosen.bandwidth,
        Number: number,
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

    const expandTimeline = (
      entries: TimelineEntry[],
      timescale: number,
      presentationTimeOffset: number,
    ): { time: number; duration: number }[] => {
      const segments: { time: number; duration: number }[] = [];
      let segTime = 0;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const duration = entry.duration;
        if (!duration || duration <= 0) {
          continue;
        }
        let count: number;
        const start = entry.time ?? segTime;
        if (entry.repeat === -1) {
          const next = entries[i + 1];
          let endUnits: number | undefined;
          const nextTime = next?.time;
          if (isSet(nextTime)) {
            endUnits = nextTime;
          } else if (periodDuration) {
            endUnits =
              (periodDuration * timescale) / 1000 + presentationTimeOffset;
          }
          count =
            endUnits === undefined
              ? 1
              : Math.max(1, Math.ceil((endUnits - start) / duration));
        } else {
          count =
            (entry.repeat === undefined || isNaN(entry.repeat)
              ? 0
              : entry.repeat) + 1;
        }
        segTime = start;
        for (let n = 0; n < count; n++) {
          segments.push({
            time: segTime,
            duration: (duration / timescale) * 1000,
          });
          segTime += duration;
        }
      }
      return segments;
    };

    const getDurationTemplateRange = (
      segmentDuration: number,
      maxCount: number,
    ): { first: number; count: number } => {
      if (isStatic) {
        return { first: 0, count: maxCount };
      }
      const elapsed =
        typeof availabilityStartTime === 'number'
          ? Date.now() - availabilityStartTime - periodStart
          : 0;
      if (elapsed <= 0) {
        return { first: 0, count: Math.max(maxCount, 1) };
      }
      const window = timeShiftBufferDepth || elapsed;
      const first = Math.max(
        0,
        Math.floor(Math.max(0, elapsed - window) / segmentDuration),
      );
      const last = Math.floor(elapsed / segmentDuration) - 1;
      let count = Math.max(0, last - first + 1);
      if (maxCount) {
        count = Math.min(count, Math.max(0, maxCount - first));
      }
      return { first, count };
    };

    const emitInit = (
      level: number,
      seq: number,
      templateInitialization?: string,
    ): void => {
      const initialization = getInitialization(level);
      const url = templateInitialization
        ? resolveURI(
            baseURLs.slice(0, level + 1),
            templateValue(templateInitialization, seq),
          )
        : resolveURI(
            baseURLs.slice(0, level + 1),
            initialization?.sourceURL || '',
          );
      if (!templateInitialization && !initialization) {
        return;
      }
      this.emit('item', {
        url,
        seq,
        init: true,
        duration: 0,
        ...(initialization?.range ? { range: initialization.range } : {}),
      });
    };

    const emitSegments = (level: number): void => {
      const bases = baseURLs.slice(0, level + 1);
      const template = getTemplate(level);
      const list = getList(level);
      const base = getBase(level);
      const mediaURL = (target: string): string => resolveURI(bases, target);

      if (template?.media) {
        const timescale = template.timescale ?? 1;
        const startNumber = template.startNumber ?? 1;
        let number = startNumber;
        emitInit(level, number, template.initialization);
        const entries = getTimeline(level);
        if (entries?.length) {
          const segments = expandTimeline(
            entries,
            timescale,
            template.presentationTimeOffset ?? 0,
          );
          for (const segment of segments) {
            this.emit('item', {
              url: mediaURL(
                templateValue(template.media, number, segment.time),
              ),
              seq: isStatic ? number : segment.time,
              duration: segment.duration,
            });
            number++;
          }
          gotSegments = segments.length > 0;
        } else if (template.duration) {
          const segmentDuration = (template.duration / timescale) * 1000;
          const maxCount = periodDuration
            ? Math.ceil(periodDuration / segmentDuration)
            : 0;
          const { first, count } = getDurationTemplateRange(
            segmentDuration,
            maxCount,
          );
          let seq = startNumber + first;
          for (let n = 0; n < count; n++) {
            this.emit('item', {
              url: mediaURL(templateValue(template.media, seq, undefined)),
              seq: seq++,
              duration: segmentDuration,
            });
          }
          gotSegments = count > 0;
        }
        return;
      }

      if (list?.segmentURLs.length) {
        const timescale = list.timescale ?? 1;
        let seq = list.startNumber ?? 1;
        emitInit(level, seq);
        const entries = getTimeline(level);
        const segments = entries
          ? expandTimeline(entries, timescale, list.presentationTimeOffset ?? 0)
          : [];
        list.segmentURLs.forEach((segmentURL, index) => {
          const duration =
            segments[index]?.duration ??
            (list.duration ? (list.duration / timescale) * 1000 : 0);
          this.emit('item', {
            url: mediaURL(segmentURL.media || ''),
            seq: seq++,
            duration,
            ...(segmentURL.mediaRange ? { range: segmentURL.mediaRange } : {}),
          });
        });
        gotSegments = list.segmentURLs.length > 0;
        return;
      }

      if (base) {
        const initialization = getInitialization(level);
        let seq = 1;
        emitInit(level, seq);
        let start: number | undefined;
        if (base.indexRange) {
          start = base.indexRange.end + 1;
        } else if (
          base.representationIndex?.range &&
          !base.representationIndex.sourceURL
        ) {
          start = base.representationIndex.range.end + 1;
        } else if (initialization?.range && !initialization.sourceURL) {
          start = initialization.range.end + 1;
        }
        const url = mediaURL('');
        if (url) {
          this.emit('item', {
            url,
            seq: seq++,
            duration: base.duration
              ? (base.duration / (base.timescale ?? 1)) * 1000
              : periodDuration,
            ...(isSet(start) ? { range: { start } } : {}),
          });
          gotSegments = true;
        }
        return;
      }

      if (baseURLs[level]) {
        const url = mediaURL('');
        if (url) {
          this.emit('item', {
            url,
            seq: 1,
            duration: periodDuration,
          });
          gotSegments = true;
        }
      }
    };

    const onEnd = (): void => {
      ended = true;
      if (isStatic) {
        this.emit('endlist');
      }
      this.emit('end');
    };

    const segmentParser = sax.parser(false, { lowercase: true });
    segmentParser.onopentag = (node) => {
      switch (node.name) {
        case 'mpd':
          availabilityStartTime = node.attributes.availabilitystarttime
            ? new Date(
                node.attributes.availabilitystarttime as string,
              ).getTime()
            : undefined;
          mpdDuration = durationStr(
            node.attributes.mediapresentationduration as string,
          );
          timeShiftBufferDepth = durationStr(
            node.attributes.timeshiftbufferdepth as string,
          );
          if (node.attributes.minimumupdateperiod) {
            this.emit(
              'targetduration',
              durationStr(node.attributes.minimumupdateperiod as string),
            );
          }
          break;
        case 'period':
          treeLevel = 1;
          resetLevel(treeLevel);
          baseURLs.length = treeLevel;
          periodStart = durationStr(node.attributes.start as string) || 0;
          periodDuration =
            durationStr(node.attributes.duration as string) || mpdDuration;
          break;
        case 'adaptationset':
          treeLevel++;
          resetLevel(treeLevel);
          baseURLs.length = treeLevel;
          break;
        case 'representation':
          treeLevel++;
          resetLevel(treeLevel);
          baseURLs.length = treeLevel;
          isTarget = `${node.attributes.id}` === `${targetID}`;
          break;
        case 'baseurl':
          lastTag = 'baseurl';
          break;
        case 'segmenttemplate':
          templates[treeLevel] = {
            initialization: node.attributes.initialization as
              string | undefined,
            media: node.attributes.media as string | undefined,
            timescale: parseOptionalInt(
              node.attributes.timescale as string | undefined,
            ),
            startNumber: parseOptionalInt(
              node.attributes.startnumber as string | undefined,
            ),
            duration: parseOptionalInt(
              node.attributes.duration as string | undefined,
            ),
            presentationTimeOffset: parseOptionalInt(
              node.attributes.presentationtimeoffset as string | undefined,
            ),
          };
          break;
        case 'segmentlist':
          segmentLists[treeLevel] = {
            timescale: parseOptionalInt(
              node.attributes.timescale as string | undefined,
            ),
            duration: parseOptionalInt(
              node.attributes.duration as string | undefined,
            ),
            startNumber: parseOptionalInt(
              node.attributes.startnumber as string | undefined,
            ),
            presentationTimeOffset: parseOptionalInt(
              node.attributes.presentationtimeoffset as string | undefined,
            ),
            segmentURLs: [],
          };
          break;
        case 'segmentbase': {
          const indexRange = parseByteRange(
            node.attributes.indexrange as string,
          );
          segmentBases[treeLevel] = {
            timescale: parseOptionalInt(
              node.attributes.timescale as string | undefined,
            ),
            duration: parseOptionalInt(
              node.attributes.duration as string | undefined,
            ),
            presentationTimeOffset: parseOptionalInt(
              node.attributes.presentationtimeoffset as string | undefined,
            ),
            ...(indexRange ? { indexRange } : {}),
          };
          break;
        }
        case 'representationindex': {
          const current = segmentBases[treeLevel];
          if (current) {
            const range = parseByteRange(node.attributes.range as string);
            current.representationIndex = {
              sourceURL: node.attributes.sourceurl as string | undefined,
              ...(range ? { range } : {}),
            };
          }
          break;
        }
        case 'segmenttimeline':
          lastTag = 'segmenttimeline';
          break;
        case 's': {
          if (!timelines[treeLevel]) {
            timelines[treeLevel] = [];
          }
          timelines[treeLevel]!.push({
            duration: parseOptionalInt(node.attributes.d as string | undefined),
            repeat: parseOptionalInt(node.attributes.r as string | undefined),
            time: parseOptionalInt(node.attributes.t as string | undefined),
          });
          break;
        }
        case 'initialization': {
          const range = parseByteRange(node.attributes.range as string);
          initializations[treeLevel] = {
            sourceURL: node.attributes.sourceurl as string | undefined,
            ...(range ? { range } : {}),
          };
          break;
        }
        case 'segmenturl': {
          segmentLists[treeLevel]?.segmentURLs.push({
            media: node.attributes.media as string | undefined,
            mediaRange:
              parseByteRange(node.attributes.mediarange as string) ?? undefined,
          });
          break;
        }
      }
    };

    segmentParser.onclosetag = (tagName) => {
      if (tagName === 'representation') {
        if (isTarget) {
          const template = getTemplate(treeLevel);
          const list = getList(treeLevel);
          const base = getBase(treeLevel);
          const initialization = getInitialization(treeLevel);
          const externalOnly =
            !!base?.representationIndex?.sourceURL &&
            !base.indexRange &&
            !base.duration &&
            !initialization;
          const directMedia =
            !!baseURLs[treeLevel] &&
            !template?.media &&
            !list?.segmentURLs.length &&
            !base;
          const hasContent =
            !!template?.media ||
            !!list?.segmentURLs.length ||
            (!!base && !externalOnly) ||
            directMedia;
          if (hasContent) {
            const config = template?.media
              ? template
              : list?.segmentURLs.length
                ? list
                : base;
            const timescale = config?.timescale ?? 1;
            const presentationTimeOffset = config?.presentationTimeOffset ?? 0;
            this.emit(
              'starttime',
              (availabilityStartTime ?? 0) +
                periodStart -
                (presentationTimeOffset / timescale) * 1000,
            );
            emitSegments(treeLevel);
            if (gotSegments) {
              this.emit('endearly');
              onEnd();
              delete (segmentParser as any).onopentag;
              delete (segmentParser as any).onclosetag;
              delete (segmentParser as any).ontext;
            }
          }
          isTarget = false;
        }
        resetLevel(treeLevel);
        baseURLs.length = treeLevel;
        treeLevel--;
      } else if (tagName === 'adaptationset' || tagName === 'period') {
        resetLevel(treeLevel);
        baseURLs.length = treeLevel;
        treeLevel--;
      }
    };

    segmentParser.ontext = (text) => {
      if (lastTag === 'baseurl') {
        baseURLs[treeLevel] = text.trim();
        lastTag = null;
      }
    };

    segmentParser.write(xml).close();
    if (!ended) {
      onEnd();
    }
    callback();
  }
}
