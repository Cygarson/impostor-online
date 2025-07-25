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
    currentMode: "",
    speakOrder: [],
    roleVisible: true
};

const avatarList = ["alien.png", "bear.png", "cat.png", "frog.png", "koala.png", "robot.png"];

function renderLeaveButton() {
    return `<button id="leaveBtn" class="bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded mt-2">🚪 Opuść pokój</button>`;
}

function handleLeave() {
    socket.emit("leaveRoom", state.roomCode);
    location.reload();
}

function renderHome() {
    app.innerHTML = `
    <div class="text-center max-w-lg mx-auto">
      <h1 class="text-3xl font-bold mb-4">🎭 Impostor Online</h1>
      <input id="nickname" placeholder="Twoje imię" class="mb-2 w-full p-2 rounded border border-amber-300 bg-amber-50 text-amber-800" />
      <div class="mb-2 text-amber-200">Wybierz kolor:</div>
      <div class="flex justify-center mb-2 flex-wrap gap-2" id="colors">
        ${["red", "blue", "green", "yellow", "purple", "rose"].map(c => `
          <div class="w-8 h-8 rounded-full bg-${c}-500 cursor-pointer border-2 border-white hover:border-amber-300" data-color="${c}"></div>
        `).join('')}
      </div>
      <div class="mb-2 text-amber-200">Wybierz awatara:</div>
      <div class="flex justify-center mb-2 flex-wrap gap-2" id="avatars">
        ${avatarList.map(avatar => `
          <img src="avatars/${avatar}" data-avatar="${avatar}" class="w-10 h-10 rounded-full border-2 border-amber-300 cursor-pointer hover:border-rose-400" />
        `).join('')}
      </div>
      <button id="createBtn" class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded w-full mb-2">
        Stwórz pokój
      </button>
      <div class="flex gap-2 mt-4">
        <input id="joinCode" placeholder="Kod pokoju" class="flex-grow p-2 rounded border border-amber-300 bg-amber-50 text-amber-800" />
        <button id="joinBtn" class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded">
          Dołącz
        </button>
      </div>
    </div>
  `;

    state.avatar = avatarList[0];

    document.querySelectorAll("[data-color]").forEach(el => {
        el.addEventListener("click", () => {
            state.color = el.dataset.color;
            document.querySelectorAll("[data-color]").forEach(e => e.classList.remove("ring-4", "ring-amber-300"));
            el.classList.add("ring-4", "ring-amber-300");
        });
    });

    document.querySelectorAll("[data-avatar]").forEach(el => {
        el.addEventListener("click", () => {
            state.avatar = el.dataset.avatar;
            document.querySelectorAll("[data-avatar]").forEach(e => e.classList.remove("ring-4", "ring-rose-400"));
            el.classList.add("ring-4", "ring-rose-400");
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
    <div class="text-center max-w-lg mx-auto">
      <h2 class="text-2xl font-bold mb-4 text-amber-300">Pokój: ${state.roomCode}</h2>
      <div class="flex justify-between items-center mb-4">
        <span id="playerCounter" class="text-amber-200">👥 Graczy: ${state.players.length}</span>
        ${socket.id === state.ownerId ? `
          <select id="modeSelect" class="bg-amber-700 text-amber-100 border border-amber-500 rounded px-2 py-1">
            <option value="random">🎲 Losowy</option>
            <option value="classic">🕵️ Klasyczny</option>
            <option value="double">🕵️🕵️ Podwójny</option>
            <option value="chaos">🤯 Chaos</option>
            <option value="kamikaze">💣 Kamikaze</option>
          </select>` : ""}
      </div>
      <div id="playerList" class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-left px-2"></div>
      ${socket.id === state.ownerId ?
            '<button id="startBtn" class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded w-full">Rozpocznij grę</button>' :
            '<p class="text-amber-400">Czekaj na rozpoczęcie gry...</p>'}
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
    <div class="flex items-center gap-2 bg-amber-800 p-2 rounded-lg">
      <img src="avatars/${p.avatar || 'alien.png'}" alt="avatar" class="w-8 h-8 rounded-full border border-amber-400" />
      <span class="text-${p.color}-400 font-semibold">${p.nickname}</span>
    </div>
  `).join('');
}

socket.on("playerList", players => {
    state.players = players;
    if (document.getElementById("playerList")) {
        renderPlayerList(players);
        const counter = document.querySelector("#playerCounter");
        if (counter) counter.textContent = `👥 Graczy: ${players.length}`;
    }
});

socket.on("forceLeave", () => {
    alert("👑 Właściciel pokoju opuścił grę. Zostajesz przeniesiony na stronę główną.");
    location.reload();
});

socket.on("yourRole", ({ knowsWord, word, isKamikaze, speakOrder }) => {
    state.knowsWord = knowsWord;
    state.word = word;
    state.isKamikaze = isKamikaze || false;
    state.isImpostor = !knowsWord && !isKamikaze;
    state.voted = false;
    state.guessUsed = false;
    state.speakOrder = speakOrder;
    state.roleVisible = true;
    renderRole();
});

function renderSpeakOrder() {
    if (!state.speakOrder.length) return '';
    return `
      <div class="mb-4 p-3 bg-amber-800 rounded-lg border border-amber-600">
        <h3 class="text-lg font-semibold mb-2 text-amber-300">📢 Kolejność wypowiedzi:</h3>
        <ol class="list-decimal list-inside text-left bg-amber-900 p-3 rounded-md">
          ${state.speakOrder.map((p, i) => `
            <li class="p-1 mb-1 flex items-center gap-2">
              <span class="text-amber-400">${i + 1}.</span>
              <span class="text-amber-200">${p.nickname}</span>
            </li>
          `).join('')}
        </ol>
      </div>
    `;
}

function toggleRoleVisibility() {
    state.roleVisible = !state.roleVisible;
    renderRole();
}

function renderRole() {
    const isOwner = socket.id === state.ownerId;

    app.innerHTML = `
    <div class="text-center max-w-lg mx-auto relative" id="roleScreen">
      <h2 class="text-2xl font-bold mb-4 text-amber-300">Twoja rola</h2>
      <button id="toggleVisibility" class="absolute top-4 right-4 p-2 bg-amber-700 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${state.roleVisible ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'}"/>
        </svg>
      </button>
      ${renderSpeakOrder()}
      ${state.roleVisible ? `
        ${state.knowsWord ? `
          <div class="mb-4 p-3 bg-amber-800 rounded-lg">
            <p class="text-amber-200 mb-2">✅ Znasz hasło:</p>
            <p class="text-xl font-mono font-bold text-amber-100">"${state.word}"</p>
          </div>` : ``}
        ${state.isImpostor ? `<p class="text-red-400 font-bold mb-4 p-3 bg-amber-800 rounded-lg">🚨 Jesteś impostorem!</p>` : ``}
        ${state.isKamikaze ? `<p class="text-rose-400 font-bold mb-4 p-3 bg-amber-800 rounded-lg">💣 Kamikaze – blefuj jak impostor.</p>` : ``}
        ${state.isImpostor && !state.guessUsed ? `
          <div class="mt-4">
            <input id="guessInput" placeholder="Zgadnij hasło" class="w-full p-2 rounded border border-amber-300 bg-amber-800 text-amber-100 mb-2" />
            <button id="guessBtn" class="bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded w-full">
              Zgłoś hasło
            </button>
          </div>
        ` : ``}
      ` : `
        <div class="mb-4 p-3 bg-amber-800 rounded-lg">
          <p class="text-amber-200">👀 Rola ukryta</p>
        </div>
      `}
      ${isOwner ? `
        <button class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded w-full mb-2" id="continueBtn">
          Rozpocznij głosowanie
        </button>
        <button class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded w-full" id="skipBtn">
          ⏭️ Pomijaj rundę
        </button>
      ` : `
        <p class="text-amber-400 p-3 bg-amber-800 rounded-lg mb-4">Czekaj na rozpoczęcie głosowania...</p>
        ${state.isImpostor && !state.guessUsed ? `
          <div class="mt-4">
            <input id="guessInput" placeholder="Zgadnij hasło" class="w-full p-2 rounded border border-amber-300 bg-amber-800 text-amber-100 mb-2" />
            <button id="guessBtn" class="bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded w-full">
              Zgłoś hasło
            </button>
          </div>
        ` : ``}
      `}
      ${renderLeaveButton()}
    </div>
  `;

    document.getElementById("toggleVisibility").onclick = toggleRoleVisibility;

    if (isOwner) {
        document.getElementById("continueBtn").onclick = () => {
            socket.emit("startVoting", state.roomCode);
        };
        document.getElementById("skipBtn").onclick = () => {
            socket.emit("skipRound", state.roomCode);
        };
    }

    document.getElementById("leaveBtn").onclick = handleLeave;

    if (state.roleVisible && state.isImpostor && !state.guessUsed) {
        const guessBtn = document.getElementById("guessBtn");
        if (guessBtn) {
            guessBtn.onclick = () => {
                const guess = document.getElementById("guessInput").value.trim();
                if (!guess) return;
                socket.emit("guessWord", state.roomCode, guess);
                state.guessUsed = true;
            };
        }
    }
}

socket.on("startVoting", () => {
    renderVoting();
});

function renderVoting() {
    app.innerHTML = `
    <div class="text-center max-w-lg mx-auto">
      <h2 class="text-xl font-bold mb-2 text-amber-300">🗳️ Głosuj na impostora</h2>
      ${renderSpeakOrder()}
      <div id="voteList" class="grid grid-cols-2 gap-3 mb-4"></div>
      ${socket.id === state.ownerId ? `
        <button id="skipBtn" class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded w-full mb-2">
          ⏭️ Pomijaj rundę
        </button>
      ` : ``}
      ${renderLeaveButton()}
    </div>
  `;

    const list = document.getElementById("voteList");
    list.innerHTML = state.players
        .filter(p => p.id !== socket.id)
        .map(p => `
        <button class="bg-${p.color}-600 hover:bg-${p.color}-700 text-white font-medium p-2 rounded-lg flex items-center justify-center gap-2" data-id="${p.id}">
          <img src="avatars/${p.avatar || 'alien.png'}" class="w-6 h-6 rounded-full" /> 
          ${p.nickname}
        </button>
      `).join('');

    document.querySelectorAll("[data-id]").forEach(btn => {
        btn.onclick = () => {
            if (state.voted) return;
            state.voted = true;
            socket.emit("submitVote", state.roomCode, btn.dataset.id);
            app.innerHTML = `<div class="text-center p-8">
                <p class="text-lg text-amber-300">🕐 Czekamy na głosy pozostałych graczy.</p>
            </div>`;
        };
    });

    document.getElementById("leaveBtn").onclick = handleLeave;

    if (socket.id === state.ownerId) {
        document.getElementById("skipBtn").onclick = () => {
            socket.emit("skipRound", state.roomCode);
        };
    }
}

socket.on("roundEnd", ({ message, round, players, mode }) => {
    state.round = round;
    state.scores = {};
    state.currentMode = mode;
    players.forEach(p => state.scores[p.nickname] = p.score);

    app.innerHTML = `
    <div class="text-center max-w-lg mx-auto">
      <h2 class="text-xl font-bold mb-2 text-amber-300">🏁 Runda ${round} zakończona</h2>
      <p class="mb-4 p-3 rounded-lg ${message.includes('✅') ? 'bg-green-900 text-green-300' : message.includes('❌') ? 'bg-red-900 text-red-300' : 'bg-amber-800 text-amber-300'}">${message}</p>
      <h3 class="text-md font-medium mb-1 text-amber-200">🎮 Tryb gry: ${modeLabel(mode)}</h3>
      <h3 class="text-lg font-semibold mb-3 text-amber-300">🎯 Punktacja:</h3>
      <ul class="mb-4 text-left">
        ${players.map(p => `
          <li class="mb-2 p-3 rounded-lg bg-amber-800 flex items-center gap-3">
            <img src="avatars/${p.avatar || 'alien.png'}" class="w-8 h-8 rounded-full" />
            <div>
              <div class="text-amber-300 font-bold">${p.nickname}</div>
              <div class="flex items-center gap-2">
                <span class="text-amber-200">${p.score} pkt</span>
                <span class="text-xs px-2 py-1 rounded-full ${p.isImpostor ? 'bg-red-800 text-red-300' : p.isKamikaze ? 'bg-rose-800 text-rose-300' : 'bg-green-800 text-green-300'}">
                  ${p.isImpostor ? "Impostor" : p.isKamikaze ? "Kamikaze" : "Niewinny"}
                </span>
              </div>
            </div>
          </li>
        `).join('')}
      </ul>
      ${socket.id === state.ownerId ? `
        <div class="mb-4">
          <label for="modeSelect" class="block mb-2 font-medium text-amber-200">Zmień tryb gry:</label>
          <select id="modeSelect" class="w-full bg-amber-700 text-amber-100 font-semibold px-3 py-2 rounded border border-amber-500">
            <option value="classic">🕵️ Klasyczny</option>
            <option value="double">🕵️🕵️ Podwójny</option>
            <option value="chaos">🤯 Chaos</option>
            <option value="kamikaze">💣 Kamikaze</option>
          </select>
        </div>
        <button id="nextBtn" class="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded w-full">
          Graj dalej
        </button>` :
            '<p class="text-amber-400 p-3 bg-amber-800 rounded-lg">Czekaj na decyzję właściciela pokoju...</p>'}
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

function modeLabel(mode) {
    switch (mode) {
        case "classic": return "🕵️ Klasyczny";
        case "double": return "🕵️🕵️ Podwójny";
        case "chaos": return "🤯 Chaos";
        case "kamikaze": return "💣 Kamikaze";
        default: return "🎲 Losowy";
    }
}

renderHome();