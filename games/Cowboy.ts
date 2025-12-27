import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

export class CowboyGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onEnd: OnGameEndCallback | null = null;

    // État du jeu
    private gameState: 'WAITING' | 'GO' | 'ROUND_OVER' = 'WAITING';
    private timer: NodeJS.Timeout | null = null;

    // NOUVEAU : Scores de la partie
    private scores: { [key: string]: number } = {};

    constructor(io: Server, roomId: string, p1Id: string, p2Id: string) {
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        // Initialisation des scores à 0
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
    }

    start(onEnd: OnGameEndCallback) {
        this.onEnd = onEnd;
        this.startNewRound();
    }

    // Lance une nouvelle manche
    private startNewRound() {
        this.gameState = 'WAITING';
        
        // 1. On affiche "PRÉPAREZ-VOUS..." avec le gros bouton Orange
        this.broadcastUI("PRÉPAREZ-VOUS...", "orange", "ATTENDEZ ! ✋");

        // 2. Timer aléatoire (2 à 6 secondes)
        const randomTime = Math.floor(Math.random() * 4000) + 2000;

        this.timer = setTimeout(() => {
            this.triggerSignal();
        }, randomTime);
    }

    private triggerSignal() {
        if (this.gameState !== 'WAITING') return;
        
        this.gameState = 'GO';
        // BOUTON VERT et TEXTE QUI CHANGE
        this.broadcastUI("TIREZ !!!", "green", "PAN ! 🔥");
    }

    handleAction(playerId: string, actionId: string) {
        // Si la manche est déjà finie, on ignore les clics
        if (this.gameState === 'ROUND_OVER') return;

        // CAS 1 : FAUX DÉPART (Trop tôt)
        if (this.gameState === 'WAITING') {
            const loser = playerId;
            const winner = (loser === this.p1) ? this.p2 : this.p1;
            this.handleRoundWin(winner, "Faux départ ! 🚫");
        } 
        // CAS 2 : TIR VALIDE (Le premier qui clique)
        else if (this.gameState === 'GO') {
            this.handleRoundWin(playerId, "Tir réussi ! 🎯");
        }
    }

        private handleRoundWin(winnerId: string, reason: string) {
        this.gameState = 'ROUND_OVER';
        if (this.timer) clearTimeout(this.timer);

        this.scores[winnerId]++;

        // 1. NETTOYAGE : On envoie une interface SANS boutons pour que l'écran soit propre
        // Cela efface le gros bouton orange/vert pendant qu'on lit le résultat
        const uiClean: UIState = {
            title: `🤠 MANCHE ${this.scores[this.p1] + this.scores[this.p2]} TERMINEE`,
            status: "Résultats...",
            displays: [
                { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
                { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
            ],
            buttons: [] // Liste vide = Pas de bouton à l'écran
        };
        this.io.to(this.roomId).emit('renderUI', uiClean);

        // Préparation du message
        const p1Score = this.scores[this.p1];
        const p2Score = this.scores[this.p2];
        const roundMsg = `${reason}\nScore : ${p1Score} - ${p2Score}`;

        if (this.scores[winnerId] >= 3) {
            // Victoire finale
            this.finishGame(winnerId);
        } else {
            // Manche suivante
            this.io.to(this.roomId).emit('modal', {
                title: "MANCHE TERMINÉE",
                message: roundMsg,
                btnText: "..." // Le bouton est là pour la déco, ça va changer tout seul
            });

            setTimeout(() => {
                // 2. MODIFICATION ICI : On ferme juste la modale, sans afficher de texte "GO"
                this.io.to(this.roomId).emit('modal', { close: true }); 
                
                // Et on relance immédiatement
                this.startNewRound();
            }, 3000);
        }
    }


    private finishGame(winnerId: string) {
        const p1Name = (winnerId === this.p1) ? "J1" : "J2";
        
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE !",
            message: `Le ${p1Name} remporte le duel (Score: ${this.scores[this.p1]}-${this.scores[this.p2]})`,
            btnText: "RETOUR AU HUB"
        });

        if (this.onEnd) {
            this.onEnd(winnerId);
            this.onEnd = null;
        }
    }

    private broadcastUI(status: string, color: string, btnLabel: string) {
        const ui: UIState = {
            title: `🤠 MANCHE ${this.scores[this.p1] + this.scores[this.p2] + 1}`,
            status: status,
            displays: [
                { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
                { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
            ],
            buttons: [
                { 
                    label: btnLabel, 
                    actionId: "SHOOT", 
                    color: color,
                    disabled: false,
                    size: 'giant' // <--- C'EST ÇA QUI FAIT LE GROS BOUTON
                }
            ]
        };
        this.io.to(this.roomId).emit('renderUI', ui);
    }

    handleDisconnect(playerId: string) {
        if (this.timer) clearTimeout(this.timer);
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd) this.onEnd(winner);
    }
}
