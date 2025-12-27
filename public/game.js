let socket; // On déclare la variable mais on ne la remplit pas tout de suite

// Éléments du DOM
const loginScreen = document.getElementById('login-screen');
const usernameInput = document.getElementById('username-input');

const titleEl = document.getElementById('game-title');
const statusEl = document.getElementById('game-status');
const gameArea = document.getElementById('game-area');
const controlsArea = document.getElementById('controls-area');
const modal = document.getElementById('result-modal');

// --- 1. GESTION DU LOGIN ---

// Au chargement, on regarde si un pseudo est déjà sauvegardé
window.onload = () => {
    const savedName = localStorage.getItem('myPseudo');
    if (savedName) {
        usernameInput.value = savedName;
    }
};

function login() {
    const name = usernameInput.value.trim();
    if (name.length < 2) return alert("Choisis un pseudo plus long !");

    // On sauvegarde pour la prochaine fois
    localStorage.setItem('myPseudo', name);

    // On cache l'écran de login
    loginScreen.style.display = 'none';

    // ET C'EST LÀ QU'ON SE CONNECTE
    connectSocket(name);
}

// --- 2. CONNEXION AU SERVEUR ---

function connectSocket(playerName) {
    // On envoie le pseudo dans l'objet 'auth'
    socket = io({
        auth: { name: playerName }
    });

    setupSocketEvents();
}

// --- 3. ÉCOUTE DES ÉVÉNEMENTS (Comme avant) ---

function setupSocketEvents() {
    socket.on('renderUI', (uiState) => {
        if (uiState.title) titleEl.innerText = uiState.title;
        if (uiState.status) statusEl.innerText = uiState.status;

        // Zone de Stats
        if (uiState.displays) {
            gameArea.innerHTML = "";
            uiState.displays.forEach(item => {
                const div = document.createElement('div');
                div.className = "player-card";
                div.innerHTML = `<h3>${item.label}</h3><div class="big-text">${item.value}</div>`;
                if (item.type === 'bar') {
                    div.innerHTML += `<div class="hp-container"><div class="hp-bar" style="width:${item.pct}%"></div></div>`;
                }
                gameArea.appendChild(div);
            });
        }

        // Zone des Boutons
        if (uiState.buttons) {
            controlsArea.innerHTML = "";
            uiState.buttons.forEach(btnConfig => {
                const btn = document.createElement('button');
                btn.innerText = btnConfig.label;
                
                if (btnConfig.color === 'red') btn.style.backgroundColor = '#e74c3c';
                if (btnConfig.color === 'green') btn.style.backgroundColor = '#2ecc71';
                if (btnConfig.color === 'blue') btn.style.backgroundColor = '#3498db';
                if (btnConfig.color === 'purple') btn.style.backgroundColor = '#9b59b6';
                if (btnConfig.color === 'orange') btn.style.backgroundColor = '#e67e22';

                // Gestion Taille
                if (btnConfig.size === 'giant') btn.className = 'big-centered-btn';

                btn.disabled = btnConfig.disabled;
                btn.onclick = () => {
                    socket.emit('gameAction', btnConfig.actionId);
                    if(btnConfig.size !== 'giant') {
                        statusEl.innerText = "Envoi...";
                        Array.from(controlsArea.children).forEach(b => b.disabled = true);
                    }
                };
                controlsArea.appendChild(btn);
            });
        }
    });

    socket.on('modal', (data) => {
        if (data.close) { modal.style.display = 'none'; return; }
        document.getElementById('modal-title').innerText = data.title || "INFO";
        document.getElementById('modal-text').innerText = data.message;
        const btn = document.getElementById('btn-modal-action');
        btn.innerText = data.btnText || "OK";
        
        if (data.reload) btn.onclick = () => location.reload();
        else btn.onclick = () => { modal.style.display = 'none'; };
        
        modal.style.display = 'flex';
    });

    socket.on('serverInfo', (data) => {
        console.log("Connecté sur", data.ip);
    });
}
