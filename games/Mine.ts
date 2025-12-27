import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

export class MineGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onEnd: OnGameEndCallback | null = null;

    private readyStatus: { [key: string]: boolean } = {};
    private gameStarted: boolean = false;

    private scores: { [key: string]: number } = {};
    private currentPlayer: string;
    private currentPot: number = 0;
    private successfulOpens: number = 0;
    private readonly rewards = [1, 2, 4, 8]; 
    private chests: number[] = [0, 0, 0, 0, 0];
    private bombIndex: number = 0;

    constructor(io: Server, roomId: string, p1Id: string, p2Id: string) {
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
        this.currentPlayer = (Math.random() > 0.5) ? p1Id : p2Id;
        this.readyStatus[p1Id] = false;
        this.readyStatus[p2Id] = false;
        this.resetRound();
    }

    start(onEnd: OnGameEndCallback) {
        this.onEnd = onEnd;
        this.updateUI();
    }

    handleAction(playerId: string, actionId: string) {
        // --- GESTION DU BOUTON QUITTER (HAUT DROITE) ---
        if (actionId === 'QUIT_GAME') {
            const winner = (playerId === this.p1) ? this.p2 : this.p1;
            this.io.to(this.roomId).emit('modal', {
                title: "ABANDON 🏳️",
                message: "La partie a été interrompue.",
                btnText: "OK"
            });
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
                    this.updateUI();
                }, 800);
            }
            return;
        }

        if (!this.gameStarted || playerId !== this.currentPlayer) return;

        if (actionId === 'BANK') this.bankPoints();
        else if (actionId.startsWith('OPEN_')) {
            const index = parseInt(actionId.replace('OPEN_', ''));
            this.openChest(index);
        }
    }

    private updateUI() {
        this.sendPlayerUI(this.p1);
        this.sendPlayerUI(this.p2);
    }

    private sendPlayerUI(targetId: string) {
        // --- ÉCRAN DES RÈGLES ---
        if (!this.gameStarted) {
            const isReady = this.readyStatus[targetId];
            const otherReady = this.readyStatus[targetId === this.p1 ? this.p2 : this.p1];

            const ui: UIState = {
                title: "💎 CHAMP MINÉ",
                status: "OBJECTIF : 30 POINTS\n\n" +
                        "• Trouve les diamants 💎 pour gagner des points.\n" +
                        "• Gains : +1, +2, +4, puis +8 par coffre.\n" +
                        "• Si tu touches la BOMBE 💥, tu perds le pot !\n" +
                        "• ENCAISSE 💰 quand tu veux pour valider tes points.\n\n" +
                        (otherReady ? "✅ L'adversaire est prêt !" : "⏳ L'adversaire lit les règles..."),
                displays: [], 
                buttons: [
                    {
                        label: isReady ? "EN ATTENTE..." : "C'EST PARTI ! 🏁",
                        actionId: "READY_PLAYER",
                        color: isReady ? "grey" : "green",
                        disabled: isReady
                    }
                ]
            };
            this.io.to(targetId).emit('renderUI', ui);
            return;
        }

        // --- ÉCRAN DU JEU ---
        const isMyTurn = (targetId === this.currentPlayer);
        const buttons: any[] = [];
        this.chests.forEach((state, i) => {
            let label = "📦"; let color = "blue";
            if (state === 1) { label = "💎"; color = "green"; }
            if (state === 2) { label = "💥"; color = "red"; }
            buttons.push({ label, actionId: `OPEN_${i}`, color, disabled: !isMyTurn || state !== 0 });
        });
        buttons.push({
            label: `💰 ENCAISSER (+${this.currentPot})`,
            actionId: "BANK",
            color: "orange",
            disabled: !isMyTurn || this.currentPot === 0
        });

        const ui: UIState = {
            title: "MINE : OBJECTIF 30",
            status: isMyTurn ? `À TON TOUR ! (Pot: ${this.currentPot} pts)` : "L'adversaire tente sa chance...",
            displays: [
                { type: 'text', label: "MOI", value: this.scores[targetId].toString() },
                { type: 'text', label: "RIVAL", value: this.scores[targetId === this.p1 ? this.p2 : this.p1].toString() }
            ],
            buttons: buttons
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    // (Reste des méthodes identiques au script précédent...)
    private resetRound() {
        this.chests = [0, 0, 0, 0, 0];
        this.bombIndex = Math.floor(Math.random() * 5);
        this.currentPot = 0;
        this.successfulOpens = 0;
    }

    private openChest(index: number) {
        if (this.chests[index] !== 0) return;
        if (index === this.bombIndex) {
            this.chests[index] = 2; this.currentPot = 0; this.updateUI();
            this.io.to(this.roomId).emit('modal', { title: "BOUM ! 💥", message: "Gourmandise punie !", btnText: "Mince" });
            setTimeout(() => { this.io.to(this.roomId).emit('modal', { close: true }); this.nextTurn(); }, 2000);
        } else {
            this.chests[index] = 1; this.currentPot += this.rewards[this.successfulOpens]; this.successfulOpens++;
            if (this.successfulOpens === 4) this.bankPoints(); else this.updateUI();
        }
    }

    private bankPoints() {
        if (this.currentPot > 0) this.scores[this.currentPlayer] += this.currentPot;
        if (this.scores[this.currentPlayer] >= 30) this.finishGame(); else this.nextTurn();
    }

    private nextTurn() {
        this.currentPlayer = (this.currentPlayer === this.p1) ? this.p2 : this.p1;
        this.resetRound(); this.updateUI();
    }

    private finishGame() {
        const winner = this.currentPlayer;
        const name = (winner === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', { title: "🏆 BRAQUAGE RÉUSSI", message: `${name} gagne !`, btnText: "RETOUR" });
        if (this.onEnd) this.onEnd(winner);
    }

    refresh(playerId: string) { this.updateUI(); }

    updatePlayerSocket(oldId: string, newId: string) {
        if (this.p1 === oldId) this.p1 = newId;
        if (this.p2 === oldId) this.p2 = newId;
        if (this.currentPlayer === oldId) this.currentPlayer = newId;
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
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd) this.onEnd(winner);
    }
}
