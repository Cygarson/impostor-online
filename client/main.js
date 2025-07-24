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
    phase: "home"  // Dodane do śledzenia aktualnej fazy
};

const avatarList = ["alien.png", "bear.png", "cat.png", "frog.png", "koala.png", "robot.png"];

function renderLeaveButton() {
    return `<button id="leaveBtn" class="bg-rose-400 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded mt-2">🚪 Opuść pokój</button>`;
}

function handleLeave() {
    socket.emit("leaveRoom", state.roomCode);
    location.reload();
}

function renderHome() {
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto bg-amber-50 p-6 rounded-xl shadow-lg">
      <h1 class="text-3xl font-bold mb-6 text-amber-800">🎭 Impostor Online</h1>
      <input id="nickname" placeholder="Twoje imię" class="mb-3 w-full p-2 rounded border border-amber-300 bg-amber-50" />
      <div class="mb-2 text-amber-700">Wybierz kolor:</div>
      <div class="flex justify-center mb-3 flex-wrap gap-2" id="colors">
        ${["red", "blue", "green", "yellow", "purple", "orange", "amber"].map(c => `
          <div class="w-8 h-8 rounded-full bg-${c}-500 cursor-pointer border-2 border-white hover:border-amber-800" data-color="${c}"></div>
        `).join('')}
      </div>
      <div class="mb-2 text-amber-700">Wybierz awatara:</div>
      <div class="flex justify-center mb-4 flex-wrap gap-2" id="avatars">
        ${avatarList.map(avatar => `
          <img src="avatars/${avatar}" data-avatar="${avatar}" class="w-10 h-10 rounded-full border-2 border-amber-300 cursor-pointer hover:border-amber-600" />
        `).join('')}
      </div>
      <button id="createBtn" class="bg-amber-700 hover:bg-amber-800 text-white font-bold py-2 px-4 rounded w-full mb-2">
        Stwórz pokój
      </button>
      <div class="flex gap-2 mt-4">
        <input id="joinCode" placeholder="Kod pokoju" class="flex-grow p-2 rounded border border-amber-300 bg-amber-50" />
        <button id="joinBtn" class="bg-amber-700 hover:bg-amber-800 text-white font-bold py-2 px-4 rounded">
          Dołącz
        </button>
      </div>
    </div>
  `;

    state.avatar = avatarList[0];
    state.phase = "home";

    document.querySelectorAll("[data-color]").forEach(el => {
        el.addEventListener("click", () => {
            state.color = el.dataset.color;
            document.querySelectorAll("[data-color]").forEach(e => e.classList.remove("ring-4", "ring-amber-800"));
            el.classList.add("ring-4", "ring-amber-800");
        });
    });

    document.querySelectorAll("[data-avatar]").forEach(el => {
        el.addEventListener("click", () => {
            state.avatar = el.dataset.avatar;
            document.querySelectorAll("[data-avatar]").forEach(e => e.classList.remove("ring-4", "ring-amber-600"));
            el.classList.add("ring-4", "ring-amber-600");
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
    <div class="text-center max-w-md mx-auto bg-amber-50 p-6 rounded-xl shadow-lg">
      <h2 class="text-2xl font-bold mb-4 text-amber-800">Pokój: ${state.roomCode}</h2>
      <div class="flex justify-between items-center mb-4">
        <span id="playerCounter" class="text-amber-700">👥 Graczy: ${state.players.length}</span>
        ${socket.id === state.ownerId ? `
          <select id="modeSelect" class="bg-amber-100 border border-amber-300 rounded px-2 py-1 text-amber-800">
            <option value="random">🎲 Losowy</option>
            <option value="classic">🕵️ Klasyczny</option>
            <option value="double">🕵️🕵️ Podwójny</option>
            <option value="chaos">🤯 Chaos</option>
            <option value="kamikaze">💣 Kamikaze</option>
          </select>` : ""}
      </div>
      <div id="playerList" class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-left px-2"></div>
      ${socket.id === state.ownerId ?
            '<button id="startBtn" class="bg-amber-700 hover:bg-amber-800 text-white font-bold py-2 px-4 rounded w-full">Rozpocznij grę</button>' :
            '<p class="text-amber-600 italic">Czekaj na rozpoczęcie gry...</p>'}
      ${renderLeaveButton()}
    </div>
  `;

    state.phase = "lobby";

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
    <div class="flex items-center gap-2 bg-amber-100 p-2 rounded-lg">
      <img src="avatars/${p.avatar || 'alien.png'}" alt="avatar" class="w-8 h-8 rounded-full border border-amber-300" />
      <span class="text-${p.color}-600 font-semibold">${p.nickname}</span>
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

socket.on("speakOrder", (order) => {
    state.speakOrder = order;
    if (state.phase === "role" || state.phase === "voting") {
        if (state.phase === "role") renderRole();
        else if (state.phase === "voting") renderVoting();
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

function renderSpeakOrder() {
    if (!state.speakOrder.length) return '';
    return `
      <div class="mb-4 p-3 bg-rose-50 rounded-lg border border-rose-200">
        <h3 class="text-lg font-semibold mb-2 text-amber-800">📢 Kolejność wypowiedzi:</h3>
        <ol class="list-decimal list-inside text-left bg-white p-3 rounded-md shadow-inner">
          ${state.speakOrder.map((p, i) => `
            <li class="p-2 mb-1 flex items-center gap-2 border-b border-amber-100">
              <span class="text-amber-700 font-bold">${i + 1}.</span>
              <img src="avatars/${state.players.find(pl => pl.id === p.id)?.avatar || 'alien.png'}" class="w-6 h-6 rounded-full" />
              <span class="text-amber-800">${p.nickname}</span>
            </li>
          `).join('')}
        </ol>
      </div>
    `;
}

function renderRole() {
    app.innerHTML = `
    <div class="text-center max-w-md mx-auto bg-amber-50 p-6 rounded-xl shadow-lg">
      <h2 class="text-2xl font-bold mb-4 text-amber-800">Twoja rola</h2>
      ${renderSpeakOrder()}
      ${state.knowsWord ? `
        <div class="mb-4 p-4 bg-amber-100 rounded-lg">
          <p class="text-amber-700 mb-2">✅ Znasz hasło:</p>
          <p class="text-xl font-mono font-bold text-amber-800 bg-white p-3 rounded-md">"${state.word}"</p>
        </div>` : ``}
      ${state.isImpostor ? `<p class="text-red-500 font-bold mb-4 p-3 bg-red-50 rounded-lg">🚨 Jesteś impostorem!</p>` : ``}
      ${state.isKamikaze ? `<p class="text-yellow-700 font-bold mb-4 p-3 bg-yellow-50 rounded-lg">💣 Kamikaze – blefuj jak impostor.</p>` : ``}
      <button class="bg-amber-700 hover:bg-amber-800 text-white font-bold py-2 px-4 rounded w-full mb-2" id="continueBtn">
        Rozpocznij głosowanie
      </button>
      ${state.isImpostor && !state.guessUsed ? `
        <div class="mt-4">
          <input id="guessInput" placeholder="Zgadnij hasło" class="w-full p-2 rounded border border-amber-300 mb-2" />
          <button id="guessBtn" class="bg-rose-400 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded w-full">
            Zgłoś hasło
          </button>
        </div>
      ` : ``}
      ${renderLeaveButton()}
    </div>
  `;
    state.phase = "role";

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
    <div class="text-center max-w-md mx-auto bg-amber-50 p-6 rounded-xl shadow-lg">
      <h2 class="text-xl font-bold mb-2 text-amber-800">🗳️ Głosuj na impostora</h2>
      ${renderSpeakOrder()}
      <div id="voteList" class="grid grid-cols-2 gap-3 mb-4"></div>
      ${state.isImpostor && !state.guessUsed ? `
        <div class="mb-4">
          <input id="guessInput" placeholder="Zgadnij hasło" class="w-full p-2 rounded border border-amber-300 mb-2" />
          <button id="guessBtn" class="bg-rose-400 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded w-full">
            Zgłoś hasło
          </button>
        </div>
      ` : ``}
      ${renderLeaveButton()}
    </div>
  `;
    state.phase = "voting";

    const list = document.getElementById("voteList");
    list.innerHTML = state.players
        .filter(p => p.id !== socket.id)
        .map(p => `
        <button class="bg-${p.color}-500 hover:bg-${p.color}-600 text-white font-medium p-2 rounded-lg flex items-center justify-center gap-2" data-id="${p.id}">
          <img src="avatars/${p.avatar || 'alien.png'}" class="w-6 h-6 rounded-full" /> 
          ${p.nickname}
        </button>
      `).join('');

    document.querySelectorAll("[data-id]").forEach(btn => {
        btn.onclick = () => {
            if (state.voted) return;
            state.voted = true;
            socket.emit("submitVote", state.roomCode, btn.dataset.id);
            app.innerHTML = `<div class="text-center p-8 bg-amber-50 rounded-xl">
                <p class="text-lg text-amber-800">🕐 Czekamy na głosy pozostałych graczy.</p>
            </div>`;
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
    <div class="text-center max-w-md mx-auto bg-amber-50 p-6 rounded-xl shadow-lg">
      <h2 class="text-xl font-bold mb-2 text-amber-800">🏁 Runda ${round} zakończona</h2>
      <p class="mb-4 p-3 rounded-lg ${message.includes('✅') ? 'bg-green-100 text-green-800' : message.includes('❌') ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}">${message}</p>
      <h3 class="text-md font-medium mb-1 text-amber-700">🎮 Tryb gry: ${modeLabel(mode)}</h3>
      <h3 class="text-lg font-semibold mb-3 text-amber-800">🎯 Punktacja:</h3>
      <ul class="mb-4 text-left">
        ${players.map(p => `
          <li class="mb-2 p-3 rounded-lg bg-amber-100 flex items-center gap-3">
            <img src="avatars/${p.avatar || 'alien.png'}" class="w-8 h-8 rounded-full" />
            <div>
              <div class="text-amber-800 font-bold">${p.nickname}</div>
              <div class="flex items-center gap-2">
                <span class="text-amber-700">${p.score} pkt</span>
                <span class="text-xs px-2 py-1 rounded-full ${p.isImpostor ? 'bg-red-200 text-red-800' : p.isKamikaze ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}">
                  ${p.isImpostor ? "Impostor" : p.isKamikaze ? "Kamikaze" : "Niewinny"}
                </span>
              </div>
            </div>
          </li>
        `).join('')}
      </ul>
      ${socket.id === state.ownerId ? `
        <div class="mb-4">
          <label for="modeSelect" class="block mb-2 font-medium text-amber-700">Zmień tryb gry:</label>
          <select id="modeSelect" class="w-full bg-amber-100 text-amber-800 font-semibold px-3 py-2 rounded border border-amber-300">
            <option value="classic">🕵️ Klasyczny</option>
            <option value="double">🕵️🕵️ Podwójny</option>
            <option value="chaos">🤯 Chaos</option>
            <option value="kamikaze">💣 Kamikaze</option>
          </select>
        </div>
        <button id="nextBtn" class="bg-amber-700 hover:bg-amber-800 text-white font-bold py-2 px-4 rounded w-full">
          Graj dalej
        </button>` :
            '<p class="text-amber-600 italic p-3 bg-amber-100 rounded-lg">Czekaj na decyzję właściciela pokoju...</p>'}
      ${renderLeaveButton()}
    </div>
  `;
    state.phase = "roundEnd";

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