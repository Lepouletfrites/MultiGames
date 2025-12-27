"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MineGame = void 0;
var MineGame = /** @class */ (function () {
    function MineGame(io, roomId, p1Id, p2Id) {
        this.onEnd = null;
        this.readyStatus = {};
        this.gameStarted = false;
        this.scores = {};
        this.currentPot = 0;
        this.successfulOpens = 0;
        this.rewards = [1, 2, 4, 8];
        this.chests = [0, 0, 0, 0, 0];
        this.bombIndex = 0;
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
    MineGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.updateUI();
    };
    MineGame.prototype.handleAction = function (playerId, actionId) {
        var _this = this;
        // --- GESTION DU BOUTON QUITTER (HAUT DROITE) ---
        if (actionId === 'QUIT_GAME') {
            var winner = (playerId === this.p1) ? this.p2 : this.p1;
            this.io.to(this.roomId).emit('modal', {
                title: "ABANDON 🏳️",
                message: "La partie a été interrompue.",
                btnText: "OK"
            });
            if (this.onEnd)
                this.onEnd(winner);
            return;
        }
        // --- GESTION DU READY ---
        if (actionId === 'READY_PLAYER') {
            this.readyStatus[playerId] = true;
            this.updateUI();
            if (this.readyStatus[this.p1] && this.readyStatus[this.p2]) {
                setTimeout(function () {
                    _this.gameStarted = true;
                    _this.updateUI();
                }, 800);
            }
            return;
        }
        if (!this.gameStarted || playerId !== this.currentPlayer)
            return;
        if (actionId === 'BANK')
            this.bankPoints();
        else if (actionId.startsWith('OPEN_')) {
            var index = parseInt(actionId.replace('OPEN_', ''));
            this.openChest(index);
        }
    };
    MineGame.prototype.updateUI = function () {
        this.sendPlayerUI(this.p1);
        this.sendPlayerUI(this.p2);
    };
    MineGame.prototype.sendPlayerUI = function (targetId) {
        // --- ÉCRAN DES RÈGLES ---
        if (!this.gameStarted) {
            var isReady = this.readyStatus[targetId];
            var otherReady = this.readyStatus[targetId === this.p1 ? this.p2 : this.p1];
            var ui_1 = {
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
            this.io.to(targetId).emit('renderUI', ui_1);
            return;
        }
        // --- ÉCRAN DU JEU ---
        var isMyTurn = (targetId === this.currentPlayer);
        var buttons = [];
        this.chests.forEach(function (state, i) {
            var label = "📦";
            var color = "blue";
            if (state === 1) {
                label = "💎";
                color = "green";
            }
            if (state === 2) {
                label = "💥";
                color = "red";
            }
            buttons.push({ label: label, actionId: "OPEN_".concat(i), color: color, disabled: !isMyTurn || state !== 0 });
        });
        buttons.push({
            label: "\uD83D\uDCB0 ENCAISSER (+".concat(this.currentPot, ")"),
            actionId: "BANK",
            color: "orange",
            disabled: !isMyTurn || this.currentPot === 0
        });
        var ui = {
            title: "MINE : OBJECTIF 30",
            status: isMyTurn ? "\u00C0 TON TOUR ! (Pot: ".concat(this.currentPot, " pts)") : "L'adversaire tente sa chance...",
            displays: [
                { type: 'text', label: "MOI", value: this.scores[targetId].toString() },
                { type: 'text', label: "RIVAL", value: this.scores[targetId === this.p1 ? this.p2 : this.p1].toString() }
            ],
            buttons: buttons
        };
        this.io.to(targetId).emit('renderUI', ui);
    };
    // (Reste des méthodes identiques au script précédent...)
    MineGame.prototype.resetRound = function () {
        this.chests = [0, 0, 0, 0, 0];
        this.bombIndex = Math.floor(Math.random() * 5);
        this.currentPot = 0;
        this.successfulOpens = 0;
    };
    MineGame.prototype.openChest = function (index) {
        var _this = this;
        if (this.chests[index] !== 0)
            return;
        if (index === this.bombIndex) {
            this.chests[index] = 2;
            this.currentPot = 0;
            this.updateUI();
            this.io.to(this.roomId).emit('modal', { title: "BOUM ! 💥", message: "Gourmandise punie !", btnText: "Mince" });
            setTimeout(function () { _this.io.to(_this.roomId).emit('modal', { close: true }); _this.nextTurn(); }, 2000);
        }
        else {
            this.chests[index] = 1;
            this.currentPot += this.rewards[this.successfulOpens];
            this.successfulOpens++;
            if (this.successfulOpens === 4)
                this.bankPoints();
            else
                this.updateUI();
        }
    };
    MineGame.prototype.bankPoints = function () {
        if (this.currentPot > 0)
            this.scores[this.currentPlayer] += this.currentPot;
        if (this.scores[this.currentPlayer] >= 30)
            this.finishGame();
        else
            this.nextTurn();
    };
    MineGame.prototype.nextTurn = function () {
        this.currentPlayer = (this.currentPlayer === this.p1) ? this.p2 : this.p1;
        this.resetRound();
        this.updateUI();
    };
    MineGame.prototype.finishGame = function () {
        var winner = this.currentPlayer;
        var name = (winner === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', { title: "🏆 BRAQUAGE RÉUSSI", message: "".concat(name, " gagne !"), btnText: "RETOUR" });
        if (this.onEnd)
            this.onEnd(winner);
    };
    MineGame.prototype.refresh = function (playerId) { this.updateUI(); };
    MineGame.prototype.updatePlayerSocket = function (oldId, newId) {
        if (this.p1 === oldId)
            this.p1 = newId;
        if (this.p2 === oldId)
            this.p2 = newId;
        if (this.currentPlayer === oldId)
            this.currentPlayer = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
        if (this.scores[oldId] !== undefined) {
            this.scores[newId] = this.scores[oldId];
            delete this.scores[oldId];
        }
    };
    MineGame.prototype.handleDisconnect = function (playerId) {
        var winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd)
            this.onEnd(winner);
    };
    return MineGame;
}());
exports.MineGame = MineGame;
