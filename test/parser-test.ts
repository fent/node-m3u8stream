import assert from 'assert';
import { Media, Variant, selectMedia, selectVariant } from '../dist/parser';

describe('selectVariant', () => {
  const sampleVariants: Variant[] = [
    {
      id: 'low',
      name: 'low',
      url: 'http://example.com/streams/low/low.m3u8?token=123',
      index: 0,
      bandwidth: 500000,
      resolution: '640x360',
      width: 640,
      height: 360,
      frameRate: 30,
    },
    {
      id: 'mid-nobw',
      name: 'mid-nobw',
      url: 'mid/mid_nobw.m3u8',
      index: 1,
      resolution: '1280x720',
      width: 1280,
      height: 720,
    },
    {
      id: 'mid-nobw-2',
      name: 'mid-nobw-2',
      url: 'mid/mid_nobw_2.m3u8',
      index: 2,
      resolution: '1280x720',
      width: 1280,
      height: 720,
    },
    {
      id: 'mid-30',
      name: 'mid-30',
      url: 'mid/stream_720_30.m3u8',
      index: 3,
      bandwidth: 1500000,
      resolution: '1280x720',
      width: 1280,
      height: 720,
      frameRate: 30,
    },
    {
      id: 'mid-60',
      name: 'mid-60',
      url: 'mid/stream_720_60.m3u8',
      index: 4,
      bandwidth: 2500000,
      resolution: '1280x720',
      width: 1280,
      height: 720,
      frameRate: 60,
    },
    {
      id: 'high-nobw',
      name: 'high-nobw',
      url: 'high/high_nobw.m3u8',
      index: 5,
      resolution: '1920x1080',
      width: 1920,
      height: 1080,
    },
    {
      id: 'high-nobw-2',
      name: 'high-nobw-2',
      url: 'high/high_nobw_2.m3u8',
      index: 6,
      resolution: '1920x1080',
      width: 1920,
      height: 1080,
    },
    {
      id: 'high-4k',
      name: 'high-4k',
      url: 'high/high_4k.m3u8',
      index: 7,
      bandwidth: 4000000,
      resolution: '1920x1080',
      width: 1920,
      height: 1080,
    },
    {
      id: 'high',
      name: 'high',
      url: 'high/high.m3u8',
      index: 8,
      bandwidth: 5000000,
      resolution: '1920x1080',
      width: 1920,
      height: 1080,
      frameRate: 60,
    },
    {
      id: 'audio-only',
      name: undefined,
      url: 'audio.m3u8#frag',
      index: 9,
      bandwidth: 64000,
    },
  ];

  it('Returns undefined when variants array is empty', () => {
    assert.strictEqual(selectVariant([]), undefined);
  });

  it('Returns the first variant when filter is undefined', () => {
    assert.strictEqual(selectVariant(sampleVariants), sampleVariants[0]);
    assert.strictEqual(
      selectVariant(sampleVariants, undefined),
      sampleVariants[0],
    );
  });

  it('Prefers the first video variant when filter is undefined', () => {
    const variants: Variant[] = [
      { id: 'text', index: 0, contentType: 'text' },
      { id: 'audio', index: 1, contentType: 'audio' },
      { id: 'video', index: 2, contentType: 'video' },
    ];
    assert.strictEqual(selectVariant(variants), variants[2]);
  });

  it('Filters using a custom predicate function', () => {
    const match = selectVariant(
      sampleVariants,
      (v) => v.frameRate === 60 && v.height === 720,
    );
    assert.strictEqual(match, sampleVariants[4]);

    const notFound = selectVariant(
      sampleVariants,
      (v) => (v.bandwidth ?? 0) > 10000000,
    );
    assert.strictEqual(notFound, undefined);
  });

  it('Selects by highest / best quality keyword', () => {
    assert.strictEqual(
      selectVariant(sampleVariants, 'highest'),
      sampleVariants[8],
    );
    assert.strictEqual(
      selectVariant(sampleVariants, 'BEST'),
      sampleVariants[8],
    );
  });

  it('Selects by lowest / worst quality keyword', () => {
    assert.strictEqual(
      selectVariant(sampleVariants, 'lowest'),
      sampleVariants[9],
    );
    assert.strictEqual(
      selectVariant(sampleVariants, 'worst'),
      sampleVariants[9],
    );
  });

  it('Handles variants with undefined bandwidth for keywords', () => {
    const noBwVariants: Variant[] = [
      { id: 'a', index: 0 },
      { id: 'b', index: 1 },
    ];
    assert.strictEqual(selectVariant(noBwVariants, 'highest'), noBwVariants[0]);
    assert.strictEqual(selectVariant(noBwVariants, 'lowest'), noBwVariants[0]);
  });

  it('Matches exact variant ID, name, or index', () => {
    assert.strictEqual(
      selectVariant(sampleVariants, 'mid-30'),
      sampleVariants[3],
    );
    assert.strictEqual(
      selectVariant(sampleVariants, 'high'),
      sampleVariants[8],
    );
    const variantsWithName: Variant[] = [
      { id: 'track-1', name: 'english-audio', index: 0 },
    ];
    assert.strictEqual(
      selectVariant(variantsWithName, 'english-audio'),
      variantsWithName[0],
    );
    assert.strictEqual(selectVariant(sampleVariants, '3'), sampleVariants[3]);
    assert.strictEqual(selectVariant(sampleVariants, 3), sampleVariants[3]);
  });

  it('Matches URL or URL basename (ignoring query strings)', () => {
    assert.strictEqual(
      selectVariant(
        sampleVariants,
        'http://example.com/streams/low/low.m3u8?token=123',
      ),
      sampleVariants[0],
    );
    assert.strictEqual(
      selectVariant(sampleVariants, 'low.m3u8'),
      sampleVariants[0],
    );
    assert.strictEqual(
      selectVariant(sampleVariants, 'audio.m3u8'),
      sampleVariants[9],
    );
  });

  it('Matches resolution shorthand (WxH and height/p)', () => {
    // 1920x1080
    assert.strictEqual(
      selectVariant(sampleVariants, '1920x1080'),
      sampleVariants[8],
    );
    // 720p picks highest bandwidth matching variant (mid-60 at 2500000 vs mid-30 at 1500000)
    assert.strictEqual(
      selectVariant(sampleVariants, '720p'),
      sampleVariants[4],
    );
    // 360p
    assert.strictEqual(
      selectVariant(sampleVariants, '360p'),
      sampleVariants[0],
    );
    // Bare height 360 (when not matching an exact ID/name/index)
    assert.strictEqual(selectVariant(sampleVariants, '360'), sampleVariants[0]);
  });

  it('Returns undefined when resolution or height does not match', () => {
    assert.strictEqual(selectVariant(sampleVariants, '3840x2160'), undefined);
    assert.strictEqual(selectVariant(sampleVariants, '480p'), undefined);
  });

  it('Returns undefined when no exact match, keyword, or resolution matches', () => {
    assert.strictEqual(selectVariant(sampleVariants, 'nonexistent'), undefined);
  });

  it('Matches a URL basename without its extension', () => {
    const variant: Variant = {
      url: 'mid/stream_xyz.m3u8',
      index: 10,
      bandwidth: 1000,
    };
    assert.strictEqual(selectVariant([variant], 'stream_xyz'), variant);
  });

  it('Skips URL matching for variants without a URL', () => {
    const variant: Variant = { index: 0, bandwidth: 1000 };
    assert.strictEqual(selectVariant([variant], 'missing'), undefined);
  });

  it('Handles URLs without a basename', () => {
    const variant: Variant = { url: '/', index: 0 };
    assert.strictEqual(selectVariant([variant], 'missing'), undefined);
  });
});

describe('selectMedia', () => {
  const media: Media[] = [
    {
      type: 'AUDIO',
      groupId: 'aac',
      name: 'English',
      uri: 'audio/en.m3u8',
      language: 'en',
    },
    {
      type: 'SUBTITLES',
      groupId: 'subs',
      name: 'French',
      uri: 'subs/fr.m3u8',
      language: 'fr',
    },
  ];

  it('Returns undefined for undefined or non-string filters', () => {
    assert.strictEqual(selectMedia(media), undefined);
    assert.strictEqual(selectMedia(media, 1), undefined);
    assert.strictEqual(
      selectMedia(media, () => true),
      undefined,
    );
  });

  it('Selects by name, group id, URI, or language', () => {
    assert.strictEqual(selectMedia(media, 'English'), media[0]);
    assert.strictEqual(selectMedia(media, 'aac'), media[0]);
    assert.strictEqual(selectMedia(media, 'subs/fr.m3u8'), media[1]);
    assert.strictEqual(selectMedia(media, 'fr'), media[1]);
  });

  it('Returns undefined when nothing matches', () => {
    assert.strictEqual(selectMedia(media, 'Spanish'), undefined);
  });
});
