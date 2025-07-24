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

function modeLabel(mode) {
    return {
        classic: "Klasyczny",
        double: "Podwójny",
        chaos: "Chaos",
        kamikaze: "Kamikaze"
    }[mode] || "Losowy";
}

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
        if (!nickname || !state.color) return alert("Wpisz imię i wybierz kolor!");
        state.nickname = nickname;
        socket.emit("createRoom", nickname, state.color, state.avatar, (res) => {
            if (res.success) {
                state.roomCode = res.roomCode;
                state.ownerId = socket.id;
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
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto">
      <h2 class="text-2xl font-bold mb-4">Pokój: ${state.roomCode}</h2>
      <div class="flex justify-between items-center mb-4">
        <span class="text-lg">👥 Graczy: ${state.players.length}</span>
        ${socket.id === state.ownerId ? `
          <select id="modeSelect" class="text-black text-base font-semibold bg-white px-3 py-2 rounded w-full max-w-xs">
            <option value="random">🎲 Losowy</option>
            <option value="classic">🕵️ Klasyczny</option>
            <option value="double">🕵️🕵️ Podwójny</option>
            <option value="chaos">🤯 Chaos</option>
            <option value="kamikaze">💣 Kamikaze</option>
          </select>` : ""}
      </div>
      <div id="playerList" class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-left px-2"></div>
      ${socket.id === state.ownerId ? '<button id="startBtn">Rozpocznij grę</button>' : '<p class="text-gray-400">Czekaj na rozpoczęcie gry...</p>'}
      ${renderLeaveButton()}
    </div>
  `;

    const btn = document.getElementById("startBtn");
    if (btn) btn.onclick = () => {
        if (state.players.length < 2) {
            alert("❗ Musisz mieć co najmniej 2 graczy, aby rozpocząć grę.");
            return;
        }
        const modeSelect = document.getElementById("modeSelect");
        const selectedMode = modeSelect ? modeSelect.value : "random";
        state.currentMode = selectedMode;
        socket.emit("startGame", state.roomCode, selectedMode);
    };

    document.getElementById("leaveBtn").onclick = handleLeave;
    renderPlayerList(state.players);
}

function renderPlayerList(players) {
    state.players = players;
    const list = document.getElementById("playerList");
    if (!list) return;
    list.innerHTML = players.map(p => `
    <div class="flex items-center gap-2">
      <img src="avatars/${p.avatar || 'alien.png'}" alt="avatar" class="w-8 h-8 rounded-full border" />
      <span class="text-${p.color}-400 font-semibold">${p.nickname}</span>
    </div>
  `).join('');
    const owner = players[0];
    state.ownerId = owner?.id;
}

socket.on("playerList", players => {
    state.players = players;
    renderPlayerList(players);
    if (document.getElementById("playerList")) {
        renderLobby(); // odśwież lobby, jeśli aktywne
    }
});

socket.on("forceLeave", () => {
    alert("👑 Właściciel pokoju opuścił grę. Zostajesz przeniesiony na stronę główną.");
    location.reload();
});

socket.on("yourRole", ({ knowsWord, word, isKamikaze }) => {
    state.knowsWord = knowsWord;
    state.word = word;
    state.isKamikaze = isKamikaze || false;
    state.isImpostor = !knowsWord && !isKamikaze;
    state.voted = false;
    state.guessUsed = false;
    renderRole();
});

function renderRole() {
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto">
      <h2 class="text-2xl font-bold mb-4">Twoja rola</h2>
      ${state.knowsWord ? `<p class="mb-2">✅ Znasz hasło:</p><p class="text-xl font-mono mb-4">"${state.word}"</p>` : ``}
      ${state.isImpostor ? `<p class="text-red-500 font-bold mb-4">🚨 Jesteś impostorem!</p>` : ``}
      ${state.isKamikaze ? `<p class="text-yellow-400 font-bold mb-4">💣 Kamikaze – blefuj jak impostor.</p>` : ``}
      <button class="bg-blue-500" id="continueBtn">Rozpocznij głosowanie</button>
      ${state.isImpostor && !state.guessUsed ? `
        <input id="guessInput" placeholder="Zgadnij hasło" class="mt-4 text-black" />
        <button id="guessBtn" class="bg-yellow-500">Zgłoś hasło</button>
      ` : ``}
      ${renderLeaveButton()}
    </div>
  `;
    document.getElementById("continueBtn").onclick = renderVoting;
    document.getElementById("leaveBtn").onclick = handleLeave;

    if (state.isImpostor && !state.guessUsed) {
        document.getElementById("guessBtn").onclick = () => {
            const guess = document.getElementById("guessInput").value.trim();
            if (!guess) return;
            socket.emit("guessWord", state.roomCode, guess);
            state.guessUsed = true;
        };
    }
}

function renderVoting() {
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto">
      <h2 class="text-xl font-bold mb-2">🗳️ Głosuj na impostora</h2>
      <div id="voteList" class="grid grid-cols-2 gap-2 mb-4"></div>
      ${state.isImpostor && !state.guessUsed ? `
        <input id="guessInput" placeholder="Zgadnij hasło" class="mb-2 text-black" />
        <button id="guessBtn" class="bg-yellow-500">Zgłoś hasło</button>
      ` : ``}
      ${renderLeaveButton()}
    </div>
  `;

    const list = document.getElementById("voteList");
    list.innerHTML = state.players
        .filter(p => p.id !== socket.id)
        .map(p => `
        <button class="bg-${p.color}-500 rounded px-4 py-2 text-white" data-id="${p.id}">
          <img src="avatars/${p.avatar || 'alien.png'}" class="w-5 h-5 inline mr-2" /> ${p.nickname}
        </button>
      `).join('');

    document.querySelectorAll("[data-id]").forEach(btn => {
        btn.onclick = () => {
            if (state.voted) return;
            state.voted = true;
            socket.emit("submitVote", state.roomCode, btn.dataset.id);
            app.innerHTML = `<p class="text-center text-lg">🕐 Czekamy na głosy pozostałych graczy.</p>`;
        };
    });

    document.getElementById("leaveBtn").onclick = handleLeave;

    if (state.isImpostor && !state.guessUsed) {
        document.getElementById("guessBtn").onclick = () => {
            const guess = document.getElementById("guessInput").value.trim();
            if (!guess) return;
            socket.emit("guessWord", state.roomCode, guess);
            state.guessUsed = true;
        };
    }
}

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
      ${socket.id === state.ownerId ? `
        <label for="modeSelect" class="block mb-2 font-medium">Zmień tryb gry:</label>
        <select id="modeSelect" class="mb-4 bg-white text-black font-semibold px-3 py-2 rounded">
          <option value="classic">🕵️ Klasyczny</option>
          <option value="double">🕵️🕵️ Podwójny</option>
          <option value="chaos">🤯 Chaos</option>
          <option value="kamikaze">💣 Kamikaze</option>
        </select>
        <button id="nextBtn" class="bg-green-600">Graj dalej</button>` :
            '<p class="text-gray-500">Czekaj na decyzję właściciela pokoju...</p>'}
      ${renderLeaveButton()}
    </div>
  `;

    if (socket.id === state.ownerId) {
        document.getElementById("nextBtn").onclick = () => {
            const selectedMode = document.getElementById("modeSelect").value;
            state.currentMode = selectedMode;
            socket.emit("nextRound", state.roomCode, selectedMode);
        };
    }

    document.getElementById("leaveBtn").onclick = handleLeave;
});

socket.on("startGameRequest", () => {
    socket.emit("startGame", state.roomCode, state.currentMode);
});

renderHome();
