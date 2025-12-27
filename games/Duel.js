"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuelGame = void 0;
var DuelGame = /** @class */ (function () {
    function DuelGame(io, roomId, p1Id, p2Id) {
        this.players = [];
        this.onEnd = null;
        // --- ÉTATS DE SYNCHRONISATION ---
        this.readyStatus = {};
        this.gameStarted = false;
        this.io = io;
        this.roomId = roomId;
        this.players.push({ id: p1Id, hp: 3, ammo: 0, choice: null });
        this.players.push({ id: p2Id, hp: 3, ammo: 0, choice: null });
        this.readyStatus[p1Id] = false;
        this.readyStatus[p2Id] = false;
    }
    DuelGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.updateUI(); // Affiche l'écran des règles
    };
    DuelGame.prototype.handleAction = function (playerId, actionId) {
        var _this = this;
        if (actionId === 'QUIT_GAME') {
            var winner = (playerId === this.p1) ? this.p2 : this.p1;
            // On peut envoyer une modale avant de fermer
            this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Partie quittée", btnText: "OK" });
            if (this.onEnd)
                this.onEnd(winner);
        }
        // --- GESTION DU READY ---
        if (actionId === 'READY_PLAYER') {
            this.readyStatus[playerId] = true;
            this.updateUI();
            if (this.readyStatus[this.players[0].id] && this.readyStatus[this.players[1].id]) {
                setTimeout(function () {
                    _this.gameStarted = true;
                    _this.updateUI();
                }, 800);
            }
            return;
        }
        if (!this.gameStarted)
            return;
        // Logique de jeu (Tour par tour)
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
            this.updateUI(); // Met à jour l'affichage "Attente..." pour celui qui a cliqué
        }
    };
    DuelGame.prototype.resolveTurn = function () {
        var _this = this;
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
        p1.choice = null;
        p2.choice = null;
        if (p1.hp <= 0 || p2.hp <= 0) {
            var winnerId = null;
            var msg = p1.hp <= 0 && p2.hp <= 0 ? "Double KO !" : (p1.hp <= 0 ? "L'ennemi gagne !" : "VICTOIRE !");
            winnerId = p1.hp <= 0 && p2.hp <= 0 ? null : (p1.hp <= 0 ? p2.id : p1.id);
            this.io.to(this.roomId).emit('modal', { title: "FIN DU MATCH", message: msg, btnText: "RETOUR" });
            if (this.onEnd)
                this.onEnd(winnerId);
        }
        else {
            this.io.to(this.roomId).emit('modal', { title: "RÉSULTAT", message: log, btnText: "SUIVANT" });
            setTimeout(function () {
                _this.updateUI();
            }, 800);
        }
    };
    DuelGame.prototype.updateUI = function () {
        var _this = this;
        if (!this.gameStarted) {
            this.players.forEach(function (p) { return _this.sendRulesUI(p.id); });
        }
        else {
            this.players.forEach(function (p) { return _this.sendPlayerGameUI(p.id); });
        }
    };
    DuelGame.prototype.sendRulesUI = function (targetId) {
        var _a;
        var isReady = this.readyStatus[targetId];
        var otherId = ((_a = this.players.find(function (p) { return p.id !== targetId; })) === null || _a === void 0 ? void 0 : _a.id) || "";
        var otherReady = this.readyStatus[otherId];
        var ui = {
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
    };
    DuelGame.prototype.sendPlayerGameUI = function (targetId) {
        var me = this.players.find(function (p) { return p.id === targetId; });
        var op = this.players.find(function (p) { return p.id !== targetId; });
        var hasPlayed = !!me.choice;
        var ui = {
            title: "⚔️ DUEL EN COURS",
            status: hasPlayed ? "Attente de l'adversaire... ⏳" : "À vous de jouer !",
            displays: [
                { type: 'bar', label: "MOI", value: "".concat(me.ammo, "\u26A1"), pct: Math.max(0, (me.hp / 3) * 100) },
                { type: 'bar', label: "ENNEMI", value: "".concat(op.ammo, "\u26A1"), pct: Math.max(0, (op.hp / 3) * 100) }
            ],
            buttons: [
                { label: "CHARGE 🔋", actionId: "CHARGE", color: "green", disabled: hasPlayed },
                { label: "TIRER 🔫", actionId: "SHOOT", color: "red", disabled: hasPlayed || me.ammo <= 0 },
                { label: "PARER 🛡️", actionId: "BLOCK", color: "blue", disabled: hasPlayed },
                { label: "BAZOOKA 💣", actionId: "BAZOOKA", color: "purple", disabled: hasPlayed || me.ammo < 3 }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    };
    DuelGame.prototype.refresh = function (playerId) { this.updateUI(); };
    DuelGame.prototype.updatePlayerSocket = function (oldId, newId) {
        var player = this.players.find(function (p) { return p.id === oldId; });
        if (player)
            player.id = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
    };
    DuelGame.prototype.handleDisconnect = function (playerId) {
        var winner = this.players.find(function (p) { return p.id !== playerId; });
        if (this.onEnd && winner)
            this.onEnd(winner.id);
    };
    return DuelGame;
}());
exports.DuelGame = DuelGame;
