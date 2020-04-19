const Discord    = require('discord.js');
const m3u8stream = require('..');
 
const playlist = process.argv[2] || '';
if (!playlist) {
  const path = require('path');
  const filepath = path.relative(process.cwd(), __filename);
  console.error('Must provide link to playlist');
  console.error('usage: node ' + filepath + ' [playlist]');

} else {
  const client = new Discord.Client();
  client.login(' Y o u r   B o t   T o k e n ');

  client.on('message', message => {
    if (message.content.startsWith('++play')) {
      const voiceChannel = message.member.voiceChannel;
      if (!voiceChannel) {
        return message.reply('Please be in a voice channel first!');
      }
      voiceChannel.join()
        .then(connnection => {
          let stream = m3u8stream(playlist);
          const dispatcher = connnection.playStream(stream);
          dispatcher.on('end', () => {
            voiceChannel.leave();
          });
        });
    }
  });
}
