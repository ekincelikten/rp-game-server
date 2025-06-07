// server.js - Çoklu Lobby Sistemi ve Otomatik Rol Atama
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

let lobbies = [];
let globalPlayerId = 0;

const MAX_PLAYERS_PER_LOBBY = 6;

function createLobby() {
  const id = lobbies.length + 1;
  const lobby = {
    id,
    players: [],
    phase: 'lobby',
    voteCounts: {},
    voteLog: [],
    finalVotes: [],
    dayTimer: null,
    dayStartTime: null,
    remainingDayTime: 90000,
    nightActions: {
      kill: null,
      protect: null,
      silence: null,
      jail: null,
      execute: null,
      investigate: null
    },
    jailerExecuted: false,
    jailerMarkedTarget: null
  };
  lobbies.push(lobby);
  return lobby;
}

function assignRoles(lobby) {
  const roles = [
    { name: 'Gulyabani', team: 'hortlak' },
    { name: 'İfrit', team: 'hortlak' },
    { name: 'Doktor', team: 'köylü' },
    { name: 'Dedektif', team: 'köylü' },
    { name: 'Gardiyan', team: 'köylü' },
    { name: 'Vatandaş', team: 'köylü' }
  ];
  const shuffled = [...lobby.players].sort(() => Math.random() - 0.5);
  shuffled.forEach((p, i) => {
    p.role = roles[i].name;
    p.team = roles[i].team;
    p.jailed = false;
  });
}

function checkWinCondition(lobby) {
  const alive = lobby.players.filter(p => p.isAlive);
  const hortlak = alive.filter(p => p.team === 'hortlak');
  const koylu = alive.filter(p => p.team === 'köylü');
  if (hortlak.length === 0) {
    io.to(`lobby-${lobby.id}`).emit('gameOver', 'Köylüler kazandı!');
    lobby.phase = 'ended';
    return true;
  }
  if (koylu.length === 0 || hortlak.length >= koylu.length) {
    io.to(`lobby-${lobby.id}`).emit('gameOver', 'Hortlaklar kazandı!');
    lobby.phase = 'ended';
    return true;
  }
  return false;
}

function startDayPhase(lobby) {
  if (checkWinCondition(lobby)) return;
  lobby.phase = 'day';
  lobby.voteCounts = {};
  lobby.voteLog = [];
  lobby.finalVotes = [];
  lobby.nightActions = { kill: null, protect: null, silence: null, jail: null, execute: null, investigate: null };
  lobby.jailerMarkedTarget = null;
  lobby.dayStartTime = Date.now();
  lobby.dayTimer = setTimeout(() => startNightPhase(lobby), 90000);
  io.to(`lobby-${lobby.id}`).emit('phaseChange', 'day');
}

function startNightPhase(lobby) {
  if (checkWinCondition(lobby)) return;
  lobby.phase = 'night';
  io.to(`lobby-${lobby.id}`).emit('phaseChange', 'night');

  const aliveHortlaklar = lobby.players.filter(p => p.isAlive && p.team === 'hortlak');
  aliveHortlaklar.forEach(h => {
    aliveHortlaklar.forEach(o => {
      if (h.id !== o.id) {
        io.to(h.id).emit('ghostChatInfo', `${o.nickname} (${o.role})`);
      }
    });
  });

  setTimeout(() => {
    processNightActions(lobby);
    startDayPhase(lobby);
  }, 20000);
}

