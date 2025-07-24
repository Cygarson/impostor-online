const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const wordList = ["pizza", "samochód", "komputer", "muzyka", "pies", "telefon", "chleb", "książka", "miasto", "pilot"];
const rooms = {};
const GameMode = { CLASSIC: 1, DOUBLE: 2, CHAOS: 3, CLASSIC_KAMIKAZE: 4 };

function normalize(str) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

io.on("connection", (socket) => {
    console.log("🔌 Połączono:", socket.id);

    socket.on("createRoom", (nickname, color, mode, avatar, callback) => {
        const code = Math.random().toString(36).slice(2, 6).toUpperCase();
        rooms[code] = {
            players: [],
            gameStarted: false,
            forcedMode: mode !== "random" ? mode : null,
            round: 0,
            scores: {},
            word: "",
            votes: [],
            guessed: false
        };
        rooms[code].players.push({ id: socket.id, nickname, color, avatar });
        socket.join(code);
        callback({ success: true, roomCode: code });
        io.to(code).emit("playerList", rooms[code].players);
    });

    socket.on("joinRoom", (code, nickname, color, avatar, callback) => {
        const room = rooms[code];
        if (!room) return callback({ success: false, error: "Nie ma pokoju." });
        if (room.gameStarted) return callback({ success: false, error: "Gra już trwa." });
        room.players.push({ id: socket.id, nickname, color, avatar });
        socket.join(code);
        callback({ success: true });
        io.to(code).emit("playerList", room.players);
    });

    socket.on("startGame", (code) => {
        const room = rooms[code];
        if (!room || room.players.length < 3) return;
        room.gameStarted = true;
        room.votes = [];
        room.guessed = false;
        room.word = wordList[Math.floor(Math.random() * wordList.length)];
        room.round++;

        const modeStr = room.forcedMode;
        const mode = modeStr === "classic" ? GameMode.CLASSIC :
                     modeStr === "double" ? GameMode.DOUBLE :
                     modeStr === "kamikaze" ? GameMode.CLASSIC_KAMIKAZE :
                     GameMode.CHAOS;

        const players = room.players.slice().sort(() => Math.random() - 0.5);
        const roles = {};
        let impostors = [], kamikazeId = null;

        if (mode === GameMode.CLASSIC) impostors = [players[0].id];
        else if (mode === GameMode.DOUBLE) impostors = [players[0].id, players[1].id];
        else if (mode === GameMode.CHAOS) {
            players.forEach(p => {
                const knows = Math.random() < 0.5;
                roles[p.id] = { knows };
                if (!knows) impostors.push(p.id);
            });
        } else if (mode === GameMode.CLASSIC_KAMIKAZE) {
            impostors = [players[0].id];
            const cand = players.slice(1);
            if (cand.length) kamikazeId = cand[Math.floor(Math.random() * cand.length)].id;
        }

        players.forEach(p => {
            const isImp = impostors.includes(p.id);
            const isKam = p.id === kamikazeId;
            const knows = (mode === GameMode.CHAOS ? roles[p.id].knows : isKam ? true : !isImp);

            p.knowsWord = knows;
            p.isKamikaze = isKam;

            const sock = io.sockets.sockets.get(p.id);
            if (sock) {
                sock.emit("yourRole", {
                    knowsWord: knows,
                    word: knows ? room.word : undefined,
                    isKamikaze: isKam
                });
            }
        });

        io.to(code).emit("playerList", players);
    });

    socket.on("submitVote", (code, votedId) => {
        const room = rooms[code];
        if (!room) return;

        room.votes.push(votedId);

        if (room.votes.length >= room.players.length) {
            const cnt = {};
            room.votes.forEach(id => cnt[id] = (cnt[id] || 0) + 1);
            const votedOut = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];

            const pl = room.players.find(p => p.id === votedOut);
            let msg = "";

            const isImpostor = (p) => !p.knowsWord && !p.isKamikaze;
            const isKamikaze = (p) => p.isKamikaze;

            if (pl && isImpostor(pl)) {
                msg = "✅ Impostor wykryty!";
                room.scores[pl.id] = (room.scores[pl.id] || 0) + 1;
            } else if (pl && isKamikaze(pl)) {
                msg = "💣 Kamikaze wykryty!";
            } else {
                msg = "❌ Głosowanie nie trafiło w impostora.";
            }

            const summary = room.players.map(p => ({
                nickname: p.nickname,
                color: p.color,
                isImpostor: isImpostor(p),
                isKamikaze: isKamikaze(p),
                score: room.scores[p.id] || 0,
                avatar: p.avatar || "alien.png"
            }));

            io.to(code).emit("roundEnd", {
                message: msg,
                round: room.round,
                players: summary
            });

            room.gameStarted = false;
            room.votes = [];
        }
    });

    socket.on("guessWord", (code, guess) => {
        const room = rooms[code], p = room.players.find(x => x.id === socket.id);
        if (!room || room.guessed || !p) return;

        const correct = normalize(guess) === normalize(room.word);
        if (correct) {
            room.scores[p.id] = (room.scores[p.id] || 0) + 1;
        }

        const summary = room.players.map(p => ({
            nickname: p.nickname,
            color: p.color,
            isImpostor: !p.knowsWord && !p.isKamikaze,
            isKamikaze: p.isKamikaze,
            score: room.scores[p.id] || 0,
            avatar: p.avatar || "alien.png"
        }));

        io.to(code).emit("roundEnd", {
            message: correct ? `${p.nickname} odgadł hasło!` : `${p.nickname} pomylił się.`,
            round: room.round,
            players: summary
        });

        room.gameStarted = false;
        room.votes = [];
        room.guessed = true;
    });

    socket.on("leaveRoom", (code) => {
        const room = rooms[code];
        if (!room) return;
        room.players = room.players.filter(p => p.id !== socket.id);
        socket.leave(code);
        io.to(code).emit("playerList", room.players);
    });

    socket.on("nextRound", (code) => {
        const room = rooms[code];
        if (room) {
            room.gameStarted = false;
            room.guessed = false;
            io.to(code).emit("playerList", room.players);
            setTimeout(() => {
                io.to(code).emit("startGameRequest");
            }, 1000);
        }
    });

    socket.on("disconnect", () => {
        for (const code in rooms) {
            const room = rooms[code];
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(code).emit("playerList", room.players);
        }
    });
});

server.listen(PORT, () => console.log(`✅ Serwer działa na porcie ${PORT}`));
