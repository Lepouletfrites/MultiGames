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
    private onEnd: OnGameEndCallback | null = null;

    // --- ÉTATS DE SYNCHRONISATION ---
    private readyStatus: { [key: string]: boolean } = {};
    private gameStarted: boolean = false;

    constructor(io: Server, roomId: string, p1Id: string, p2Id: string) {
        this.io = io;
        this.roomId = roomId;
        this.players.push({ id: p1Id, hp: 3, ammo: 0, choice: null });
        this.players.push({ id: p2Id, hp: 3, ammo: 0, choice: null });

        this.readyStatus[p1Id] = false;
        this.readyStatus[p2Id] = false;
    }

    start(onEnd: OnGameEndCallback) {
        this.onEnd = onEnd;
        this.updateUI(); // Affiche l'écran des règles
    }

    handleAction(playerId: string, actionId: string) {
        if (actionId === 'QUIT_GAME') {
    const winner = (playerId === this.p1) ? this.p2 : this.p1;
    // On peut envoyer une modale avant de fermer
    this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Partie quittée", btnText: "OK" });
    if (this.onEnd) this.onEnd(winner);
}

        // --- GESTION DU READY ---
        if (actionId === 'READY_PLAYER') {
            this.readyStatus[playerId] = true;
            this.updateUI();

            if (this.readyStatus[this.players[0].id] && this.readyStatus[this.players[1].id]) {
                setTimeout(() => {
                    this.gameStarted = true;
                    this.updateUI();
                }, 800);
            }
            return;
        }

        if (!this.gameStarted) return;

        // Logique de jeu (Tour par tour)
        const player = this.players.find(p => p.id === playerId);
        if (!player || player.choice) return;

        player.choice = actionId;

        const p1 = this.players[0];
        const p2 = this.players[1];

        if (p1.choice && p2.choice) {
            this.resolveTurn();
        } else {
            this.updateUI(); // Met à jour l'affichage "Attente..." pour celui qui a cliqué
        }
    }

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

        p1.choice = null;
        p2.choice = null;

        if (p1.hp <= 0 || p2.hp <= 0) {
            let winnerId: string | null = null;
            let msg = p1.hp <= 0 && p2.hp <= 0 ? "Double KO !" : (p1.hp <= 0 ? "L'ennemi gagne !" : "VICTOIRE !");
            winnerId = p1.hp <= 0 && p2.hp <= 0 ? null : (p1.hp <= 0 ? p2.id : p1.id);

            this.io.to(this.roomId).emit('modal', { title: "FIN DU MATCH", message: msg, btnText: "RETOUR" });
            if (this.onEnd) this.onEnd(winnerId);
        } else {
            this.io.to(this.roomId).emit('modal', { title: "RÉSULTAT", message: log, btnText: "SUIVANT" });
            setTimeout(() => {
                this.updateUI();
            }, 800); 
        }
    }

    private updateUI() {
        if (!this.gameStarted) {
            this.players.forEach(p => this.sendRulesUI(p.id));
        } else {
            this.players.forEach(p => this.sendPlayerGameUI(p.id));
        }
    }

    private sendRulesUI(targetId: string) {
        const isReady = this.readyStatus[targetId];
        const otherId = this.players.find(p => p.id !== targetId)?.id || "";
        const otherReady = this.readyStatus[otherId];

        const ui: UIState = {
            title: "⚔️ DUEL TACTIQUE",
            status: "SYSTÈME DE COMBAT :\n\n" +
                    "1. CHARGE : +1 éclair ⚡ (indispensable pour tirer).\n" +
                    "2. TIRER : -1 éclair ⚡ (inflige 1 dégât).\n" +
                    "3. PARER : Protège du TIR mais pas du BAZOOKA.\n" +
                    "4. BAZOOKA : -3 éclairs ⚡ (inflige 2 dégâts, imblocable).\n\n" +
                    (otherReady ? "✅ L'adversaire est prêt !" : "⏳ L'adversaire lit les règles..."),
            displays: [],
            buttons: [
                {
                    label: isReady ? "EN ATTENTE..." : "S'ÉQUIPER ! 🛡️",
                    actionId: "READY_PLAYER",
                    color: isReady ? "grey" : "green",
                    disabled: isReady
                }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    private sendPlayerGameUI(targetId: string) {
        const me = this.players.find(p => p.id === targetId)!;
        const op = this.players.find(p => p.id !== targetId)!;
        const hasPlayed = !!me.choice;

        const ui: UIState = {
            title: "⚔️ DUEL EN COURS",
            status: hasPlayed ? "Attente de l'adversaire... ⏳" : "À vous de jouer !",
            displays: [
                { type: 'bar', label: "MOI", value: `${me.ammo}⚡`, pct: Math.max(0, (me.hp/3)*100) },
                { type: 'bar', label: "ENNEMI", value: `${op.ammo}⚡`, pct: Math.max(0, (op.hp/3)*100) }
            ],
            buttons: [
                { label: "CHARGE 🔋", actionId: "CHARGE", color: "green", disabled: hasPlayed },
                { label: "TIRER 🔫", actionId: "SHOOT", color: "red", disabled: hasPlayed || me.ammo <= 0 },
                { label: "PARER 🛡️", actionId: "BLOCK", color: "blue", disabled: hasPlayed },
                { label: "BAZOOKA 💣", actionId: "BAZOOKA", color: "purple", disabled: hasPlayed || me.ammo < 3 }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    refresh(playerId: string) { this.updateUI(); }

    updatePlayerSocket(oldId: string, newId: string) {
        const player = this.players.find(p => p.id === oldId);
        if (player) player.id = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
    }

    handleDisconnect(playerId: string) {
        const winner = this.players.find(p => p.id !== playerId);
        if (this.onEnd && winner) this.onEnd(winner.id);
    }
}
