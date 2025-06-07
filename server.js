
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(path.join(__dirname, 'avatars')));

let players = [];

io.on('connection', (socket) => {
  socket.on('joinGame', (nickname) => {
    const avatarIndex = Math.floor(Math.random() * 12) + 1;
    const player = {
      id: socket.id,
      nickname,
      avatar: \`/avatars/Avatar\${avatarIndex}.png\`
    };
    players.push(player);
    io.emit('updatePlayers', players);
  });

  socket.on('chatMessage', (msg) => {
    io.emit('chatMessage', msg);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
