const socket = io("https://impostor-server-wmgt.onrender.com");
const app = document.getElementById("app");
const particlesContainer = document.getElementById("particles");

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
    roleVisible: true,
    votedPlayers: []
};

const avatarList = ["alien.png", "bear.png", "cat.png", "frog.png", "koala.png", "robot.png"];

function createParticles() {
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.classList.add("particle");

        const size = Math.random() * 10 + 2;
        const left = Math.random() * 100;
        const animationDuration = Math.random() * 30 + 20;
        const animationDelay = Math.random() * 5;
        const opacity = Math.random() * 0.3 + 0.1;

        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${left}%`;
        particle.style.opacity = opacity;
        particle.style.animationDuration = `${animationDuration}s`;
        particle.style.animationDelay = `${animationDelay}s`;

        particlesContainer.appendChild(particle);
    }
}

function renderLeaveButton() {
    return `<div class="mt-4">
        <button id="leaveBtn" class="cosmic-btn btn-danger pulse">🚪 Opuść pokój</button>
    </div>`;
}

function handleLeave() {
    socket.emit("leaveRoom", state.roomCode);
    location.reload();
}

function renderHome() {
    app.innerHTML = `
    <div class="space-panel card-3d">
      <div class="fog-effect"></div>
      <h1 class="float">🎭 Impostor Online</h1>
      <div class="animated-separator"></div>
      <input id="nickname" placeholder="Twoje imię" class="galaxy-input" />
      <div class="mb-4 text-amber-200">Wybierz kolor:</div>
      <div class="colors-container" id="colors">
        ${["red", "blue", "green", "yellow", "purple", "rose"].map(c => `
          <div class="color-option" 
               style="background-color: ${getColorHex(c)}" data-color="${c}"></div>
        `).join('')}
      </div>
      <div class="mb-4 text-amber-200">Wybierz awatara:</div>
      <div class="avatars-container" id="avatars">
        ${avatarList.map(avatar => `
          <img src="avatars/${avatar}" data-avatar="${avatar}" class="avatar cursor-pointer glow" />
        `).join('')}
      </div>
      <div class="button-spacing"></div>
      <button id="createBtn" class="cosmic-btn pulse">
        Stwórz pokój
      </button>
      <div class="join-container">
        <input id="joinCode" placeholder="Kod pokoju" class="galaxy-input mb-3" />
        <button id="joinBtn" class="cosmic-btn join-btn">
          Dołącz
        </button>
      </div>
    </div>
  `;

    state.avatar = avatarList[0];

    document.querySelectorAll("[data-color]").forEach(el => {
        el.addEventListener("click", () => {
            state.color = el.dataset.color;
            document.querySelectorAll("[data-color]").forEach(e => e.classList.remove("selected-color"));
            el.classList.add("selected-color");
        });
    });

    document.querySelectorAll("[data-avatar]").forEach((el, index) => {
        if (index === 0) {
            el.classList.add("selected-avatar");
        }

        el.addEventListener("click", () => {
            state.avatar = el.dataset.avatar;
            document.querySelectorAll("[data-avatar]").forEach(e => e.classList.remove("selected-avatar"));
            el.classList.add("selected-avatar");
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

function getColorHex(colorName) {
    const colors = {
        red: "#EF4444",
        blue: "#3B82F6",
        green: "#10B981",
        yellow: "#F59E0B",
        purple: "#8B5CF6",
        rose: "#F43F5E"
    };
    return colors[colorName] || "#FFFFFF";
}

function renderLobby() {
    app.innerHTML = `
    <div class="space-panel card-3d">
      <div class="fog-effect"></div>
      <h2>Pokój: <span class="glow">${state.roomCode}</span></h2>
      <div class="animated-separator"></div>
      <div class="flex justify-between items-center mb-5">
        <span id="playerCounter" class="text-amber-200">👥 Graczy: ${state.players.length}</span>
        ${socket.id === state.ownerId ? `
          <select id="modeSelect" class="galaxy-input">
            <option value="random">🎲 Losowy</option>
            <option value="classic">🕵️ Klasyczny</option>
            <option value="double">🕵️🕵️ Podwójny</option>
            <option value="chaos">🤯 Chaos</option>
            <option value="kamikaze">💣 Kamikaze</option>
          </select>` : ""}
      </div>
      <div class="player-list-grid" id="playerList"></div>
      ${socket.id === state.ownerId ?
            '<button id="startBtn" class="cosmic-btn pulse">Rozpocznij grę</button>' :
            '<p class="text-center mb-5">Czekaj na rozpoczęcie gry...</p>'}
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
    <div class="player-item">
      <img src="avatars/${p.avatar || 'alien.png'}" alt="avatar" class="avatar" />
      <span class="text-${p.color}-400 font-semibold glow">
        ${p.nickname}${p.id === state.ownerId ? '<span class="owner-crown">👑</span>' : ''}
      </span>
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
      <div class="mb-5">
        <h3>📢 Kolejność wypowiedzi:</h3>
        <div class="speak-order">
          ${state.speakOrder.map((p, i) => `
            <div class="speak-order-item">
              <div class="speak-order-number">${i + 1}</div>
              <span class="text-amber-200 font-medium">
                ${p.nickname}${p.id === state.ownerId ? ' <span class="owner-crown">👑</span>' : ''}
              </span>
            </div>
          `).join('')}
        </div>
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
    <div class="space-panel card-3d relative" id="roleScreen">
      <div class="fog-effect"></div>
      <h2>Twoja rola</h2>
      <div class="animated-separator"></div>
      <button id="toggleVisibility" class="absolute p-2 rounded-full transition">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="white">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${state.roleVisible ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'}"/>
        </svg>
      </button>
      ${renderSpeakOrder()}
      ${state.roleVisible ? `
        ${state.isImpostor ? `
          <div class="role-info impostor-info">
            <p>🚨 Jesteś impostorem!</p>
          </div>
          ${!state.guessUsed ? `
            <div class="mt-5">
              <input id="guessInput" placeholder="Zgadnij hasło" class="galaxy-input mb-3 guess-input" />
              <button id="guessBtn" class="cosmic-btn pulse">
                Zgłoś hasło
              </button>
            </div>
          ` : ''}
        ` : state.isKamikaze ? `
          <div class="role-info kamikaze-info">
            <p>💣 Jesteś Kamikaze!</p>
          </div>
          <div class="knows-word">
            <p class="mb-3">Znasz hasło:</p>
            <div class="word-display glow text-alien-green">"${state.word}"</div>
          </div>
        ` : state.knowsWord ? `
          <div class="role-info innocent-info">
            <p>✅ Jesteś niewinny!</p>
          </div>
          <div class="knows-word">
            <p class="mb-3">Znasz hasło:</p>
            <div class="word-display glow text-alien-green">"${state.word}"</div>
          </div>
        ` : ''}
      ` : `
        <div class="mb-4 p-4 bg-amber-800 rounded-lg text-center">
          <p class="text-xl">👀 Rola ukryta</p>
          <p class="text-sm mt-2">Kliknij ikonę oka, aby pokazać</p>
        </div>
      `}
      ${isOwner ? `
        <div class="mt-6">
          <button class="cosmic-btn pulse" id="continueBtn">
            Rozpocznij głosowanie
          </button>
          <button class="cosmic-btn btn-warning mt-3" id="skipBtn">
            ⏭️ Pomijaj rundę
          </button>
        </div>
      ` : `
        <div class="mt-6 mb-5">
          <p class="text-center text-lg">Czekaj na rozpoczęcie głosowania...</p>
        </div>
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
    state.votedPlayers = [];

    app.innerHTML = `
    <div class="space-panel card-3d">
      <div class="fog-effect"></div>
      <h2>🗳️ Głosuj na impostora</h2>
      <div class="animated-separator"></div>
      <div class="mb-5">
        <h3>👥 Status graczy:</h3>
        <div id="playerStatus" class="grid grid-cols-1 gap-3"></div>
      </div>
      
      ${state.voted ? `
        <div class="vote-confirmation">
          <p>✅ Twój głos został oddany!</p>
          <p>Czekamy na pozostałych graczy...</p>
        </div>
      ` : `
        <div id="voteList" class="grid grid-cols-2 gap-4 mb-5"></div>
      `}
      
      ${socket.id === state.ownerId ? `
        <button id="skipBtn" class="cosmic-btn btn-warning mb-4">
          ⏭️ Pomijaj rundę
        </button>
      ` : ``}
      ${renderLeaveButton()}
    </div>
  `;

    renderPlayerStatus();

    if (!state.voted) {
        renderVoteButtons();
    }

    document.getElementById("leaveBtn").onclick = handleLeave;

    if (socket.id === state.ownerId) {
        const skipBtn = document.getElementById("skipBtn");
        if (skipBtn) {
            skipBtn.onclick = () => {
                socket.emit("skipRound", state.roomCode);
            };
        }
    }
}

function renderPlayerStatus() {
    const statusContainer = document.getElementById("playerStatus");
    if (!statusContainer) return;

    statusContainer.innerHTML = state.players.map(p => {
        const hasVoted = state.votedPlayers.includes(p.id);
        return `
        <div class="player-status ${hasVoted ? 'voted' : ''}">
          <img src="avatars/${p.avatar || 'alien.png'}" class="avatar" />
          <span class="text-${p.color}-400 font-medium">
            ${p.nickname}${p.id === state.ownerId ? ' <span class="owner-crown">👑</span>' : ''}
          </span>
          ${hasVoted ? `<span class="vote-check ml-auto text-2xl text-alien-green">✓</span>` : ''}
        </div>
      `;
    }).join('');
}

function renderVoteButtons() {
    const list = document.getElementById("voteList");
    if (!list) return;

    list.innerHTML = state.players
        .filter(p => p.id !== socket.id)
        .map(p => `
        <button class="cosmic-btn flex items-center justify-center gap-3" data-id="${p.id}">
          <img src="avatars/${p.avatar || 'alien.png'}" class="avatar" /> 
          <span>${p.nickname}${p.id === state.ownerId ? ' 👑' : ''}</span>
        </button>
      `).join('');

    document.querySelectorAll("[data-id]").forEach(btn => {
        btn.onclick = () => {
            if (state.voted) return;
            state.voted = true;
            socket.emit("submitVote", state.roomCode, btn.dataset.id);
            renderVoting();
        };
    });
}

socket.on("updateVotes", (voterIds) => {
    state.votedPlayers = voterIds;
    if (document.getElementById("playerStatus")) {
        renderPlayerStatus();
    }
});

socket.on("roundEnd", ({ message, round, players, mode }) => {
    state.round = round;
    state.scores = {};
    state.currentMode = mode;
    players.forEach(p => state.scores[p.nickname] = p.score);

    // Określ typ komunikatu
    let notifClass = "notification-warning";
    if (message.includes('✅') || message.includes('odgadł')) notifClass = "notification-success";
    if (message.includes('❌') || message.includes('pomylił')) notifClass = "notification-danger";

    app.innerHTML = `
    <div class="space-panel card-3d">
      <div class="fog-effect"></div>
      <h2>🏁 Runda ${round} zakończona</h2>
      <div class="animated-separator"></div>
      <div class="clear-notification ${notifClass}">
        <p>${message}</p>
      </div>
      <h3>🎮 Tryb gry: ${modeLabel(mode)}</h3>
      <h3>🎯 Punktacja:</h3>
      <ul class="star-list">
        ${players.map(p => `
          <li class="mb-3 p-4 flex items-center gap-4 ${p.isImpostor ? 'bg-red-800' : p.isKamikaze ? 'bg-amber-800' : 'bg-green-800'}">
            <img src="avatars/${p.avatar || 'alien.png'}" class="avatar" />
            <div class="flex-grow">
              <div class="font-bold text-lg">
                ${p.nickname}${p.id === state.ownerId ? ' <span class="owner-crown">👑</span>' : ''}
              </div>
              <div class="flex items-center gap-3 mt-1">
                <span class="text-xl">${p.score} pkt</span>
                <span class="text-xs px-3 py-1 rounded-full glow role-badge ${p.isImpostor ? 'impostor-badge' : p.isKamikaze ? 'kamikaze-badge' : 'innocent-badge'}">
                  ${p.isImpostor ? "Impostor" : p.isKamikaze ? "Kamikaze" : "Niewinny"}
                </span>
              </div>
            </div>
          </li>
        `).join('')}
      </ul>
      ${socket.id === state.ownerId ? `
        <div class="mb-5 mt-6">
          <label for="modeSelect" class="block mb-4 text-lg">Zmień tryb gry:</label>
          <select id="modeSelect" class="galaxy-input">
            <option value="classic">🕵️ Klasyczny</option>
            <option value="double">🕵️🕵️ Podwójny</option>
            <option value="chaos">🤯 Chaos</option>
            <option value="kamikaze">💣 Kamikaze</option>
          </select>
        </div>
        <button id="nextBtn" class="cosmic-btn pulse">
          Graj dalej
        </button>` :
            '<div class="mb-6 mt-6"><p class="text-center text-xl">Czekaj na decyzję właściciela pokoju...</p></div>'}
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

createParticles();
renderHome();