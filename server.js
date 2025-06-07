const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use('/avatars', express.static(path.join(__dirname, 'avatars')));
app.use(express.static(path.join(__dirname, 'public')));

const MAX_PLAYERS = 6;
let usedAvatars = [];
let lobby = {
  players: [],
  phase: 'lobby',
  nightActions: {},
  voteCounts: {},
  voteLog: [],
  finalVotes: [],
  timer: null,
  timerStart: null,
  remainingTime: 0
};

const roles = [
  { name: 'Gulyabani', team: 'hortlak' },
  { name: 'İfrit', team: 'hortlak' },
  { name: 'Doktor', team: 'köylü' },
  { name: 'Dedektif', team: 'köylü' },
  { name: 'Gardiyan', team: 'köylü' },
  { name: 'Vatandaş', team: 'köylü' }
];

function assignRoles() {
  const shuffled = [...lobby.players].sort(() => Math.random() - 0.5);
  shuffled.forEach((p, i) => {
    p.role = roles[i].name;
    p.team = roles[i].team;
    p.jailed = false;
    p.isAlive = true;
  });
}

function startDayPhase() {
  lobby.phase = 'day';
  lobby.voteCounts = {};
  lobby.voteLog = [];
  lobby.finalVotes = [];
  lobby.nightActions = {};
  io.emit('phaseChange', 'day');
  lobby.timerStart = Date.now();
  clearTimeout(lobby.timer);
  lobby.timer = setTimeout(() => startNightPhase(), 90000);
}

function startNightPhase() {
  lobby.phase = 'night';
  io.emit('phaseChange', 'night');
  clearTimeout(lobby.timer);
  lobby.timer = setTimeout(() => startDayPhase(), 20000);
}

io.on('connection', (socket) => {
  socket.on('joinGame', (nickname) => {
    if (!nickname || lobby.players.find(p => p.nickname === nickname)) return;
    if (lobby.players.length >= MAX_PLAYERS) return;

    // Benzersiz avatar seçimi
    let avatarIndex;
    const available = Array.from({ length: 12 }, (_, i) => i + 1).filter(i => !usedAvatars.includes(i));
    if (available.length > 0) {
      avatarIndex = available[Math.floor(Math.random() * available.length)];
      usedAvatars.push(avatarIndex);
    } else {
      avatarIndex = Math.floor(Math.random() * 12) + 1; // fallback
    }

    const player = {
      id: socket.id,
      nickname,
      avatar: `/avatars/Avatar${avatarIndex}.png`
    };

    lobby.players.push(player);
    socket.join('main');
    socket.emit('assignRole', { role: player.role || 'Bekleniyor...', avatar: player.avatar });
    io.emit('updatePlayers', lobby.players);

    if (lobby.players.length === MAX_PLAYERS) {
      assignRoles();
      lobby.players.forEach(p => {
        io.to(p.id).emit('assignRole', { role: p.role, avatar: p.avatar });
      });
      startDayPhase();
    }
  });

  socket.on('chatMessage', (msg) => {
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || !msg) return;
    io.emit('chatMessage', `${player.nickname}: ${msg}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});