import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

export class CowboyGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onEnd: OnGameEndCallback | null = null;

    // --- ÉTATS DE SYNCHRONISATION ---
    private readyStatus: { [key: string]: boolean } = {};
    private gameStarted: boolean = false;

    // --- ÉTAT DU JEU ---
    private gameState: 'WAITING' | 'GO' | 'ROUND_OVER' = 'WAITING';
    private timer: NodeJS.Timeout | null = null;
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
        this.updateUI(); // Affiche l'écran des règles
    }

    handleAction(playerId: string, actionId: string) {
        if (actionId === 'QUIT_GAME') {
        if (this.timer) clearTimeout(this.timer); // STOPPE LE SERVEUR
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Duel annulé", btnText: "OK" });
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
                    this.startNewRound(); // Le premier chrono aléatoire ne part qu'ici
                }, 800);
            }
            return;
        }

        if (!this.gameStarted || this.gameState === 'ROUND_OVER') return;

        // Logique de tir
        if (actionId === 'SHOOT') {
            if (this.gameState === 'WAITING') {
                const loser = playerId;
                const winner = (loser === this.p1) ? this.p2 : this.p1;
                this.handleRoundWin(winner, "Faux départ ! 🚫");
            } 
            else if (this.gameState === 'GO') {
                this.handleRoundWin(playerId, "Tir réussi ! 🎯");
            }
        }
    }

    private startNewRound() {
        this.gameState = 'WAITING';
        this.updateUI();

        // Timer aléatoire (2 à 6 secondes)
        const randomTime = Math.floor(Math.random() * 4000) + 2000;
        this.timer = setTimeout(() => {
            this.triggerSignal();
        }, randomTime);
    }

    private triggerSignal() {
        if (this.gameState !== 'WAITING') return;
        this.gameState = 'GO';
        this.updateUI();
    }

    private handleRoundWin(winnerId: string, reason: string) {
        this.gameState = 'ROUND_OVER';
        if (this.timer) clearTimeout(this.timer);

        this.scores[winnerId]++;
        this.updateUI();

        const roundMsg = `${reason}\nScore : ${this.scores[this.p1]} - ${this.scores[this.p2]}`;

        if (this.scores[winnerId] >= 3) {
            this.finishGame(winnerId);
        } else {
            this.io.to(this.roomId).emit('modal', {
                title: "MANCHE TERMINÉE",
                message: roundMsg,
                btnText: "..." 
            });

            setTimeout(() => {
                this.io.to(this.roomId).emit('modal', { close: true }); 
                this.startNewRound();
            }, 3000);
        }
    }

    private finishGame(winnerId: string) {
        const name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE !",
            message: `${name} est le plus rapide de l'Ouest !`,
            btnText: "RETOUR"
        });

        if (this.onEnd) this.onEnd(winnerId);
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
            title: "🤠 COWBOY",
            status: "OBJECTIF : 3 VICTOIRES\n\n" +
                    "1. Attends que le bouton devienne VERT.\n" +
                    "2. Dès que tu vois 'PAN !', clique le plus vite possible.\n" +
                    "3. ATTENTION : Si tu tires quand le bouton est ORANGE, tu perds la manche !\n\n" +
                    (otherReady ? "✅ L'adversaire est prêt !" : "⏳ L'adversaire lit les règles..."),
            displays: [],
            buttons: [
                {
                    label: isReady ? "EN POSITION..." : "DÉGAINER ! 👍",
                    actionId: "READY_PLAYER",
                    color: isReady ? "grey" : "green",
                    disabled: isReady
                }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    private sendPlayerGameUI(targetId: string) {
        let status = "ATTENDEZ... ✋";
        let color = "orange";
        let btnLabel = "PAS ENCORE !";

        if (this.gameState === 'GO') {
            status = "TIREZ !!! 🔥";
            color = "green";
            btnLabel = "PAN !";
        } else if (this.gameState === 'ROUND_OVER') {
            status = "RÉSULTAT...";
            color = "grey";
            btnLabel = "...";
        }

        const ui: UIState = {
            title: `🤠 MANCHE ${this.scores[this.p1] + this.scores[this.p2] + 1}`,
            status: status,
            displays: [
                { type: 'text', label: "MOI", value: this.scores[targetId].toString() },
                { type: 'text', label: "RIVAL", value: this.scores[targetId === this.p1 ? this.p2 : this.p1].toString() }
            ],
            buttons: this.gameState !== 'ROUND_OVER' ? [
                { label: btnLabel, actionId: "SHOOT", color: color, disabled: false, size: 'giant' }
            ] : []
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    refresh(playerId: string) { this.updateUI(); }

    updatePlayerSocket(oldId: string, newId: string) {
        if (this.p1 === oldId) this.p1 = newId;
        if (this.p2 === oldId) this.p2 = newId;
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
        if (this.timer) clearTimeout(this.timer);
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd) this.onEnd(winner);
    }
}
