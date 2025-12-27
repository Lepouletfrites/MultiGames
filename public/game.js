const socket = io();

// Éléments fixes
const titleEl = document.getElementById('game-title');
const statusEl = document.getElementById('game-status');
const gameArea = document.getElementById('game-area');
const controlsArea = document.getElementById('controls-area');
const modal = document.getElementById('result-modal');

// --- RÉCEPTION DE L'INTERFACE (Le cœur du système) ---
socket.on('renderUI', (uiState) => {
    // 1. Mettre à jour les textes de base
    if (uiState.title) titleEl.innerText = uiState.title;
    if (uiState.status) statusEl.innerText = uiState.status;

    // 2. Construire la Zone de Jeu (Scores, PV...)
    // Le serveur envoie une liste d'éléments 'displays'
    if (uiState.displays) {
        gameArea.innerHTML = ""; // On vide l'ancien contenu
        uiState.displays.forEach(item => {
            const div = document.createElement('div');
            div.className = "player-card";
            div.innerHTML = `
                <h3>${item.label}</h3>
                <div class="big-text">${item.value}</div>
            `;
            // Si c'est une barre de vie (optionnel pour l'instant)
            if (item.type === 'bar') {
                div.innerHTML += `<div class="hp-container"><div class="hp-bar" style="width:${item.pct}%"></div></div>`;
            }
            gameArea.appendChild(div);
        });
    }

    // 3. Construire les Boutons Dynamiquement
    if (uiState.buttons) {
        controlsArea.innerHTML = ""; // On efface les vieux boutons
        uiState.buttons.forEach(btnConfig => {
            const btn = document.createElement('button');
            btn.innerText = btnConfig.label;
            
            // Couleur dynamique
            if (btnConfig.color === 'red') btn.style.backgroundColor = '#e74c3c';
            if (btnConfig.color === 'green') btn.style.backgroundColor = '#2ecc71';
            if (btnConfig.color === 'blue') btn.style.backgroundColor = '#3498db';
            if (btnConfig.color === 'purple') btn.style.backgroundColor = '#9b59b6';
                        // --- NOUVEAU : GESTION DE LA TAILLE ---
            if (btnConfig.size === 'giant') {
                btn.className = 'big-centered-btn'; // On applique le style CSS
            }

            // État activé/désactivé
            btn.disabled = btnConfig.disabled;

            // Action au clic : on renvoie l'ID de l'action au serveur
            btn.onclick = () => {
                socket.emit('gameAction', btnConfig.actionId);
                // Petit feedback visuel immédiat
                statusEl.innerText = "Envoi...";
                Array.from(controlsArea.children).forEach(b => b.disabled = true);
            };

            controlsArea.appendChild(btn);
        });
    }
});

// --- GESTION SIMPLE DES POPUPS ---
socket.on('modal', (data) => {
    // Si le serveur demande de fermer la modale
    if (data.close) {
        modal.style.display = 'none';
        return;
    }

    document.getElementById('modal-title').innerText = data.title || "INFO";
    document.getElementById('modal-text').innerText = data.message;
    const btn = document.getElementById('btn-modal-action');
    btn.innerText = data.btnText || "OK";
    
    if (data.reload) {
        btn.onclick = () => location.reload();
    } else {
        btn.onclick = () => { modal.style.display = 'none'; };
    }
    
    modal.style.display = 'flex';
});

socket.on('serverInfo', (data) => {
    // Affichage discret de l'IP si besoin, tu peux le remettre ici
    console.log("IP Serveur:", data.ip);
});
