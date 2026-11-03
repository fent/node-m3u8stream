const m3u8stream = require('..');

// Sample streams for testing. Some are third-party demo resources and may
// become unavailable or change over time.
const samples = [
  {
    name: 'HLS - Mux Big Buck Bunny',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    name: 'HLS - Apple TS example',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
  },
  {
    name: 'HLS - Apple fMP4 example',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
  },
  {
    name: 'HLS - Unified Streaming fMP4',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  },
  {
    name: 'HLS - encrypted AES-128',
    url: 'https://playertest.longtailvideo.com/adaptive/oceans_aes/oceans_aes.m3u8',
  },
  {
    name: 'DASH - Big Buck Bunny',
    url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
  },
  {
    name: 'DASH - Envivio',
    url: 'https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd',
  },
  {
    name: 'DASH - Sony single-file (FFmpeg-based players may reject)',
    url: 'https://dash.akamaized.net/dash264/TestCases/1a/sony/SNE_DASH_SD_CASE1A_REVISED.mpd',
  },
  {
    name: 'DASH - Shaka Angel One',
    url: 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',
  },
  {
    name: 'DASH - Unified Streaming',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.mpd',
  },
  {
    name: 'DASH live - DASH-IF livesim',
    url: 'https://livesim.dashif.org/livesim/testpic_2s/Manifest.mpd',
  },
  {
    name: 'DASH live - DASH-IF livesim2',
    url: 'https://livesim2.dashif.org/livesim2/testpic_2s/Manifest.mpd',
  },
  {
    name: 'DASH live - SegmentTimeline',
    url: 'https://livesim.dashif.org/livesim/segtimeline_1/testpic_2s/Manifest.mpd',
  },
  {
    name: 'DASH live - multi-period',
    url: 'https://livesim.dashif.org/livesim/periods_60/testpic_2s/Manifest.mpd',
  },
];

const playlist = process.argv[2];
if (!playlist) {
  const path = require('path');
  const filepath = path.relative(process.cwd(), __filename);
  console.error('Must provide link to playlist');
  console.error('usage: node ' + filepath + ' <playlist url>');
  console.error('       node ' + filepath + ' --list');
  console.error('');
  console.error('Sample streams:');
  for (const sample of samples) {
    console.error('  ' + sample.name);
    console.error('    ' + sample.url);
  }
} else if (playlist === '--list') {
  for (const sample of samples) {
    console.log(sample.name);
    console.log('  ' + sample.url);
  }
} else {
  const stream = m3u8stream(playlist);
  const stop = () => {
    stream.end();
    process.exit(0);
  };
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
      stop();
      return;
    }
    throw err;
  });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  stream.pipe(process.stdout);
}
