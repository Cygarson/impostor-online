
const socket = io("http://localhost:3000"); // Zmień na adres z Render po publikacji

const app = document.getElementById("app");

let state = {
  nickname: "",
  color: "",
  roomCode: "",
  players: [],
  knowsWord: false,
  word: "",
  voted: false,
};

// Renderowanie ekranu głównego
function renderHome() {
  app.innerHTML = \`
    <div class="text-center">
      <h1 class="text-3xl font-bold mb-4">🎭 Impostor Online</h1>
      <input id="nickname" placeholder="Twoje imię" class="mb-2 px-3 py-2 text-black w-full rounded" />
      <div class="mb-2">Wybierz kolor:</div>
      <div class="flex justify-center mb-4" id="colors">
        \${["red", "blue", "green", "yellow", "purple", "orange"].map(c => \`
          <div class="w-8 h-8 rounded-full bg-\${c}-500 mx-1 cursor-pointer border-2" data-color="\${c}"></div>
        \`).join('')}
      </div>
      <button id="createBtn" class="bg-green-500 px-4 py-2 rounded mr-2">Stwórz pokój</button>
      <input id="joinCode" placeholder="Kod pokoju" class="px-3 py-2 text-black w-1/2 rounded" />
      <button id="joinBtn" class="bg-blue-500 px-4 py-2 rounded mt-2">Dołącz</button>
    </div>
  \`;

  document.querySelectorAll("[data-color]").forEach(el => {
    el.addEventListener("click", () => {
      state.color = el.dataset.color;
      document.querySelectorAll("[data-color]").forEach(e => e.classList.remove("ring-4", "ring-white"));
      el.classList.add("ring-4", "ring-white");
    });
  });

  document.getElementById("createBtn").onclick = () => {
    const nickname = document.getElementById("nickname").value.trim();
    if (!nickname || !state.color) return alert("Wpisz imię i wybierz kolor!");
    state.nickname = nickname;
    socket.emit("createRoom", nickname, state.color, (res) => {
      if (res.success) {
        state.roomCode = res.roomCode;
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
    socket.emit("joinRoom", code, nickname, state.color, (res) => {
      if (res.success) renderLobby();
      else alert(res.error);
    });
  };
}

function renderLobby() {
  app.innerHTML = \`
    <h2 class="text-xl font-semibold mb-2">Pokój: \${state.roomCode}</h2>
    <div id="playerList" class="grid grid-cols-2 gap-2 mb-4"></div>
    <button id="startBtn" class="bg-green-500 px-4 py-2 rounded">Rozpocznij grę</button>
  \`;

  socket.on("playerList", players => {
    state.players = players;
    const list = document.getElementById("playerList");
    list.innerHTML = players.map(p => \`
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 rounded-full bg-\${p.color}-500"></div>
        <span>\${p.nickname}</span>
      </div>
    \`).join('');
  });

  document.getElementById("startBtn").onclick = () => {
    socket.emit("startGame", state.roomCode);
  };
}

socket.on("yourRole", ({ knowsWord, word }) => {
  state.knowsWord = knowsWord;
  state.word = word;
  renderRole();
});

function renderRole() {
  app.innerHTML = \`
    <div class="text-center">
      <h2 class="text-2xl font-bold mb-4">Twoja rola</h2>
      \${state.knowsWord
        ? \`<p class="mb-2">✅ Znasz hasło:</p><p class="text-xl font-mono mb-4">"\${state.word}"</p>\`
        : \`<p class="mb-4">🚨 Jesteś impostorem! Blefuj dobrze.</p>\`}
      <button class="bg-blue-500 px-4 py-2 rounded" id="continueBtn">Rozpocznij dyskusję</button>
    </div>
  \`;

  document.getElementById("continueBtn").onclick = renderVoting;
}

function renderVoting() {
  app.innerHTML = \`
    <h2 class="text-xl font-bold mb-2">🗳️ Głosuj na impostora</h2>
    <div id="voteList" class="grid grid-cols-2 gap-2 mb-4"></div>
  \`;

  const list = document.getElementById("voteList");
  list.innerHTML = state.players.map(p => \`
    <button class="bg-\${p.color}-500 rounded px-4 py-2 text-white" data-id="\${p.id}">\${p.nickname}</button>
  \`).join('');

  document.querySelectorAll("[data-id]").forEach(btn => {
    btn.onclick = () => {
      if (state.voted) return;
      state.voted = true;
      socket.emit("submitVote", state.roomCode, btn.dataset.id);
      app.innerHTML = \`<p class="text-center text-lg">Czekamy na głosy pozostałych graczy...</p>\`;
    };
  });
}

socket.on("voteResults", ({ votedOut }) => {
  app.innerHTML = \`
    <div class="text-center">
      <h2 class="text-2xl font-bold mb-4">🧾 Wyniki głosowania</h2>
      <p>Najwięcej głosów otrzymał:</p>
      <p class="text-xl font-bold text-\${votedOut.color}-400 mt-2">\${votedOut.nickname}</p>
      <p class="mt-4">\${votedOut.knowsWord ? "❌ Był niewinny!" : "✅ To był impostor!"}</p>
      <button onclick="location.reload()" class="bg-green-600 mt-6 px-4 py-2 rounded">Nowa gra</button>
    </div>
  \`;
}

renderHome();
