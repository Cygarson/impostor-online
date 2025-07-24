// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const words = fs.readFileSync(path.join(__dirname, "words.txt"), "utf-8").split("\n").map(w => w.trim()).filter(Boolean);
const rooms = {};

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

io.on("connection", socket => {
  socket.on("createRoom", (nickname, color, mode, avatar, callback) => {
    const code = Math.random().toString(36).substr(2, 4).toUpperCase();
    rooms[code] = {
      players: [],
      gameStarted: false,
      ownerId: socket.id,
      round: 0,
      scores: {},
      word: "",
      votes: [],
      guessed: false,
      forcedMode: mode !== "random" ? mode : null
    };
    const player = { id: socket.id, nickname, color, avatar };
    rooms[code].players.push(player);
    socket.join(code);
    callback({ success: true, roomCode: code });
    io.to(code).emit("playerList", rooms[code].players);
  });

  socket.on("joinRoom", (code, nickname, color, avatar, callback) => {
    const room = rooms[code];
    if (!room || room.gameStarted) return callback({ success: false, error: "Pokój nie istnieje lub gra już trwa." });
    const player = { id: socket.id, nickname, color, avatar };
    room.players.push(player);
    socket.join(code);
    callback({ success: true });
    io.to(code).emit("playerList", room.players);
  });

  socket.on("startGame", code => {
    const room = rooms[code];
    if (!room || room.ownerId !== socket.id) return;
    startGame(code, room.forcedMode || "random");
  });

  socket.on("nextRound", (code, modeOverride) => {
    const room = rooms[code];
    if (!room || socket.id !== room.ownerId) return;
    if (modeOverride) room.forcedMode = modeOverride;
    startGame(code, room.forcedMode || "random");
  });

  socket.on("submitVote", (code, votedId) => {
    const room = rooms[code];
    if (!room) return;
    room.votes.push(votedId);
    if (room.votes.length >= room.players.length) {
      const voteCount = {};
      room.votes.forEach(v => voteCount[v] = (voteCount[v] || 0) + 1);
      const [votedOut] = Object.entries(voteCount).sort((a, b) => b[1] - a[1])[0];
      const target = room.players.find(p => p.id === votedOut);
      const impostors = room.players.filter(p => !p.knowsWord && !p.isKamikaze);
      let message = "";

      if (target && impostors.some(p => p.id === target.id)) {
        message = "✅ Impostor został wyrzucony!";
        room.players.forEach(p => {
          if (p.knowsWord && !p.isKamikaze) {
            room.scores[p.id] = (room.scores[p.id] || 0) + 1;
          }
        });
      } else {
        message = "❌ Impostor nie został wyrzucony.";
        impostors.forEach(p => {
          room.scores[p.id] = (room.scores[p.id] || 0) + 1;
        });
      }

      endRound(code, message);
    }
  });

  socket.on("guessWord", (code, guess) => {
    const room = rooms[code];
    if (!room || room.guessed) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.knowsWord) return;

    const correct = normalize(guess) === normalize(room.word);
    room.guessed = true;
    let message = "";

    if (correct) {
      room.scores[player.id] = (room.scores[player.id] || 0) + 1;
      message = `${player.nickname} odgadł hasło!`;
    } else {
      message = `${player.nickname} próbował odgadnąć hasło, ale się pomylił.`;
    }

    endRound(code, message);
  });

  socket.on("leaveRoom", (code) => {
    const room = rooms[code];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0 || room.ownerId === socket.id) {
      io.to(code).emit("forceLeave");
      delete rooms[code];
    } else {
      io.to(code).emit("playerList", room.players);
    }
  });

  socket.on("disconnect", () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.ownerId === socket.id) {
          io.to(code).emit("forceLeave");
          delete rooms[code];
        } else {
          io.to(code).emit("playerList", room.players);
        }
      }
    }
  });
});

function startGame(code, mode) {
  const room = rooms[code];
  if (!room) return;
  room.round++;
  room.votes = [];
  room.guessed = false;
  room.word = words[Math.floor(Math.random() * words.length)];
  room.gameStarted = true;

  const players = room.players;
  players.forEach(p => {
    p.knowsWord = true;
    p.isKamikaze = false;
  });

  let impostors = [];

  if (mode === "double") {
    impostors = randomSample(players, 2);
  } else if (mode === "chaos") {
    const count = Math.floor(Math.random() * (players.length - 1)) + 1;
    impostors = randomSample(players, count);
  } else {
    impostors = randomSample(players, 1);
  }

  impostors.forEach(p => p.knowsWord = false);

  if (mode === "kamikaze" && players.length > 3) {
    const kamikazeList = players.filter(p => p.knowsWord && !impostors.includes(p));
    const k = kamikazeList[Math.floor(Math.random() * kamikazeList.length)];
    if (k) k.isKamikaze = true;
  }

  players.forEach(p => {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      sock.emit("yourRole", {
        knowsWord: p.knowsWord,
        word: p.knowsWord ? room.word : null,
        isKamikaze: p.isKamikaze
      });
    }
  });

  io.to(code).emit("playerList", players);
}

function endRound(code, message) {
  const room = rooms[code];
  if (!room) return;

  const result = room.players.map(p => ({
    nickname: p.nickname,
    color: p.color,
    isImpostor: !p.knowsWord && !p.isKamikaze,
    isKamikaze: p.isKamikaze,
    score: room.scores[p.id] || 0,
    avatar: p.avatar
  }));

  io.to(code).emit("roundEnd", {
    message,
    round: room.round,
    players: result,
    mode: room.forcedMode || "random"
  });

  room.gameStarted = false;
  room.votes = [];
  room.guessed = false;
}

function randomSample(arr, n) {
  const copy = [...arr];
  const result = [];
  while (result.length < n && copy.length) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
