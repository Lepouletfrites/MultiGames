import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

export class BombeGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onEnd: OnGameEndCallback | null = null;

    // État du jeu
    private bombHolder: string = ""; 
    private explostionTimer: NodeJS.Timeout | null = null;
    private unlockButtonTimer: NodeJS.Timeout | null = null;

    // Scores (J1 vs J2)
    private scores: { [key: string]: number } = {};

    constructor(io: Server, roomId: string, p1Id: string, p2Id: string) {
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        // Initialisation des scores
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
    }

    start(onEnd: OnGameEndCallback) {
        this.onEnd = onEnd;
        this.startNewRound();
    }

    private startNewRound() {
        // La bombe commence aléatoirement chez l'un des deux à chaque manche
        this.bombHolder = (Math.random() > 0.5) ? this.p1 : this.p2;

        // Durée secrète (entre 10 et 20 secondes)
        const duration = Math.floor(Math.random() * 10000) + 10000;

        this.explostionTimer = setTimeout(() => {
            this.explode();
        }, duration);

        // On lance l'interface (avec le délai de blocage de 2s au début)
        this.updateInterface(true);
    }

    handleAction(playerId: string, actionId: string) {
        // Sécurité : Si ce n'est pas celui qui a la bombe, on ignore
        if (playerId !== this.bombHolder) return;

        if (actionId === 'PASS') {
            this.switchHolder();
        }
    }

    private switchHolder() {
        // Si le joueur précédent avait encore un timer de blocage en cours (bug rare), on le coupe
        if (this.unlockButtonTimer) clearTimeout(this.unlockButtonTimer);

        // On passe la bombe à l'autre
        this.bombHolder = (this.bombHolder === this.p1) ? this.p2 : this.p1;

        // Mise à jour de l'interface (avec blocage pour le nouveau)
        this.updateInterface(true);
    }

    private updateInterface(withCooldown: boolean) {
        const holderId = this.bombHolder;
        const otherId = (holderId === this.p1) ? this.p2 : this.p1;

        // UI pour celui qui est SAFE
        this.sendSafeUI(otherId);

        // UI pour celui qui a la BOMBE
        if (withCooldown) {
            // PHASE 1 : BLOQUÉ (Gros bouton rouge GRISÉ)
            this.sendBombUI(holderId, true);

            // Dans 2 secondes, on débloque
            this.unlockButtonTimer = setTimeout(() => {
                this.sendBombUI(holderId, false); 
            }, 2000); 
        } else {
            // PHASE 2 : ACTIF
            this.sendBombUI(holderId, false);
        }
    }

    // Affiche les scores en haut de l'écran
    private getScoreDisplays() {
        return [
            { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
            { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
        ];
    }

    private sendSafeUI(playerId: string) {
        // Astuce : any pour éviter les erreurs de type strict sur 'text' si besoin
        const displays: any[] = this.getScoreDisplays();
        displays.push({ type: 'text', label: "STATUS", value: "SAFE 😅" });

        const ui: UIState = {
            title: `💣 MANCHE ${this.getTotalRounds()}`,
            status: "L'ennemi a la bombe ! Priez...",
            displays: displays,
            buttons: [] // Pas de bouton
        };
        this.io.to(playerId).emit('renderUI', ui);
    }

    private sendBombUI(playerId: string, disabled: boolean) {
        const displays: any[] = this.getScoreDisplays();
        displays.push({ type: 'text', label: "STATUS", value: "DANGER 💀" });

        const ui: UIState = {
            title: `💣 MANCHE ${this.getTotalRounds()}`,
            status: disabled ? "BOMBE BLOQUÉE (2s)..." : "PASSE LA VITE !!!",
            displays: displays,
            buttons: [
                {
                    label: disabled ? "..." : "PASSER LA BOMBE 🎁",
                    actionId: "PASS",
                    color: "red",
                    disabled: disabled,
                    size: 'giant' // Le fameux gros bouton
                }
            ]
        };
        this.io.to(playerId).emit('renderUI', ui);
    }

    private getTotalRounds() {
        return this.scores[this.p1] + this.scores[this.p2] + 1;
    }

    private explode() {
        if (this.unlockButtonTimer) clearTimeout(this.unlockButtonTimer);

        // Celui qui a la bombe a perdu la manche
        const loser = this.bombHolder;
        const winner = (loser === this.p1) ? this.p2 : this.p1;
        
        // Point pour le survivant
        this.scores[winner]++;

        // 1. NETTOYAGE ÉCRAN (On enlève le bouton pour voir l'explosion)
        const uiClean: UIState = {
            title: "BOUM !", 
            status: "La bombe a explosé...",
            displays: this.getScoreDisplays(),
            buttons: []
        };
        this.io.to(this.roomId).emit('renderUI', uiClean);

        // Vérification victoire (Premier à 3 points)
        if (this.scores[winner] >= 3) {
            this.finishGame(winner);
        } else {
            // Manche suivante
            const winnerName = (winner === this.p1) ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', {
                title: "EXPLOSION !",
                message: `Point pour ${winnerName}.\nPréparez-vous pour la suite...`,
                btnText: "..."
            });

            setTimeout(() => {
                // On ferme la modale et on relance
                this.io.to(this.roomId).emit('modal', { close: true });
                this.startNewRound();
            }, 3000);
        }
    }

    private finishGame(winnerId: string) {
        const p1Name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE",
            message: `${p1Name} a survécu à la guerre !\nScore final: ${this.scores[this.p1]}-${this.scores[this.p2]}`,
            btnText: "RETOUR AU HUB"
        });
        if (this.onEnd) this.onEnd(winnerId);
    }
    
    handleDisconnect(playerId: string) {
        if (this.explostionTimer) clearTimeout(this.explostionTimer);
        if (this.unlockButtonTimer) clearTimeout(this.unlockButtonTimer);
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd) this.onEnd(winner);
    }
}
