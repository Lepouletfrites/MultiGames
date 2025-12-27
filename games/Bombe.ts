import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

export class BombeGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onEnd: OnGameEndCallback | null = null;

    // --- ÉTATS DE SYNCHRONISATION ---
    private readyStatus: { [key: string]: boolean } = {};
    private gameStarted: boolean = false;

    // --- ÉTAT DU JEU ---
    private bombHolder: string = ""; 
    private explosionTimer: NodeJS.Timeout | null = null;
    private unlockButtonTimer: NodeJS.Timeout | null = null;
    private isButtonLocked: boolean = false; 
    private scores: { [key: string]: number } = {};

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
        this.updateUI(); // Affiche les règles
    }

    handleAction(playerId: string, actionId: string) {
        // --- GESTION DU READY ---
        if (actionId === 'QUIT_GAME') {
        if (this.explosionTimer) clearTimeout(this.explosionTimer); // STOPPE L'EXPLOSION
        if (this.unlockButtonTimer) clearTimeout(this.unlockButtonTimer);
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Bombe désamorcée", btnText: "OK" });
        if (this.onEnd) this.onEnd(winner);
        return;
    }

        if (actionId === 'READY_PLAYER') {
            this.readyStatus[playerId] = true;
            this.updateUI();

            if (this.readyStatus[this.p1] && this.readyStatus[this.p2]) {
                setTimeout(() => {
                    this.gameStarted = true;
                    this.startNewRound(); // On lance le timer de la bombe ICI
                }, 800);
            }
            return;
        }

        if (!this.gameStarted) return;

        if (playerId !== this.bombHolder) return;
        if (actionId === 'PASS') {
            this.switchHolder();
        }
    }

    private startNewRound() {
        this.bombHolder = (Math.random() > 0.5) ? this.p1 : this.p2;
        const duration = Math.floor(Math.random() * 10000) + 10000; 

        this.explosionTimer = setTimeout(() => {
            this.explode();
        }, duration);

        this.updateInterface(true);
    }

    private switchHolder() {
        if (this.unlockButtonTimer) clearTimeout(this.unlockButtonTimer);
        this.bombHolder = (this.bombHolder === this.p1) ? this.p2 : this.p1;
        this.updateInterface(true);
    }

    private updateInterface(withCooldown: boolean) {
        const holderId = this.bombHolder;
        const otherId = (holderId === this.p1) ? this.p2 : this.p1;

        this.sendSafeUI(otherId);

        this.isButtonLocked = withCooldown;
        this.sendBombUI(holderId, withCooldown);

        if (withCooldown) {
            this.unlockButtonTimer = setTimeout(() => {
                this.isButtonLocked = false;
                this.sendBombUI(holderId, false); 
            }, 2000); 
        }
    }

    private updateUI() {
        if (!this.gameStarted) {
            this.sendRulesUI(this.p1);
            this.sendRulesUI(this.p2);
        } else {
            const holderId = this.bombHolder;
            const otherId = (holderId === this.p1) ? this.p2 : this.p1;
            this.sendSafeUI(otherId);
            this.sendBombUI(holderId, this.isButtonLocked);
        }
    }

    private sendRulesUI(targetId: string) {
        const isReady = this.readyStatus[targetId];
        const otherReady = this.readyStatus[targetId === this.p1 ? this.p2 : this.p1];

        const ui: UIState = {
            title: "💣 LA BOMBE",
            status: "OBJECTIF : NE PAS EXPLOSER\n\n" +
                    "1. La bombe est confiée à l'un de vous au hasard.\n" +
                    "2. Clique vite pour la PASSER à ton adversaire.\n" +
                    "3. Attention : quand tu la reçois, elle est BLOQUÉE 2s.\n" +
                    "4. Celui qui a la bombe à l'explosion perd la manche.\n\n" +
                    (otherReady ? "✅ L'adversaire est prêt !" : "⏳ L'adversaire lit les règles..."),
            displays: [],
            buttons: [
                {
                    label: isReady ? "ATTENTE..." : "J'AI COMPRIS ! 👍",
                    actionId: "READY_PLAYER",
                    color: isReady ? "grey" : "green",
                    disabled: isReady
                }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    private getScoreDisplays() {
        return [
            { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
            { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
        ];
    }

    private sendSafeUI(playerId: string) {
        const ui: UIState = {
            title: `💣 MANCHE ${this.getTotalRounds()}`,
            status: "L'ennemi a la bombe ! Priez... 🙏",
            displays: this.getScoreDisplays(),
            buttons: [] 
        };
        this.io.to(playerId).emit('renderUI', ui);
    }

    private sendBombUI(playerId: string, disabled: boolean) {
        const ui: UIState = {
            title: `💣 MANCHE ${this.getTotalRounds()}`,
            status: disabled ? "BOMBE BLOQUÉE (2s)... ⏳" : "PASSE LA VITE !!! 🔥",
            displays: this.getScoreDisplays(),
            buttons: [
                {
                    label: disabled ? "..." : "PASSER LA BOMBE 🎁",
                    actionId: "PASS",
                    color: "red",
                    disabled: disabled,
                    size: 'giant'
                }
            ]
        };
        this.io.to(playerId).emit('renderUI', ui);
    }

    private getTotalRounds() {
        return (this.scores[this.p1] || 0) + (this.scores[this.p2] || 0) + 1;
    }

    private explode() {
        if (this.unlockButtonTimer) clearTimeout(this.unlockButtonTimer);
        const loser = this.bombHolder;
        const winner = (loser === this.p1) ? this.p2 : this.p1;
        this.scores[winner]++;

        this.io.to(this.roomId).emit('renderUI', {
            title: "BOUM !", 
            status: "La bombe a explosé...",
            displays: this.getScoreDisplays(),
            buttons: []
        });

        if (this.scores[winner] >= 3) {
            this.finishGame(winner);
        } else {
            const winnerName = (winner === this.p1) ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', {
                title: "EXPLOSION !",
                message: `Point pour ${winnerName}.`,
                btnText: "..."
            });
            setTimeout(() => {
                this.io.to(this.roomId).emit('modal', { close: true });
                this.startNewRound();
            }, 3000);
        }
    }

    private finishGame(winnerId: string) {
        const p1Name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE",
            message: `${p1Name} l'emporte !`,
            btnText: "RETOUR"
        });
        if (this.onEnd) this.onEnd(winnerId);
    }
    
    refresh(playerId: string) {
        this.updateUI();
    }

    updatePlayerSocket(oldId: string, newId: string) {
        if (this.p1 === oldId) this.p1 = newId;
        if (this.p2 === oldId) this.p2 = newId;
        if (this.bombHolder === oldId) this.bombHolder = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
        if (this.scores[oldId] !== undefined) {
            this.scores[newId] = this.scores[oldId];
            delete this.scores[oldId];
        }
    }

    handleDisconnect(playerId: string) {
        if (this.explosionTimer) clearTimeout(this.explosionTimer);
        if (this.unlockButtonTimer) clearTimeout(this.unlockButtonTimer);
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd) this.onEnd(winner);
    }
}
