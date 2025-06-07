const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use('/avatars', express.static(path.join(__dirname, 'avatars')));
app.use(express.static(path.join(__dirname, 'public')));

let players = [];

io.on('connection', (socket) => {
  socket.on('joinGame', (nickname) => {
    const avatarIndex = Math.floor(Math.random() * 12) + 1;
    const player = {
      id: socket.id,
      nickname,
      avatar: `/avatars/Avatar${avatarIndex}.png`,
      isAlive: true,
      silenced: false
    };
    players.push(player);
    io.emit('updatePlayers', players);
    socket.emit('assignRole', { role: 'Vatandaş', avatar: player.avatar });
  });

  socket.on('chatMessage', msg => {
    const player = players.find(p => p.id === socket.id);
    if (!player || !player.isAlive) return;
    if (player.silenced) return;
    io.emit('chatMessage', `${player.nickname}: ${msg}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});