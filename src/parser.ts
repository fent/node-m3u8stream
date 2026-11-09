import { Writable } from 'stream';

export const isSet = <T>(value: T | undefined): value is T =>
  typeof value !== 'undefined';

export interface KeyInfo {
  method: 'NONE' | 'AES-128' | 'SAMPLE-AES';
  uri?: string;
  iv?: string;
  keyformat?: string;
  keyformatversions?: string;
}

export interface Item {
  url: string;
  seq: number;
  duration: number;
  time?: number;
  range?: { start: number; end?: number };
  init?: boolean;
  key?: KeyInfo;
  discontinuity?: boolean;
  discontinuitySequence?: number;
}

export interface Variant {
  id?: string;
  name?: string;
  url?: string;
  index: number;
  bandwidth?: number;
  resolution?: string;
  width?: number;
  height?: number;
  codecs?: string;
  frameRate?: number;
  contentType?: string;
  audio?: string;
  video?: string;
  subtitles?: string;
  closedCaptions?: string;
}

export interface Media {
  type: 'AUDIO' | 'VIDEO' | 'SUBTITLES' | 'CLOSED-CAPTIONS';
  groupId: string;
  name: string;
  uri?: string;
  language?: string;
  default?: boolean;
  autoselect?: boolean;
  forced?: boolean;
  channels?: string;
  characteristics?: string;
}

export type VariantFilter = string | number | ((variant: Variant) => boolean);

const highestBandwidth = (list: Variant[]): Variant =>
  [...list].sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];

export function selectVariant(
  variants: Variant[],
  filter?: VariantFilter,
): Variant | undefined {
  if (!variants.length) {
    return undefined;
  }
  if (filter === undefined) {
    return (
      variants.find((variant) => variant.contentType === 'video') ?? variants[0]
    );
  }
  if (typeof filter === 'function') {
    return variants.find(filter);
  }

  const filterStr = filter.toString();

  // Quality keywords
  if (/^(highest|best)$/i.test(filterStr)) {
    return highestBandwidth(variants);
  }
  if (/^(lowest|worst)$/i.test(filterStr)) {
    return [...variants].sort(
      (a, b) =>
        (a.bandwidth ?? Number.MAX_SAFE_INTEGER) -
        (b.bandwidth ?? Number.MAX_SAFE_INTEGER),
    )[0];
  }

  // Exact identifier, name, URL, or index matching
  const exact = variants.find((v) => {
    if (v.id === filterStr) return true;
    if (v.name === filterStr) return true;
    if (`${v.index}` === filterStr) return true;
    if (v.url) {
      if (v.url === filterStr) return true;
      const lastPart = v.url.split(/[?#]/)[0].split('/').filter(Boolean).pop();
      if (lastPart === filterStr) return true;
      if (lastPart?.replace(/\.[^.]*$/, '') === filterStr) return true;
    }
    return false;
  });
  if (exact) {
    return exact;
  }

  // Resolution shorthand (e.g. '1920x1080')
  const resMatch = /^(\d+)x(\d+)$/i.exec(filterStr);
  if (resMatch) {
    const width = parseInt(resMatch[1], 10);
    const height = parseInt(resMatch[2], 10);
    const matches = variants.filter(
      (v) => v.width === width && v.height === height,
    );
    if (matches.length) {
      return highestBandwidth(matches);
    }
  }

  // Height shorthand (e.g. '1080p' or '1080')
  const heightMatch = /^(\d+)p?$/i.exec(filterStr);
  if (heightMatch) {
    const height = parseInt(heightMatch[1], 10);
    const matches = variants.filter((v) => v.height === height);
    if (matches.length) {
      return highestBandwidth(matches);
    }
  }

  return undefined;
}

export function selectMedia(
  media: Media[],
  filter?: VariantFilter,
): Media | undefined {
  if (typeof filter !== 'string') {
    return undefined;
  }
  return media.find(
    (m) =>
      m.name === filter ||
      m.groupId === filter ||
      m.uri === filter ||
      m.language === filter,
  );
}

export interface Parser extends Writable {
  on(event: 'item', listener: (item: Item) => boolean): this;
  on(event: 'variant', listener: (variant: Variant) => boolean): this;
  on(event: 'media', listener: (media: Media) => boolean): this;
  on(event: string | symbol, listener: (...args: any[]) => any): this;
  emit(event: 'item', item: Item): boolean;
  emit(event: 'variant', variant: Variant): boolean;
  emit(event: 'media', media: Media): boolean;
  emit(event: string, ...args: any[]): boolean;
}
