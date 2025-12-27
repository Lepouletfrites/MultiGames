import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

export class ChronoGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onEnd: OnGameEndCallback | null = null;

    // Scores
    private scores: { [key: string]: number } = {};
    
    // État de la manche
    private targetTime: number = 0; // La cible (ex: 12500 ms)
    private startTime: number = 0;  // Quand le chrono a démarré
    private playerTimes: { [key: string]: number | null } = {}; // Temps arrêtés par les joueurs
    
    private tickInterval: NodeJS.Timeout | null = null;

    constructor(io: Server, roomId: string, p1Id: string, p2Id: string) {
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
    }

    start(onEnd: OnGameEndCallback) {
        this.onEnd = onEnd;
        this.startNewRound();
    }

    private startNewRound() {
        // 1. Reset des variables de manche
        this.playerTimes[this.p1] = null;
        this.playerTimes[this.p2] = null;

        // 2. Définir une cible aléatoire entre 10 et 20 secondes (ex: 14.5s)
        // On arrondit à 1 décimale pour que ce soit joli
        const randomSec = (Math.random() * 10) + 10; 
        this.targetTime = Math.round(randomSec * 10) / 10; // ex: 14.2

        // 3. Annonce de la cible
        this.broadcastUI(`CIBLE : ${this.targetTime.toFixed(1)} SECONDES`, "PRÉPAREZ-VOUS...", true);

        // 4. Démarrage après 3 secondes
        setTimeout(() => {
            this.beginTimer();
        }, 3000);
    }

    private beginTimer() {
        this.startTime = Date.now();
        let secondsPassed = 0;

        // On active le bouton STOP
        this.broadcastUI(`CIBLE : ${this.targetTime.toFixed(1)}s`, "C'EST PARTI !", false);

        // Boucle qui met à jour l'affichage chaque seconde
        this.tickInterval = setInterval(() => {
            secondsPassed++;
            const elapsed = Date.now() - this.startTime;

            // Si tout le monde a fini, on coupe
            if (this.playerTimes[this.p1] && this.playerTimes[this.p2]) {
                if (this.tickInterval) clearInterval(this.tickInterval);
                return;
            }

            // Si on dépasse 5 secondes -> MODE AVEUGLE
            if (secondsPassed >= 5) {
                this.broadcastUI(`CIBLE : ${this.targetTime.toFixed(1)}s`, "???", false, true); // true = garde les boutons actifs
            } else {
                // Sinon on affiche les secondes (1s... 2s...)
                this.broadcastUI(`CIBLE : ${this.targetTime.toFixed(1)}s`, `${secondsPassed}s...`, false, true);
            }

            // Sécurité : Si ça fait 30 secondes, on arrête tout (AFK)
            if (elapsed > 30000) {
                this.resolveRound();
            }

        }, 1000);
    }

    handleAction(playerId: string, actionId: string) {
        // Si le joueur a déjà arrêté son temps, on ignore
        if (this.playerTimes[playerId]) return;

        // On enregistre son temps
        const duration = (Date.now() - this.startTime) / 1000; // en secondes
        this.playerTimes[playerId] = duration;

        // On désactive son bouton et on lui dit "Bien reçu"
        this.sendPlayerUI(playerId, `Arrêté à ??? (Cible: ${this.targetTime}s)`, true);

        // Si les deux ont fini, on résout la manche
        if (this.playerTimes[this.p1] && this.playerTimes[this.p2]) {
            this.resolveRound();
        }
    }

    private resolveRound() {
        if (this.tickInterval) clearInterval(this.tickInterval);

        const t1 = this.playerTimes[this.p1] || 999; // 999 si pas joué
        const t2 = this.playerTimes[this.p2] || 999;

        // Calcul de la différence (écart)
        const diff1 = Math.abs(t1 - this.targetTime);
        const diff2 = Math.abs(t2 - this.targetTime);

        let winnerId: string;
        let msg = "";

        if (diff1 < diff2) {
            winnerId = this.p1;
            this.scores[this.p1]++;
        } else {
            winnerId = this.p2;
            this.scores[this.p2]++;
        }

        msg = `Cible: ${this.targetTime}s\n`;
        msg += `J1: ${t1.toFixed(2)}s (Ecart: ${diff1.toFixed(2)})\n`;
        msg += `J2: ${t2.toFixed(2)}s (Ecart: ${diff2.toFixed(2)})`;

        // Nettoyage écran
        this.broadcastUI("RÉSULTATS...", "", true);

        // Vérification victoire finale (3 points)
        if (this.scores[winnerId] >= 3) {
            this.finishGame(winnerId, msg);
        } else {
            // Manche suivante
            const winnerName = (winnerId === this.p1) ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', {
                title: `${winnerName} GAGNE LE POINT`,
                message: msg,
                btnText: "..."
            });

            setTimeout(() => {
                this.io.to(this.roomId).emit('modal', { close: true });
                this.startNewRound();
            }, 4000); // 4 secondes pour lire les temps
        }
    }

    private finishGame(winnerId: string, finalMsg: string) {
        const p1Name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE",
            message: `${p1Name} est le maître du temps !\nScore: ${this.scores[this.p1]}-${this.scores[this.p2]}`,
            btnText: "RETOUR AU HUB"
        });
        if (this.onEnd) this.onEnd(winnerId);
    }

    // Fonction d'affichage générique
    private broadcastUI(title: string, centerText: string, buttonsDisabled: boolean, keepButtonsActiveIfPlayed: boolean = false) {
        this.sendPlayerUI(this.p1, centerText, buttonsDisabled && !this.playerTimes[this.p1], title);
        this.sendPlayerUI(this.p2, centerText, buttonsDisabled && !this.playerTimes[this.p2], title);
    }

    private sendPlayerUI(playerId: string, centerText: string, disabled: boolean, customTitle?: string) {
        const ui: UIState = {
            title: customTitle || `⏱️ CHRONO - MANCHE ${this.scores[this.p1] + this.scores[this.p2] + 1}`,
            status: centerText,
            displays: [
                { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
                { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
            ],
            buttons: [
                {
                    label: "STOP 🛑",
                    actionId: "STOP",
                    color: "orange",
                    disabled: disabled,
                    size: 'giant' // On réutilise le gros bouton
                }
            ]
        };
        // Si le joueur a déjà joué, on grise son bouton pour lui montrer
        if (this.playerTimes[playerId]) {
            ui.buttons![0].disabled = true;
            ui.buttons![0].color = "grey";
            ui.buttons![0].label = "ATTENTE...";
        }

        this.io.to(playerId).emit('renderUI', ui);
    }

    handleDisconnect(playerId: string) {
        if (this.tickInterval) clearInterval(this.tickInterval);
        const winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd) this.onEnd(winner);
    }
}
