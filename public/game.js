let socket;

// --- ÉLÉMENTS DU DOM ---
const loginScreen = document.getElementById('login-screen');
const usernameInput = document.getElementById('username-input');
const titleEl = document.getElementById('game-title');
const statusEl = document.getElementById('game-status');
const gameArea = document.getElementById('game-area');
const controlsArea = document.getElementById('controls-area');
const modal = document.getElementById('result-modal');
const btnQuit = document.getElementById('btn-quit-game'); // Le drapeau blanc 🏳️

// --- 1. GESTION DU LOGIN & PERSISTANCE ---

window.onload = () => {
    // 1. On récupère les infos sauvegardées
    const savedName = localStorage.getItem('myPseudo');
    const savedId = localStorage.getItem('myUserId');
    
    // 2. Sécurité initiale pour le drapeau
    if (btnQuit) btnQuit.style.setProperty('display', 'none', 'important');

    // 3. AUTO-LOGIN : Si on a déjà un pseudo et un ID, on connecte direct
    if (savedName && savedId) {
        usernameInput.value = savedName;
        console.log("[AUTO-LOGIN] Bienvenue, " + savedName);
        login(); 
    } else if (savedName) {
        // Si on a juste le nom, on le pré-remplit mais on attend le clic
        usernameInput.value = savedName;
    }
};

function login() {
    const name = usernameInput.value.trim();
    if (name.length < 2) return alert("Pseudo trop court !");

    // On cache l'écran de login immédiatement
    loginScreen.style.display = 'none';

    // On prépare l'affichage pour éviter le vide
    titleEl.innerText = "Synchronisation...";
    statusEl.innerText = "Connexion au serveur en cours...";

    // Récupération ou création de l'ID unique
    let userId = localStorage.getItem('myUserId');
    if (!userId) {
        userId = 'u_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('myUserId', userId);
    }

    localStorage.setItem('myPseudo', name);
    
    connectSocket(name, userId);
}

function connectSocket(playerName, userId) {
    socket = io({
        auth: { 
            name: playerName,
            userId: userId 
        }
    });

    setupSocketEvents();
}

// --- 2. ÉVÉNEMENTS SOCKET ---

function setupSocketEvents() {
    
    // Action du bouton abandon (Drapeau)
    btnQuit.onclick = () => {
        if (confirm("Abandonner la partie en cours ? 🏳️")) {
            socket.emit('gameAction', 'QUIT_GAME');
        }
    };

    socket.on('renderUI', (uiState) => {
        // --- LOGIQUE DE VISIBILITÉ DU DRAPEAU ---
        if (loginScreen.style.display !== 'none') {
            const t = (uiState.title || "").toUpperCase();
            const isMenu = t === "" || 
                           t.includes("VOTE") || 
                           t.includes("LOBBY") || 
                           t.includes("ATTENTE") || 
                           t.includes("CHOIX") ||
                           t.includes("SESSION") ||
                           t.includes("SALLE") ||
                           t.includes("OUVERTE") ||
                           t.includes("JOUEUR") ||
                           t.includes("BIENVENUE");

            if (isMenu) {
                btnQuit.style.setProperty('display', 'none', 'important');
            } else {
                btnQuit.style.setProperty('display', 'flex', 'important');
            }
        } else {
            btnQuit.style.setProperty('display', 'none', 'important');
        }

        // --- MISE À JOUR DU TITRE ET STATUT ---
        if (uiState.title) titleEl.innerText = uiState.title;
        if (uiState.status) statusEl.innerText = uiState.status;

        // --- RENDU DES STATS (HP / SCORES) ---
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

        // --- RENDU DES BOUTONS DE JEU ---
        if (uiState.buttons) {
            controlsArea.innerHTML = "";
            uiState.buttons.forEach(btnConfig => {
                const btn = document.createElement('button');
                btn.innerText = btnConfig.label;
                
                const colors = { 
                    red:'#e74c3c', green:'#2ecc71', blue:'#3498db', 
                    purple:'#9b59b6', orange:'#e67e22', grey:'#7f8c8d' 
                };
                if (colors[btnConfig.color]) btn.style.backgroundColor = colors[btnConfig.color];

                if (btnConfig.size === 'giant') btn.className = 'big-centered-btn';

                btn.disabled = btnConfig.disabled;
                btn.onclick = () => {
                    socket.emit('gameAction', btnConfig.actionId);
                    
                    if(btnConfig.size !== 'giant') {
                        btn.innerText = "⏳";
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
        btn.onclick = () => { modal.style.display = 'none'; };
        modal.style.display = 'flex';
    });

    socket.on('serverInfo', (data) => {
        console.log("Connecté au serveur :", data.ip);
    });
}
