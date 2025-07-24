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

const rooms = {};
const wordList = ["pizza", "samochód", "komputer", "muzyka", "pies", "telefon", "chleb", "książka", "miasto", "pilot"];

const GameMode = {
    CLASSIC: 1,
    DOUBLE: 2,
    CHAOS: 3,
    ALL_IMPOSTORS: 4,
    ALL_KNOW: 5,
    CLASSIC_KAMIKAZE: 6
};

function getRandomGameMode(playerCount) {
    const modes = [GameMode.CLASSIC, GameMode.CHAOS, GameMode.ALL_KNOW, GameMode.ALL_IMPOSTORS];
    if (playerCount >= 4) modes.push(GameMode.DOUBLE);
    modes.push(GameMode.CLASSIC_KAMIKAZE);
    return modes[Math.floor(Math.random() * modes.length)];
}

function convertModeStringToEnum(str) {
    switch (str) {
        case "classic": return GameMode.CLASSIC;
        case "double": return GameMode.DOUBLE;
        case "chaos": return GameMode.CHAOS;
        case "all_impostors": return GameMode.ALL_IMPOSTORS;
        case "all_know": return GameMode.ALL_KNOW;
        case "kamikaze": return GameMode.CLASSIC_KAMIKAZE;
        default: return null;
    }
}

io.on("connection", (socket) => {
    console.log("Połączono:", socket.id);

    socket.on("createRoom", (nickname, color, mode, callback) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            players: [],
            gameStarted: false,
            forcedMode: mode !== "random" ? mode : null,
            votes: []
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
        if (room.gameStarted) return callback({ success: false, error: "Gra już się rozpoczęła." });

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

        const players = room.players;
        const secretWord = wordList[Math.floor(Math.random() * wordList.length)];
        const mode = room.forcedMode
            ? convertModeStringToEnum(room.forcedMode)
            : getRandomGameMode(players.length);

        const shuffled = [...players].sort(() => Math.random() - 0.5);
        const roles = {};
        let kamikazeId = null;

        if (mode === GameMode.CLASSIC) {
            roles[shuffled[0].id] = { knowsWord: false };
            for (let i = 1; i < players.length; i++) roles[shuffled[i].id] = { knowsWord: true };
        } else if (mode === GameMode.DOUBLE) {
            roles[shuffled[0].id] = roles[shuffled[1].id] = { knowsWord: false };
            for (let i = 2; i < players.length; i++) roles[shuffled[i].id] = { knowsWord: true };
        } else if (mode === GameMode.ALL_IMPOSTORS) {
            players.forEach(p => roles[p.id] = { knowsWord: false });
        } else if (mode === GameMode.ALL_KNOW) {
            players.forEach(p => roles[p.id] = { knowsWord: true });
        } else if (mode === GameMode.CHAOS) {
            players.forEach(p => roles[p.id] = { knowsWord: Math.random() < 0.5 });
        } else if (mode === GameMode.CLASSIC_KAMIKAZE) {
            roles[shuffled[0].id] = { knowsWord: false };
            for (let i = 1; i < players.length; i++) roles[shuffled[i].id] = { knowsWord: true };
            if (Math.random() < 0.2) {
                const innocent = shuffled.slice(1);
                kamikazeId = innocent[Math.floor(Math.random() * innocent.length)].id;
            }
        }

        players.forEach(p => {
            const role = roles[p.id];
            const socketPlayer = io.sockets.sockets.get(p.id);
            p.knowsWord = role.knowsWord;
            if (socketPlayer) {
                socketPlayer.emit("yourRole", {
                    knowsWord: role.knowsWord,
                    word: role.knowsWord ? secretWord : undefined,
                    isKamikaze: p.id === kamikazeId
                });
            }
        });
    });

    socket.on("submitVote", (roomCode, votedId) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.votes.push(votedId);

        if (room.votes.length >= room.players.length) {
            const counts = {};
            room.votes.forEach(id => {
                counts[id] = (counts[id] || 0) + 1;
            });
            const [votedOutId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            const player = room.players.find(p => p.id === votedOutId);

            io.to(roomCode).emit("voteResults", {
                votedOut: {
                    nickname: player.nickname,
                    color: player.color,
                    knowsWord: player.knowsWord
                }
            });

            room.votes = [];
            room.gameStarted = false;
        }
    });

    socket.on("disconnect", () => {
        for (const code in rooms) {
            const room = rooms[code];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(code).emit("playerList", room.players);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`✅ Serwer działa na porcie ${PORT}`);
});
