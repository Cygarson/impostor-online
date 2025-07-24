// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const wordList = ["pizza", "samochód", "komputer", "muzyka", "pies", "telefon", "chleb", "książka", "miasto", "pilot"];

const rooms = {};
const GameMode = {
  CLASSIC: 1,
  DOUBLE: 2,
  CHAOS: 3,
  CLASSIC_KAMIKAZE: 4
};

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e")
    .replace(/ł/g, "l").replace(/ń/g, "n").replace(/ó/g, "o")
    .replace(/ś/g, "s").replace(/ź/g, "z").replace(/ż/g, "z");
}

io.on("connection", (socket) => {
  console.log("🔌 Połączono:", socket.id);

  socket.on("createRoom", (nickname, color, mode, callback) => {
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    rooms[roomCode] = {
      players: [],
      gameStarted: false,
      forcedMode: mode !== "random" ? mode : null,
      round: 0,
      scores: {},
      word: "",
      votes: [],
      guessed: false
    };
    const player = { id: socket.id, nickname, color };
    rooms[roomCode].players.push(player);
    socket.join(roomCode);
    callback({ success: true, roomCode });
    io.to(roomCode).emit("playerList", rooms[roomCode].players);
  });

  socket.on("joinRoom", (roomCode, nickname, color, callback) => {
    const room = rooms[roomCode];
    if (!room) return callback({ success: false, error: "Nie ma takiego pokoju." });
    if (room.gameStarted) return callback({ success: false, error: "Gra już trwa." });

    const player = { id: socket.id, nickname, color };
    room.players.push(player);
    socket.join(roomCode);
    callback({ success: true });
    io.to(roomCode).emit("playerList", room.players);
  });

  socket.on("startGame", (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.players.length < 3) return;
    room.gameStarted = true;
    room.votes = [];
    room.guessed = false;
    room.word = wordList[Math.floor(Math.random() * wordList.length)];
    room.round++;
    const mode = room.forcedMode === "classic" ? GameMode.CLASSIC :
                 room.forcedMode === "double" ? GameMode.DOUBLE :
                 room.forcedMode === "kamikaze" ? GameMode.CLASSIC_KAMIKAZE :
                 GameMode.CHAOS;

    const players = room.players;
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const roles = {};
    let impostors = [];
    let kamikazeId = null;

    if (mode === GameMode.CLASSIC) {
      impostors = [shuffled[0].id];
    } else if (mode === GameMode.DOUBLE) {
      impostors = [shuffled[0].id, shuffled[1].id];
    } else if (mode === GameMode.CHAOS) {
      players.forEach(p => {
        const knowsWord = Math.random() < 0.5;
        roles[p.id] = { knowsWord };
        if (!knowsWord) impostors.push(p.id);
      });
    } else if (mode === GameMode.CLASSIC_KAMIKAZE) {
      impostors = [shuffled[0].id];
      const candidates = shuffled.slice(1);
      kamikazeId = candidates[Math.floor(Math.random() * candidates.length)].id;
    }

    players.forEach(p => {
      const isImpostor = impostors.includes(p.id);
      const isKamikaze = p.id === kamikazeId;
      const knowsWord =
        mode === GameMode.CHAOS ? roles[p.id].knowsWord :
        isKamikaze ? true :
        !isImpostor;

      p.knowsWord = knowsWord;
      p.isImpostor = isImpostor;
      p.isKamikaze = isKamikaze;
      p.guessUsed = false;

      const sock = io.sockets.sockets.get(p.id);
      if (sock) {
        sock.emit("yourRole", {
          knowsWord,
          word: knowsWord ? room.word : undefined,
          isKamikaze
        });
      }
    });

    io.to(roomCode).emit("playerList", players);
  });

  socket.on("submitVote", (roomCode, votedId) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.votes.push(votedId);

    if (room.votes.length >= room.players.length) {
      const tally = {};
      for (const id of room.votes) tally[id] = (tally[id] || 0) + 1;
      const [votedOutId] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      const votedPlayer = room.players.find(p => p.id === votedOutId);

      let message = "";
      if (votedPlayer.isKamikaze) {
        room.scores[votedOutId] = (room.scores[votedOutId] || 0) + 1;
        message = "💣 Kamikaze wygrał rundę!";
      } else if (votedPlayer.isImpostor) {
        room.scores[votedOutId] = (room.scores[votedOutId] || 0) + 1;
        message = "✅ Impostor został wykryty!";
      } else {
        message = "❌ Niewinny został przegłosowany.";
      }

      const summary = room.players.map(p => ({
        nickname: p.nickname,
        color: p.color,
        isImpostor: p.isImpostor,
        isKamikaze: p.isKamikaze,
        score: room.scores[p.id] || 0
      }));

      io.to(roomCode).emit("roundEnd", {
        message,
        round: room.round,
        players: summary
      });

      room.gameStarted = false;
      room.votes = [];
    }
  });

  socket.on("guessWord", (roomCode, guess, callback) => {
    const room = rooms[roomCode];
    if (!room || room.guessed) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isImpostor || player.guessUsed) return;

    player.guessUsed = true;
    const correct = normalize(guess) === normalize(room.word);
    if (correct) {
      room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
    }

    const summary = room.players.map(p => ({
      nickname: p.nickname,
      color: p.color,
      isImpostor: p.isImpostor,
      isKamikaze: p.isKamikaze,
      score: room.scores[p.id] || 0
    }));

    io.to(roomCode).emit("roundEnd", {
      message: correct
        ? `${player.nickname} odgadł hasło i wygrał rundę!`
        : `${player.nickname} próbował odgadnąć hasło i się pomylił.`,
      round: room.round,
      players: summary
    });

    room.guessed = true;
    room.gameStarted = false;
    room.votes = [];
  });

  socket.on("nextRound", (roomCode) => {
    const room = rooms[roomCode];
    if (room) {
      room.gameStarted = false;
      room.votes = [];
      room.guessed = false;
      io.to(roomCode).emit("playerList", room.players);
    }
  });

  socket.on("disconnect", () => {
    for (const code in rooms) {
      const room = rooms[code];
      const i = room.players.findIndex(p => p.id === socket.id);
      if (i !== -1) {
        room.players.splice(i, 1);
        io.to(code).emit("playerList", room.players);
      }
    }
  });
});

server.listen(PORT, () => console.log(`✅ Serwer działa na porcie ${PORT}`));