function processNightActions(lobby) {
  const a = lobby.nightActions;
  if (a.jail && lobby.jailerMarkedTarget === a.jail) {
    const jailed = lobby.players.find(p => p.nickname === a.jail);
    if (jailed) jailed.jailed = true;
    io.to(`lobby-${lobby.id}`).emit('jailVisual', a.jail);
    const jailer = lobby.players.find(p => p.role === 'Gardiyan');
    if (jailer) io.to(jailer.id).emit('jailChat', { with: a.jail });
    if (jailed) io.to(jailed.id).emit('jailChat', { with: 'Gardiyan' });
  }
  if (a.execute && !lobby.jailerExecuted) {
    const exec = lobby.players.find(p => p.nickname === a.execute);
    if (exec) exec.isAlive = false;
    io.to(`lobby-${lobby.id}`).emit('chatMessage', `${a.execute} gardiyan tarafından infaz edildi.`);
    lobby.jailerExecuted = true;
  } else {
    const target = a.kill;
    const protect = a.protect;
    if (target && target !== protect) {
      const victim = lobby.players.find(p => p.nickname === target);
      if (victim) victim.isAlive = false;
      io.to(`lobby-${lobby.id}`).emit('chatMessage', `${target} gece öldürüldü.`);
    } else if (target && target === protect) {
      io.to(`lobby-${lobby.id}`).emit('chatMessage', `${target} saldırıdan kurtuldu (doktor korudu).`);
    }
    if (a.silence) {
      io.to(`lobby-${lobby.id}`).emit('silencePlayer', a.silence);
    }
  }
  lobby.players.forEach(p => p.jailed = false);
  io.to(`lobby-${lobby.id}`).emit('updatePlayers', lobby.players);
}

function handleVote(lobby, voter, target) {
  lobby.voteCounts[target] = (lobby.voteCounts[target] || 0) + 1;
  lobby.voteLog.push({ voter, target });
  io.to(`lobby-${lobby.id}`).emit('voteUpdate', { counts: lobby.voteCounts, log: lobby.voteLog });

  const threshold = Math.floor(lobby.players.length / 2) + 1;
  if (lobby.voteCounts[target] >= threshold) {
    clearTimeout(lobby.dayTimer);
    const elapsed = Date.now() - lobby.dayStartTime;
    lobby.remainingDayTime = Math.max(1000, 90000 - elapsed);
    io.to(`lobby-${lobby.id}`).emit('defensePhase', target);
    setTimeout(() => evaluateFinalVotes(lobby, target), 10000);
  }
}

function evaluateFinalVotes(lobby, target) {
  const g = lobby.finalVotes.filter(v => v === 'guilty').length;
  const i = lobby.finalVotes.filter(v => v === 'innocent').length;
  if (g > i) {
    const victim = lobby.players.find(p => p.nickname === target);
    if (victim) victim.isAlive = false;
    io.to(`lobby-${lobby.id}`).emit('chatMessage', `${target} asıldı.`);
    startNightPhase(lobby);
  } else {
    io.to(`lobby-${lobby.id}`).emit('chatMessage', `${target} masum bulundu.`);
    lobby.dayTimer = setTimeout(() => startNightPhase(lobby), lobby.remainingDayTime);
  }
}

io.on('connection', (socket) => {
  socket.on('joinGame', (nickname) => {
    if (!nickname) return;
    let lobby = lobbies.find(l => l.players.length < MAX_PLAYERS_PER_LOBBY && l.phase === 'lobby');
    if (!lobby) lobby = createLobby();
    socket.join(`lobby-${lobby.id}`);

    const avatarIndex = Math.floor(Math.random() * 12) + 1;
    const player = {
      id: socket.id,
      nickname,
      avatar: `/avatars/Avatar${avatarIndex}.png`,
      isAlive: true
    };

    lobby.players.push(player);

    if (lobby.players.length === MAX_PLAYERS_PER_LOBBY) {
      assignRoles(lobby);
      lobby.players.forEach(p => {
        io.to(p.id).emit('assignRole', { role: p.role, avatar: p.avatar });
      });
      startDayPhase(lobby);
    } else {
      io.to(socket.id).emit('assignRole', { role: player.role || 'Vatandaş', avatar: player.avatar });
    }
    io.to(`lobby-${lobby.id}`).emit('updatePlayers', lobby.players);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
