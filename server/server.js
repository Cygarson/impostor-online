
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const rooms = {};

function getRandomWord() {
  const words = ["pizza", "kot", "rower", "krokodyl", "programista", "muzyka"];
  return words[Math.floor(Math.random() * words.length)];
}

function getRandomMode(numPlayers) {
  if (numPlayers >= 4 && Math.random() < 0.3) return "DOUBLE_IMPOSTOR";
  if (Math.random() < 0.1) return "ALL_IMPOSTORS";
  if (Math.random() < 0.1) return "ALL_KNOW_WORD";
  if (Math.random() < 0.1) return "CHAOS_RANDOM";
  return "CLASSIC_ONE_IMPOSTOR";
}

io.on("connection", (socket) => {
  socket.on("createRoom", (nickname, color, callback) => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomCode] = {
      players: [],
      started: false,
      votes: {},
    };
    joinRoom(socket, roomCode, nickname, color, callback);
  });

  socket.on("joinRoom", (roomCode, nickname, color, callback) => {
    if (!rooms[roomCode]) {
      callback({ success: false, error: "Pokój nie istnieje" });
      return;
    }
    joinRoom(socket, roomCode, nickname, color, callback);
  });

  function joinRoom(socket, roomCode, nickname, color, callback) {
    socket.join(roomCode);
    const player = { id: socket.id, nickname, color, knowsWord: false };
    rooms[roomCode].players.push(player);
    io.to(roomCode).emit("playerList", rooms[roomCode].players);
    callback({ success: true, roomCode });
  }

  socket.on("startGame", (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.started) return;

    const players = room.players;
    const word = getRandomWord();
    const mode = getRandomMode(players.length);

    let shuffled = [...players].sort(() => 0.5 - Math.random());

    switch (mode) {
      case "CLASSIC_ONE_IMPOSTOR":
        shuffled[0].knowsWord = false;
        shuffled.slice(1).forEach(p => p.knowsWord = true);
        break;
      case "DOUBLE_IMPOSTOR":
        shuffled.slice(0, 2).forEach(p => p.knowsWord = false);
        shuffled.slice(2).forEach(p => p.knowsWord = true);
        break;
      case "ALL_IMPOSTORS":
        players.forEach(p => p.knowsWord = false);
        break;
      case "ALL_KNOW_WORD":
        players.forEach(p => p.knowsWord = true);
        break;
      case "CHAOS_RANDOM":
        players.forEach(p => p.knowsWord = Math.random() < 0.5);
        break;
    }

    room.started = true;
    room.secretWord = word;
    room.votes = {};

    players.forEach(p => {
      io.to(p.id).emit("yourRole", {
        knowsWord: p.knowsWord,
        word: p.knowsWord ? word : null,
      });
    });

    io.to(roomCode).emit("gameStarted");
  });

  socket.on("submitVote", (roomCode, votedId) => {
    const room = rooms[roomCode];
    if (!room || !room.started) return;
    room.votes[socket.id] = votedId;

    if (Object.keys(room.votes).length === room.players.length) {
      const voteCounts = {};
      Object.values(room.votes).forEach(id => {
        voteCounts[id] = (voteCounts[id] || 0) + 1;
      });

      const [mostVoted] = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0];
      const votedPlayer = room.players.find(p => p.id === mostVoted);

      io.to(roomCode).emit("voteResults", {
        votedOut: votedPlayer,
        allVotes: room.votes,
      });

      room.started = false;
    }
  });

  socket.on("disconnect", () => {
    for (const [roomCode, room] of Object.entries(rooms)) {
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) delete rooms[roomCode];
      else io.to(roomCode).emit("playerList", room.players);
    }
  });
});

server.listen(3000, () => {
  console.log("Serwer działa na http://localhost:3000");
});
