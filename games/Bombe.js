"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BombeGame = void 0;
var BombeGame = /** @class */ (function () {
    function BombeGame(io, roomId, p1Id, p2Id) {
        this.onEnd = null;
        // --- ÉTATS DE SYNCHRONISATION ---
        this.readyStatus = {};
        this.gameStarted = false;
        // --- ÉTAT DU JEU ---
        this.bombHolder = "";
        this.explosionTimer = null;
        this.unlockButtonTimer = null;
        this.isButtonLocked = false;
        this.scores = {};
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
        this.readyStatus[p1Id] = false;
        this.readyStatus[p2Id] = false;
    }
    BombeGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.updateUI(); // Affiche les règles
    };
    BombeGame.prototype.handleAction = function (playerId, actionId) {
        var _this = this;
        // --- GESTION DU READY ---
        if (actionId === 'QUIT_GAME') {
            if (this.explosionTimer)
                clearTimeout(this.explosionTimer); // STOPPE L'EXPLOSION
            if (this.unlockButtonTimer)
                clearTimeout(this.unlockButtonTimer);
            var winner = (playerId === this.p1) ? this.p2 : this.p1;
            this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Bombe désamorcée", btnText: "OK" });
            if (this.onEnd)
                this.onEnd(winner);
            return;
        }
        if (actionId === 'READY_PLAYER') {
            this.readyStatus[playerId] = true;
            this.updateUI();
            if (this.readyStatus[this.p1] && this.readyStatus[this.p2]) {
                setTimeout(function () {
                    _this.gameStarted = true;
                    _this.startNewRound(); // On lance le timer de la bombe ICI
                }, 800);
            }
            return;
        }
        if (!this.gameStarted)
            return;
        if (playerId !== this.bombHolder)
            return;
        if (actionId === 'PASS') {
            this.switchHolder();
        }
    };
    BombeGame.prototype.startNewRound = function () {
        var _this = this;
        this.bombHolder = (Math.random() > 0.5) ? this.p1 : this.p2;
        var duration = Math.floor(Math.random() * 10000) + 10000;
        this.explosionTimer = setTimeout(function () {
            _this.explode();
        }, duration);
        this.updateInterface(true);
    };
    BombeGame.prototype.switchHolder = function () {
        if (this.unlockButtonTimer)
            clearTimeout(this.unlockButtonTimer);
        this.bombHolder = (this.bombHolder === this.p1) ? this.p2 : this.p1;
        this.updateInterface(true);
    };
    BombeGame.prototype.updateInterface = function (withCooldown) {
        var _this = this;
        var holderId = this.bombHolder;
        var otherId = (holderId === this.p1) ? this.p2 : this.p1;
        this.sendSafeUI(otherId);
        this.isButtonLocked = withCooldown;
        this.sendBombUI(holderId, withCooldown);
        if (withCooldown) {
            this.unlockButtonTimer = setTimeout(function () {
                _this.isButtonLocked = false;
                _this.sendBombUI(holderId, false);
            }, 2000);
        }
    };
    BombeGame.prototype.updateUI = function () {
        if (!this.gameStarted) {
            this.sendRulesUI(this.p1);
            this.sendRulesUI(this.p2);
        }
        else {
            var holderId = this.bombHolder;
            var otherId = (holderId === this.p1) ? this.p2 : this.p1;
            this.sendSafeUI(otherId);
            this.sendBombUI(holderId, this.isButtonLocked);
        }
    };
    BombeGame.prototype.sendRulesUI = function (targetId) {
        var isReady = this.readyStatus[targetId];
        var otherReady = this.readyStatus[targetId === this.p1 ? this.p2 : this.p1];
        var ui = {
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
    };
    BombeGame.prototype.getScoreDisplays = function () {
        return [
            { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
            { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
        ];
    };
    BombeGame.prototype.sendSafeUI = function (playerId) {
        var ui = {
            title: "\uD83D\uDCA3 MANCHE ".concat(this.getTotalRounds()),
            status: "L'ennemi a la bombe ! Priez... 🙏",
            displays: this.getScoreDisplays(),
            buttons: []
        };
        this.io.to(playerId).emit('renderUI', ui);
    };
    BombeGame.prototype.sendBombUI = function (playerId, disabled) {
        var ui = {
            title: "\uD83D\uDCA3 MANCHE ".concat(this.getTotalRounds()),
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
    };
    BombeGame.prototype.getTotalRounds = function () {
        return (this.scores[this.p1] || 0) + (this.scores[this.p2] || 0) + 1;
    };
    BombeGame.prototype.explode = function () {
        var _this = this;
        if (this.unlockButtonTimer)
            clearTimeout(this.unlockButtonTimer);
        var loser = this.bombHolder;
        var winner = (loser === this.p1) ? this.p2 : this.p1;
        this.scores[winner]++;
        this.io.to(this.roomId).emit('renderUI', {
            title: "BOUM !",
            status: "La bombe a explosé...",
            displays: this.getScoreDisplays(),
            buttons: []
        });
        if (this.scores[winner] >= 3) {
            this.finishGame(winner);
        }
        else {
            var winnerName = (winner === this.p1) ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', {
                title: "EXPLOSION !",
                message: "Point pour ".concat(winnerName, "."),
                btnText: "..."
            });
            setTimeout(function () {
                _this.io.to(_this.roomId).emit('modal', { close: true });
                _this.startNewRound();
            }, 3000);
        }
    };
    BombeGame.prototype.finishGame = function (winnerId) {
        var p1Name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE",
            message: "".concat(p1Name, " l'emporte !"),
            btnText: "RETOUR"
        });
        if (this.onEnd)
            this.onEnd(winnerId);
    };
    BombeGame.prototype.refresh = function (playerId) {
        this.updateUI();
    };
    BombeGame.prototype.updatePlayerSocket = function (oldId, newId) {
        if (this.p1 === oldId)
            this.p1 = newId;
        if (this.p2 === oldId)
            this.p2 = newId;
        if (this.bombHolder === oldId)
            this.bombHolder = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
        if (this.scores[oldId] !== undefined) {
            this.scores[newId] = this.scores[oldId];
            delete this.scores[oldId];
        }
    };
    BombeGame.prototype.handleDisconnect = function (playerId) {
        if (this.explosionTimer)
            clearTimeout(this.explosionTimer);
        if (this.unlockButtonTimer)
            clearTimeout(this.unlockButtonTimer);
        var winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd)
            this.onEnd(winner);
    };
    return BombeGame;
}());
exports.BombeGame = BombeGame;
