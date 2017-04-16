const m3u8stream = require('..');

var playlist = process.argv[2];
if (!playlist) {
  const path = require('path');
  var filepath = path.relative(process.cwd(), __filename);
  console.error('Must provide link to  playlist');
  console.error('node ' + filepath + ' [playlist]');
} else {
  m3u8stream(playlist).pipe(process.stdout);
}
