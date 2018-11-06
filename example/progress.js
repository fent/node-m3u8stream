const fs         = require('fs');
const readline   = require('readline');
const m3u8stream = require('..');

const playlist = process.argv[2];
if (!playlist) {
  const path = require('path');
  const filepath = path.relative(process.cwd(), __filename);
  console.error('Must provide link to  playlist');
  console.error('usage: node ' + filepath + ' <playlist url>');
} else {
  const stream = m3u8stream(playlist);
  stream.pipe(fs.createWriteStream('media.mp4'));
  stream.on('progress', (segment, totalSegments, downloaded) => {
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `${segment.num} of ${totalSegments} segments ` +
      `(${(segment.num / totalSegments * 100).toFixed(2)}%) ` +
      `${(downloaded / 1024 / 1024).toFixed(2)}MB downloaded`);
  });
}
