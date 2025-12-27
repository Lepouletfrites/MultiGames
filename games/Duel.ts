import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

interface PlayerState {
    id: string;
    hp: number;
    ammo: number;
    choice: string | null;
}

export class DuelGame implements GameInstance {
    private io: Server;
    private roomId: string;
    private players: PlayerState[] = [];
    
    // La fonction à appeler quand le duel est fini
    private onEnd: OnGameEndCallback | null = null;

    constructor(io: Server, roomId: string, p1Id: string, p2Id: string) {
        this.io = io;
        this.roomId = roomId;
        this.players.push({ id: p1Id, hp: 3, ammo: 0, choice: null });
        this.players.push({ id: p2Id, hp: 3, ammo: 0, choice: null });
    }

    // Démarrage
    start(onEnd: OnGameEndCallback) {
        this.onEnd = onEnd;
        this.broadcastUI("Le combat commence !");
    }

    // Gestion des actions
    handleAction(playerId: string, actionId: string) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || player.choice) return;

        player.choice = actionId;

        const p1 = this.players[0];
        const p2 = this.players[1];

        if (p1.choice && p2.choice) {
            this.resolveTurn();
        } else {
            this.sendPlayerUI(player.id, "Attente de l'adversaire...", true);
        }
    }

    // Logique du tour
    private resolveTurn() {
        const p1 = this.players[0];
        const p2 = this.players[1];
        let log = "";

        // Munitions
        [p1, p2].forEach(p => {
            if (p.choice === 'CHARGE') p.ammo++;
            if (p.choice === 'SHOOT') p.ammo--;
            if (p.choice === 'BAZOOKA') p.ammo -= 3;
        });

        // Dégâts
        const getDmg = (atk: string, def: string) => {
            if (atk === 'SHOOT') return (def === 'BLOCK') ? 0 : 1;
            if (atk === 'BAZOOKA') return 2;
            return 0;
        };

        const d1 = getDmg(p2.choice!, p1.choice!);
        const d2 = getDmg(p1.choice!, p2.choice!);

        p1.hp -= d1;
        p2.hp -= d2;

        log = `J1:${p1.choice} vs J2:${p2.choice}. `;
        if(d1 > 0) log += "J1 touché ! ";
        if(d2 > 0) log += "J2 touché ! ";

        // Reset choix
        p1.choice = null;
        p2.choice = null;

        // --- VERIFICATION VICTOIRE ---
        if (p1.hp <= 0 || p2.hp <= 0) {
            let winnerId: string | null = null;
            let msg = "";

            if (p1.hp <= 0 && p2.hp <= 0) { msg = "Double KO !"; }
            else if (p1.hp <= 0) { msg = "L'ennemi gagne !"; winnerId = p2.id; }
            else { msg = "VICTOIRE !"; winnerId = p1.id; }

            // 1. Modale de fin (SANS reload)
            this.io.to(this.roomId).emit('modal', { 
                title: "FIN DU MATCH", 
                message: msg, 
                btnText: "RETOUR AU HUB" 
            });

            // 2. Prévenir la Session que c'est fini
            if (this.onEnd) this.onEnd(winnerId);

        } else {
            // Tour suivant
            this.io.to(this.roomId).emit('modal', { title: "RÉSULTAT", message: log, btnText: "SUIVANT" });
            this.broadcastUI("À vous de jouer !");
        }
    }

    // Affichage
    private broadcastUI(statusMsg: string) {
        this.players.forEach(p => this.sendPlayerUI(p.id, statusMsg, false));
    }

    private sendPlayerUI(targetId: string, status: string, buttonsDisabled: boolean) {
        const me = this.players.find(p => p.id === targetId)!;
        const op = this.players.find(p => p.id !== targetId)!;

        const buttons = [
            { label: "CHARGE 🔋", actionId: "CHARGE", color: "green", disabled: buttonsDisabled },
            { label: "TIRER 🔫", actionId: "SHOOT", color: "red", disabled: buttonsDisabled || me.ammo <= 0 },
            { label: "PARER 🛡️", actionId: "BLOCK", color: "blue", disabled: buttonsDisabled },
            { label: "BAZOOKA 💣", actionId: "BAZOOKA", color: "purple", disabled: buttonsDisabled || me.ammo < 3 }
        ];

        const ui: UIState = {
            title: "⚔️ DUEL TACTIQUE ⚔️",
            status: status,
            displays: [
                { type: 'bar', label: "MOI", value: `${me.ammo}⚡`, pct: Math.max(0, (me.hp/3)*100) },
                { type: 'bar', label: "ENNEMI", value: `${op.ammo}⚡`, pct: Math.max(0, (op.hp/3)*100) }
            ],
            buttons: buttons
        };

        this.io.to(targetId).emit('renderUI', ui);
    }

    handleDisconnect(playerId: string) {
        const winner = this.players.find(p => p.id !== playerId);
        if (this.onEnd && winner) this.onEnd(winner.id);
    }
}
