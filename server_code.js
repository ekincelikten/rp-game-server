// server.js - Gelişmiş Oylama ve Faz Yönetimi
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

let players = [];
let phase = 'lobby';
let hostId = null;
let voteCounts = {};
let voteLog = [];
let finalVotes = [];
let defenseTimeout = null;
let dayTimer = null;
let dayStartTime = null;
let remainingDayTime = 90000;

function startDayPhase() {
  phase = 'day';
  voteCounts = {};
  voteLog = [];
  finalVotes = [];
  dayStartTime = Date.now();
  dayTimer = setTimeout(() => startNightPhase(), 90000);
  io.emit('phaseChange', 'day');
}

function startNightPhase() {
  phase = 'night';
  io.emit('phaseChange', 'night');
  // ... gece eylemleri burada işlenir
  setTimeout(() => startDayPhase(), 20000);
}

function handleVote(voter, target) {
  voteCounts[target] = (voteCounts[target] || 0) + 1;
  voteLog.push({ voter, target });
  io.emit('voteUpdate', { counts: voteCounts, log: voteLog });

  const totalPlayers = players.length;
  const threshold = Math.floor(totalPlayers / 2) + 1;

  if (voteCounts[target] >= threshold) {
    clearTimeout(dayTimer);
    const elapsed = Date.now() - dayStartTime;
    remainingDayTime = Math.max(1000, 90000 - elapsed);
    io.emit('defensePhase', target);
    defenseTimeout = setTimeout(() => evaluateFinalVotes(target), 10000);
  }
}

function evaluateFinalVotes(target) {
  const guilty = finalVotes.filter(v => v === 'guilty').length;
  const innocent = finalVotes.filter(v => v === 'innocent').length;

  if (guilty > innocent) {
    const index = players.findIndex(p => p.nickname === target);
    if (index !== -1) {
      players[index].isAlive = false;
    }
    io.emit('chatMessage', `${target} asıldı.`);
    startNightPhase();
  } else {
    io.emit('chatMessage', `${target} masum bulundu.`);
    dayTimer = setTimeout(() => startNightPhase(), remainingDayTime);
  }
}

io.on('connection', (socket) => {
  socket.on('joinGame', (nickname) => {
    if (players.find(p => p.nickname === nickname)) return;

    const avatarIndex = Math.floor(Math.random() * 12) + 1;
    const avatarPath = `/avatars/Avatar${avatarIndex}.png`;

    const player = {
      id: socket.id,
      nickname,
      avatar: avatarPath,
      isAlive: true
    };

    players.push(player);
    io.emit('updatePlayers', players);

    io.to(socket.id).emit('assignRole', { role: player.role || 'Vatandaş', avatar: avatarPath });

    if (players.length === 6) startDayPhase();
  });

  socket.on('vote', (target) => {
    const voter = players.find(p => p.id === socket.id);
    if (phase === 'day' && voter && voter.isAlive) {
      handleVote(voter.nickname, target);
    }
  });

  socket.on('finalVote', ({ decision }) => {
    if (phase === 'day') {
      finalVotes.push(decision);
    }
  });
});

server.listen(3001, () => {
  console.log('Server listening on port 3001');
});
