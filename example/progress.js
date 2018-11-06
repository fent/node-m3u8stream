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
  stream.on('progress', (segmentNumber, totalSegments, bytesDownloaded) => {
    const percent = segmentNumber / totalSegments;
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `${segmentNumber} of ${totalSegments} segments ` +
      `(${(percent * 100).toFixed(2)}%) ` +
      `${(bytesDownloaded / 1024 / 1024).toFixed(2)}MB downloaded`);
  });
}
