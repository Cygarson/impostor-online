// main.js
const socket = io("https://impostor-server-wmgt.onrender.com");
const app = document.getElementById("app");

let state = {
    nickname: "",
    color: "",
    roomCode: "",
    players: [],
    knowsWord: false,
    word: "",
    isKamikaze: false,
    voted: false,
    isImpostor: false,
    round: 0,
    scores: {},
    guessUsed: false,
    avatar: "",
    ownerId: "",
    currentMode: ""
};

const avatarList = ["alien.png", "bear.png", "cat.png", "frog.png", "koala.png", "robot.png"];

function renderLeaveButton() {
    return `<button id="leaveBtn" class="bg-red-500 mt-2">🚪 Opuść pokój</button>`;
}

function handleLeave() {
    socket.emit("leaveRoom", state.roomCode);
    location.reload();
}

function renderHome() {
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto">
      <h1 class="text-3xl font-bold mb-4">🎭 Impostor Online</h1>
      <input id="nickname" placeholder="Twoje imię" class="mb-2" />
      <div class="mb-2">Wybierz kolor:</div>
      <div class="flex justify-center mb-2 flex-wrap gap-2" id="colors">
        ${["red", "blue", "green", "yellow", "purple", "orange"].map(c => `
          <div class="w-8 h-8 rounded-full bg-${c}-500 cursor-pointer border-2" data-color="${c}"></div>
        `).join('')}
      </div>
      <div class="mb-2">Wybierz awatara:</div>
      <div class="flex justify-center mb-2 flex-wrap gap-2" id="avatars">
        ${avatarList.map(avatar => `
          <img src="avatars/${avatar}" data-avatar="${avatar}" class="w-10 h-10 rounded-full border-2 cursor-pointer" />
        `).join('')}
      </div>
      <select id="modeSelect" class="mb-2">
        <option value="random">🎲 Losowy</option>
        <option value="classic">🕵️ Klasyczny</option>
        <option value="double">🕵️🕵️ Podwójny</option>
        <option value="chaos">🤯 Chaos</option>
        <option value="kamikaze">💣 Kamikaze</option>
      </select>
      <button id="createBtn">Stwórz pokój</button>
      <input id="joinCode" placeholder="Kod pokoju" class="mt-2" />
      <button id="joinBtn">Dołącz</button>
    </div>
  `;

    state.avatar = avatarList[0];

    document.querySelectorAll("[data-color]").forEach(el => {
        el.addEventListener("click", () => {
            state.color = el.dataset.color;
            document.querySelectorAll("[data-color]").forEach(e => e.classList.remove("ring-4", "ring-white"));
            el.classList.add("ring-4", "ring-white");
        });
    });

    document.querySelectorAll("[data-avatar]").forEach(el => {
        el.addEventListener("click", () => {
            state.avatar = el.dataset.avatar;
            document.querySelectorAll("[data-avatar]").forEach(e => e.classList.remove("ring-4", "ring-green-400"));
            el.classList.add("ring-4", "ring-green-400");
        });
    });

    document.getElementById("createBtn").onclick = () => {
        const nickname = document.getElementById("nickname").value.trim();
        const selectedMode = document.getElementById("modeSelect").value;
        if (!nickname || !state.color) return alert("Wpisz imię i wybierz kolor!");
        state.nickname = nickname;
        socket.emit("createRoom", nickname, state.color, selectedMode, state.avatar, (res) => {
            if (res.success) {
                state.roomCode = res.roomCode;
                state.ownerId = socket.id;
                state.currentMode = selectedMode;
                renderLobby();
            } else alert(res.error);
        });
    };

    document.getElementById("joinBtn").onclick = () => {
        const nickname = document.getElementById("nickname").value.trim();
        const code = document.getElementById("joinCode").value.trim().toUpperCase();
        if (!nickname || !state.color || !code) return alert("Uzupełnij wszystkie dane!");
        state.nickname = nickname;
        state.roomCode = code;
        socket.emit("joinRoom", code, nickname, state.color, state.avatar, (res) => {
            if (res.success) renderLobby();
            else alert(res.error);
        });
    };
}

function renderLobby() {
    socket.emit("getPlayers", state.roomCode);
    app.innerHTML = `
      <div class="text-center max-w-md mx-auto">
        <h2 class="text-xl font-bold mb-2">Kod pokoju: ${state.roomCode}</h2>
        <p class="mb-4">Czekanie na graczy...</p>
        <ul id="playerList" class="mb-4"></ul>
        ${socket.id === state.ownerId ? '<button id="startBtn">▶️ Start</button>' : ""}
        ${renderLeaveButton()}
      </div>
    `;
    document.getElementById("leaveBtn").onclick = handleLeave;

    if (socket.id === state.ownerId) {
        document.getElementById("startBtn").onclick = () => {
            socket.emit("startGame", state.roomCode);
        };
    }
}

function renderPlayerList(players) {
    const list = document.getElementById("playerList");
    if (!list) return;
    list.innerHTML = players.map(p => `
        <li class="text-${p.color}-400 font-bold">${p.nickname}</li>
    `).join('');
}

function renderRole() {
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto">
      <h2 class="text-xl font-bold mb-4">🎭 Twoja rola:</h2>
      <p class="text-2xl mb-2 font-bold text-${state.color}-400">${state.isImpostor ? "IMPOSTOR" : state.isKamikaze ? "KAMIKAZE" : "NIEWINNY"}</p>
      <p class="mb-2">${state.isImpostor ? "Spróbuj zgadnąć hasło!" : "Twoje hasło to: " + state.word}</p>
      ${state.isImpostor ? '<button id="guessBtn" class="bg-yellow-500">Zgadnij hasło</button>' : ""}
      ${renderLeaveButton()}
    </div>
  `;
    document.getElementById("leaveBtn").onclick = handleLeave;
    if (state.isImpostor) {
        document.getElementById("guessBtn").onclick = () => {
            const guess = prompt("Podaj swoje hasło:");
            if (guess) socket.emit("guessWord", state.roomCode, guess);
        };
    }
}

