"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuelGame = void 0;
var DuelGame = /** @class */ (function () {
    function DuelGame(io, roomId, p1Id, p2Id) {
        this.players = [];
        // La fonction à appeler quand le duel est fini
        this.onEnd = null;
        this.io = io;
        this.roomId = roomId;
        this.players.push({ id: p1Id, hp: 3, ammo: 0, choice: null });
        this.players.push({ id: p2Id, hp: 3, ammo: 0, choice: null });
    }
    // Démarrage
    DuelGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.broadcastUI("Le combat commence !");
    };
    // Gestion des actions
    DuelGame.prototype.handleAction = function (playerId, actionId) {
        var player = this.players.find(function (p) { return p.id === playerId; });
        if (!player || player.choice)
            return;
        player.choice = actionId;
        var p1 = this.players[0];
        var p2 = this.players[1];
        if (p1.choice && p2.choice) {
            this.resolveTurn();
        }
        else {
            this.sendPlayerUI(player.id, "Attente de l'adversaire...", true);
        }
    };
    // Logique du tour
    DuelGame.prototype.resolveTurn = function () {
        var p1 = this.players[0];
        var p2 = this.players[1];
        var log = "";
        // Munitions
        [p1, p2].forEach(function (p) {
            if (p.choice === 'CHARGE')
                p.ammo++;
            if (p.choice === 'SHOOT')
                p.ammo--;
            if (p.choice === 'BAZOOKA')
                p.ammo -= 3;
        });
        // Dégâts
        var getDmg = function (atk, def) {
            if (atk === 'SHOOT')
                return (def === 'BLOCK') ? 0 : 1;
            if (atk === 'BAZOOKA')
                return 2;
            return 0;
        };
        var d1 = getDmg(p2.choice, p1.choice);
        var d2 = getDmg(p1.choice, p2.choice);
        p1.hp -= d1;
        p2.hp -= d2;
        log = "J1:".concat(p1.choice, " vs J2:").concat(p2.choice, ". ");
        if (d1 > 0)
            log += "J1 touché ! ";
        if (d2 > 0)
            log += "J2 touché ! ";
        // Reset choix
        p1.choice = null;
        p2.choice = null;
        // --- VERIFICATION VICTOIRE ---
        if (p1.hp <= 0 || p2.hp <= 0) {
            var winnerId = null;
            var msg = "";
            if (p1.hp <= 0 && p2.hp <= 0) {
                msg = "Double KO !";
            }
            else if (p1.hp <= 0) {
                msg = "L'ennemi gagne !";
                winnerId = p2.id;
            }
            else {
                msg = "VICTOIRE !";
                winnerId = p1.id;
            }
            // 1. Modale de fin (SANS reload)
            this.io.to(this.roomId).emit('modal', {
                title: "FIN DU MATCH",
                message: msg,
                btnText: "RETOUR AU HUB"
            });
            // 2. Prévenir la Session que c'est fini
            if (this.onEnd)
                this.onEnd(winnerId);
        }
        else {
            // Tour suivant
            this.io.to(this.roomId).emit('modal', { title: "RÉSULTAT", message: log, btnText: "SUIVANT" });
            this.broadcastUI("À vous de jouer !");
        }
    };
    // Affichage
    DuelGame.prototype.broadcastUI = function (statusMsg) {
        var _this = this;
        this.players.forEach(function (p) { return _this.sendPlayerUI(p.id, statusMsg, false); });
    };
    DuelGame.prototype.sendPlayerUI = function (targetId, status, buttonsDisabled) {
        var me = this.players.find(function (p) { return p.id === targetId; });
        var op = this.players.find(function (p) { return p.id !== targetId; });
        var buttons = [
            { label: "CHARGE 🔋", actionId: "CHARGE", color: "green", disabled: buttonsDisabled },
            { label: "TIRER 🔫", actionId: "SHOOT", color: "red", disabled: buttonsDisabled || me.ammo <= 0 },
            { label: "PARER 🛡️", actionId: "BLOCK", color: "blue", disabled: buttonsDisabled },
            { label: "BAZOOKA 💣", actionId: "BAZOOKA", color: "purple", disabled: buttonsDisabled || me.ammo < 3 }
        ];
        var ui = {
            title: "⚔️ DUEL TACTIQUE ⚔️",
            status: status,
            displays: [
                { type: 'bar', label: "MOI", value: "".concat(me.ammo, "\u26A1"), pct: Math.max(0, (me.hp / 3) * 100) },
                { type: 'bar', label: "ENNEMI", value: "".concat(op.ammo, "\u26A1"), pct: Math.max(0, (op.hp / 3) * 100) }
            ],
            buttons: buttons
        };
        this.io.to(targetId).emit('renderUI', ui);
    };
    DuelGame.prototype.handleDisconnect = function (playerId) {
        var winner = this.players.find(function (p) { return p.id !== playerId; });
        if (this.onEnd && winner)
            this.onEnd(winner.id);
    };
    return DuelGame;
}());
exports.DuelGame = DuelGame;
