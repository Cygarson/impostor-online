const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
    cors: { origin: "*" },
});

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const rooms = {};

function isImpostor(player) {
    return player.role === "impostor";
}

function startGame(room) {
    room.round = 1;
    room.started = true;

    // Inicjalizuj punkty tylko jeśli nie istnieją
    room.players.forEach((p) => {
        if (typeof p.score !== "number") p.score = 0;
        p.role = "crewmate";
    });

    // Przykładowo przypisz pierwszego gracza na impostora
    if (room.players.length > 0) {
        room.players[0].role = "impostor";
    }

    io.to(room.id).emit("gameStarted", {
        round: room.round,
        players: room.players.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            score: p.score,
        })),
    });
}

function submitVote(room, voterId, votedId) {
    const voter = room.players.find((p) => p.id === voterId);
    const voted = room.players.find((p) => p.id === votedId);
    if (!voter || !voted) return;

    let message = "";

    if (isImpostor(voted)) {
        message = "✅ Impostor wykryty!";
        if (room.forcedMode === "double") {
            room.players.forEach((p) => {
                if (p.id !== voted.id && isImpostor(p)) p.score = (p.score || 0) + 1;
                if (!isImpostor(p)) p.score = (p.score || 0) + 1;
            });
        } else {
            room.players.forEach((p) => {
                if (!isImpostor(p)) p.score = (p.score || 0) + 1;
            });
        }
    } else {
        message = "❌ Niewłaściwy wybór!";
        room.players.forEach((p) => {
            if (isImpostor(p)) p.score = (p.score || 0) + 1;
        });
    }

    io.to(room.id).emit("voteResult", {
        message,
        scores: room.players.map((p) => ({
            id: p.id,
            score: p.score || 0,
        })),
    });
}

function guessWord(room, playerId, guessedWord) {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    if (player.role === "impostor") {
        if (guessedWord.toLowerCase() === room.word.toLowerCase()) {
            player.score = (player.score || 0) + 1;
            io.to(room.id).emit("guessResult", {
                correct: true,
                playerId,
                scores: room.players.map((p) => ({
                    id: p.id,
                    score: p.score || 0,
                })),
            });
        } else {
            room.players.forEach((p) => {
                if (!isImpostor(p)) p.score = (p.score || 0) + 1;
            });
            io.to(room.id).emit("guessResult", {
                correct: false,
                playerId,
                scores: room.players.map((p) => ({
                    id: p.id,
                    score: p.score || 0,
                })),
            });
        }
    }
}

function roundEnd(room) {
    const summary = room.players.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        score: p.score || 0,
    }));

    io.to(room.id).emit("roundSummary", summary);

    room.round++;
    room.players.forEach((p) => {
        p.role = null;
    });
}

io.on("connection", (socket) => {
    socket.on("joinRoom", ({ roomId, playerName }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                started: false,
                round: 0,
                forcedMode: null,
                word: "example", // przykładowe hasło, możesz ustawić losowo
            };
        }
        const room = rooms[roomId];

        if (room.started) {
            socket.emit("roomStarted");
            return;
        }

        const newPlayer = {
            id: socket.id,
            name: playerName,
            score: 0,
            role: null,
        };

        room.players.push(newPlayer);
        socket.join(roomId);

        io.to(roomId).emit("roomUpdate", room.players);
    });

    socket.on("startGame", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.started) return;

        startGame(room);
    });

    socket.on("submitVote", ({ roomId, votedId }) => {
        const room = rooms[roomId];
        if (!room) return;

        submitVote(room, socket.id, votedId);
    });

    socket.on("guessWord", ({ roomId, word }) => {
        const room = rooms[roomId];
        if (!room) return;

        guessWord(room, socket.id, word);
    });

    socket.on("roundEnd", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        roundEnd(room);
    });

    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const idx = room.players.findIndex((p) => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                io.to(roomId).emit("roomUpdate", room.players);

                if (room.players.length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
    });
});

http.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