function renderVoting(players) {
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto">
      <h2 class="text-xl font-bold mb-2">🗳️ Głosowanie</h2>
      <p class="mb-4">Wybierz gracza, którego chcesz wyrzucić:</p>
      <ul class="mb-4">
        ${players.map(p => `
          <li class="mb-2">
            <button data-id="${p.id}" class="voteBtn bg-${p.color}-500">${p.nickname}</button>
          </li>
        `).join('')}
      </ul>
      ${renderLeaveButton()}
    </div>
  `;
    document.querySelectorAll(".voteBtn").forEach(btn => {
        btn.onclick = () => {
            socket.emit("submitVote", state.roomCode, btn.dataset.id);
        };
    });
    document.getElementById("leaveBtn").onclick = handleLeave;
}

function modeLabel(mode) {
    return {
        classic: "Klasyczny",
        double: "Podwójny",
        chaos: "Chaos",
        kamikaze: "Kamikaze"
    }[mode] || "Losowy";
}

socket.on("playerList", players => {
    state.players = players;
    renderPlayerList(players);
});

socket.on("yourRole", ({ role, word }) => {
    state.isImpostor = role === "impostor";
    state.isKamikaze = role === "kamikaze";
    state.knowsWord = !state.isImpostor;
    state.word = word;
    renderRole();
});

socket.on("voting", players => {
    renderVoting(players);
});

socket.on("roundEnd", ({ message, round, players, mode }) => {
    state.round = round;
    state.scores = {};
    state.currentMode = mode;
    players.forEach(p => state.scores[p.nickname] = p.score);
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto">
      <h2 class="text-xl font-bold mb-2">🏁 Runda ${round} zakończona</h2>
      <p class="mb-2">${message}</p>
      <h3 class="text-md font-medium mb-1">🎮 Tryb gry: ${modeLabel(mode)}</h3>
      <h3 class="text-lg font-semibold">🎯 Punktacja:</h3>
      <ul class="mb-4">
        ${players.map(p => `
          <li class="text-${p.color}-400 text-lg font-bold">
            <img src="avatars/${p.avatar || 'alien.png'}" class="inline w-6 h-6 mr-2" />
            ${p.nickname}: ${p.score} pkt – ${p.isImpostor ? "Impostor" : p.isKamikaze ? "Kamikaze" : "Niewinny"}
          </li>
        `).join('')}
      </ul>
      ${socket.id === state.ownerId ? '<button id="nextBtn" class="bg-green-600">Graj dalej</button>' : '<p class="text-gray-500">Czekaj na decyzję właściciela pokoju...</p>'}
      ${renderLeaveButton()}
    </div>
  `;
    const nextBtn = document.getElementById("nextBtn");
    if (nextBtn) {
        nextBtn.onclick = () => {
            socket.emit("nextRound", state.roomCode);
        };
    }
    document.getElementById("leaveBtn").onclick = handleLeave;
});

renderHome();
