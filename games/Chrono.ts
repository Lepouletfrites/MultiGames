import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

export class ChronoGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onEnd: OnGameEndCallback | null = null;

    // --- ÉTATS DE SYNCHRONISATION ---
    private readyStatus: { [key: string]: boolean } = {};
    private gameStarted: boolean = false;

    // --- ÉTAT DU JEU ---
    private scores: { [key: string]: number } = {};
    private targetTime: number = 0; 
    private startTime: number = 0;  
    private playerTimes: { [key: string]: number | null } = {}; 
    private tickInterval: NodeJS.Timeout | null = null;

    constructor(io: Server, roomId: string, p1Id: string, p2Id: string) {
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;

        this.readyStatus[p1Id] = false;
        this.readyStatus[p2Id] = false;
    }

    start(onEnd: OnGameEndCallback) {
        this.onEnd = onEnd;
        this.updateUI(); // Affiche l'écran des règles
    }

    handleAction(playerId: string, actionId: string) {
      
        if (actionId === 'QUIT_GAME') {
        if (this.tickInterval) clearInterval(this.tickInterval); // STOPPE LE CHRONO
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Temps arrêté", btnText: "OK" });
        if (this.onEnd) this.onEnd(winner);
        return;
    }

        // --- GESTION DU READY ---
        if (actionId === 'READY_PLAYER') {
            this.readyStatus[playerId] = true;
            this.updateUI();

            if (this.readyStatus[this.p1] && this.readyStatus[this.p2]) {
                setTimeout(() => {
                    this.gameStarted = true;
                    this.startNewRound(); // On lance la première manche
                }, 800);
            }
            return;
        }

        if (!this.gameStarted) return;

        // Logique de jeu (Bouton STOP)
        if (actionId === 'STOP') {
            if (this.playerTimes[playerId]) return;

            const duration = (Date.now() - this.startTime) / 1000;
            this.playerTimes[playerId] = duration;

            this.updateUI();

            if (this.playerTimes[this.p1] && this.playerTimes[this.p2]) {
                this.resolveRound();
            }
        }
    }

    private startNewRound() {
        this.playerTimes = { [this.p1]: null, [this.p2]: null };

        // Cible aléatoire entre 10 et 20s
        const randomSec = (Math.random() * 10) + 10; 
        this.targetTime = Math.round(randomSec * 10) / 10;

        // Phase de préparation (3s)
        this.broadcastGameUI(`CIBLE : ${this.targetTime.toFixed(1)}s`, "PRÉPAREZ-VOUS...", true);

        setTimeout(() => {
            this.beginTimer();
        }, 3000);
    }

    private beginTimer() {
        this.startTime = Date.now();
        this.updateUI();

        if (this.tickInterval) clearInterval(this.tickInterval);
        
        this.tickInterval = setInterval(() => {
            const elapsed = (Date.now() - this.startTime) / 1000;

            if (this.playerTimes[this.p1] && this.playerTimes[this.p2]) {
                if (this.tickInterval) clearInterval(this.tickInterval);
                return;
            }

            this.updateUI();

            // Sécurité AFK
            if (elapsed > 30) this.resolveRound();
        }, 1000);
    }

    private updateUI() {
        if (!this.gameStarted) {
            this.sendRulesUI(this.p1);
            this.sendRulesUI(this.p2);
        } else {
            this.sendPlayerGameUI(this.p1);
            this.sendPlayerGameUI(this.p2);
        }
    }

    private sendRulesUI(targetId: string) {
        const isReady = this.readyStatus[targetId];
        const otherReady = this.readyStatus[targetId === this.p1 ? this.p2 : this.p1];

        const ui: UIState = {
            title: "⏱️ CHRONO",
            status: "OBJECTIF : ARRÊTÉ AU PLUS PROCHE\n\n" +
                    "1. Une cible s'affiche (ex: 14.2s).\n" +
                    "2. Le chrono démarre : 1s, 2s, 3s...\n" +
                    "3. APRÈS 5 SECONDES, LE CHRONO DEVIENT INVISIBLE !\n" +
                    "4. Clique sur STOP pour valider ton temps.\n\n" +
                    (otherReady ? "✅ L'adversaire est prêt !" : "⏳ L'adversaire lit les règles..."),
            displays: [],
            buttons: [
                {
                    label: isReady ? "ATTENTE..." : "D'ACCORD ! 👍",
                    actionId: "READY_PLAYER",
                    color: isReady ? "grey" : "green",
                    disabled: isReady
                }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    private sendPlayerGameUI(playerId: string) {
        const elapsed = this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
        const hasPlayed = !!this.playerTimes[playerId];
        
        let centerText = "PRÉPARATION...";
        if (this.startTime > 0) {
            if (hasPlayed) {
                centerText = "TEMPS ENREGISTRÉ 🏁";
            } else {
                centerText = elapsed >= 5 ? "???" : `${Math.floor(elapsed)}s...`;
            }
        }

        const ui: UIState = {
            title: `CIBLE : ${this.targetTime.toFixed(1)}s`,
            status: centerText,
            displays: [
                { type: 'text', label: "MOI", value: this.scores[playerId].toString() },
                { type: 'text', label: "RIVAL", value: this.scores[playerId === this.p1 ? this.p2 : this.p1].toString() }
            ],
            buttons: [
                {
                    label: hasPlayed ? "ATTENTE..." : "STOP 🛑",
                    actionId: "STOP",
                    color: hasPlayed ? "grey" : "orange",
                    disabled: hasPlayed || this.startTime === 0,
                    size: 'giant'
                }
            ]
        };
        this.io.to(playerId).emit('renderUI', ui);
    }

    private broadcastGameUI(title: string, status: string, disabled: boolean) {
        [this.p1, this.p2].forEach(id => {
            const ui: UIState = {
                title: title,
                status: status,
                displays: [
                    { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
                    { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
                ],
                buttons: [{ label: "STOP 🛑", actionId: "STOP", color: "orange", disabled: disabled, size: 'giant' }]
            };
            this.io.to(id).emit('renderUI', ui);
        });
    }

    private resolveRound() {
        if (this.tickInterval) clearInterval(this.tickInterval);

        const t1 = this.playerTimes[this.p1] || 99.9;
        const t2 = this.playerTimes[this.p2] || 99.9;
        const diff1 = Math.abs(t1 - this.targetTime);
        const diff2 = Math.abs(t2 - this.targetTime);

        const winnerId = diff1 < diff2 ? this.p1 : this.p2;
        this.scores[winnerId]++;

        const msg = `Cible: ${this.targetTime}s\nJ1: ${t1.toFixed(2)}s | J2: ${t2.toFixed(2)}s`;

        if (this.scores[winnerId] >= 3) {
            this.finishGame(winnerId, msg);
        } else {
            const name = winnerId === this.p1 ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', { title: `POINT POUR ${name}`, message: msg, btnText: "..." });
            setTimeout(() => {
                this.io.to(this.roomId).emit('modal', { close: true });
                this.startNewRound();
            }, 4000);
        }
    }

    private finishGame(winnerId: string, msg: string) {
        const name = winnerId === this.p1 ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE !",
            message: `${name} est le maître du temps !\n${msg}`,
            btnText: "RETOUR"
        });
        if (this.onEnd) this.onEnd(winnerId);
    }

    refresh(playerId: string) { this.updateUI(); }

    updatePlayerSocket(oldId: string, newId: string) {
        if (this.p1 === oldId) this.p1 = newId;
        if (this.p2 === oldId) this.p2 = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
        if (this.playerTimes[oldId] !== undefined) {
            this.playerTimes[newId] = this.playerTimes[oldId];
            delete this.playerTimes[oldId];
        }
        if (this.scores[oldId] !== undefined) {
            this.scores[newId] = this.scores[oldId];
            delete this.scores[oldId];
        }
    }

    handleDisconnect(playerId: string) {
        if (this.tickInterval) clearInterval(this.tickInterval);
        const winner = playerId === this.p1 ? this.p2 : this.p1;
        if (this.onEnd) this.onEnd(winner);
    }
}
