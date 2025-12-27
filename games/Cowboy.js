"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CowboyGame = void 0;
var CowboyGame = /** @class */ (function () {
    function CowboyGame(io, roomId, p1Id, p2Id) {
        this.onEnd = null;
        // --- ÉTATS DE SYNCHRONISATION ---
        this.readyStatus = {};
        this.gameStarted = false;
        // --- ÉTAT DU JEU ---
        this.gameState = 'WAITING';
        this.timer = null;
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
    CowboyGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.updateUI(); // Affiche l'écran des règles
    };
    CowboyGame.prototype.handleAction = function (playerId, actionId) {
        var _this = this;
        if (actionId === 'QUIT_GAME') {
            if (this.timer)
                clearTimeout(this.timer); // STOPPE LE SERVEUR
            var winner = (playerId === this.p1) ? this.p2 : this.p1;
            this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Duel annulé", btnText: "OK" });
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
                    _this.startNewRound(); // Le premier chrono aléatoire ne part qu'ici
                }, 800);
            }
            return;
        }
        if (!this.gameStarted || this.gameState === 'ROUND_OVER')
            return;
        // Logique de tir
        if (actionId === 'SHOOT') {
            if (this.gameState === 'WAITING') {
                var loser = playerId;
                var winner = (loser === this.p1) ? this.p2 : this.p1;
                this.handleRoundWin(winner, "Faux départ ! 🚫");
            }
            else if (this.gameState === 'GO') {
                this.handleRoundWin(playerId, "Tir réussi ! 🎯");
            }
        }
    };
    CowboyGame.prototype.startNewRound = function () {
        var _this = this;
        this.gameState = 'WAITING';
        this.updateUI();
        // Timer aléatoire (2 à 6 secondes)
        var randomTime = Math.floor(Math.random() * 4000) + 2000;
        this.timer = setTimeout(function () {
            _this.triggerSignal();
        }, randomTime);
    };
    CowboyGame.prototype.triggerSignal = function () {
        if (this.gameState !== 'WAITING')
            return;
        this.gameState = 'GO';
        this.updateUI();
    };
    CowboyGame.prototype.handleRoundWin = function (winnerId, reason) {
        var _this = this;
        this.gameState = 'ROUND_OVER';
        if (this.timer)
            clearTimeout(this.timer);
        this.scores[winnerId]++;
        this.updateUI();
        var roundMsg = "".concat(reason, "\nScore : ").concat(this.scores[this.p1], " - ").concat(this.scores[this.p2]);
        if (this.scores[winnerId] >= 3) {
            this.finishGame(winnerId);
        }
        else {
            this.io.to(this.roomId).emit('modal', {
                title: "MANCHE TERMINÉE",
                message: roundMsg,
                btnText: "..."
            });
            setTimeout(function () {
                _this.io.to(_this.roomId).emit('modal', { close: true });
                _this.startNewRound();
            }, 3000);
        }
    };
    CowboyGame.prototype.finishGame = function (winnerId) {
        var name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE !",
            message: "".concat(name, " est le plus rapide de l'Ouest !"),
            btnText: "RETOUR"
        });
        if (this.onEnd)
            this.onEnd(winnerId);
    };
    CowboyGame.prototype.updateUI = function () {
        if (!this.gameStarted) {
            this.sendRulesUI(this.p1);
            this.sendRulesUI(this.p2);
        }
        else {
            this.sendPlayerGameUI(this.p1);
            this.sendPlayerGameUI(this.p2);
        }
    };
    CowboyGame.prototype.sendRulesUI = function (targetId) {
        var isReady = this.readyStatus[targetId];
        var otherReady = this.readyStatus[targetId === this.p1 ? this.p2 : this.p1];
        var ui = {
            title: "🤠 COWBOY",
            status: "OBJECTIF : 3 VICTOIRES\n\n" +
                "1. Attends que le bouton devienne VERT.\n" +
                "2. Dès que tu vois 'PAN !', clique le plus vite possible.\n" +
                "3. ATTENTION : Si tu tires quand le bouton est ORANGE, tu perds la manche !\n\n" +
                (otherReady ? "✅ L'adversaire est prêt !" : "⏳ L'adversaire lit les règles..."),
            displays: [],
            buttons: [
                {
                    label: isReady ? "EN POSITION..." : "DÉGAINER ! 👍",
                    actionId: "READY_PLAYER",
                    color: isReady ? "grey" : "green",
                    disabled: isReady
                }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    };
    CowboyGame.prototype.sendPlayerGameUI = function (targetId) {
        var status = "ATTENDEZ... ✋";
        var color = "orange";
        var btnLabel = "PAS ENCORE !";
        if (this.gameState === 'GO') {
            status = "TIREZ !!! 🔥";
            color = "green";
            btnLabel = "PAN !";
        }
        else if (this.gameState === 'ROUND_OVER') {
            status = "RÉSULTAT...";
            color = "grey";
            btnLabel = "...";
        }
        var ui = {
            title: "\uD83E\uDD20 MANCHE ".concat(this.scores[this.p1] + this.scores[this.p2] + 1),
            status: status,
            displays: [
                { type: 'text', label: "MOI", value: this.scores[targetId].toString() },
                { type: 'text', label: "RIVAL", value: this.scores[targetId === this.p1 ? this.p2 : this.p1].toString() }
            ],
            buttons: this.gameState !== 'ROUND_OVER' ? [
                { label: btnLabel, actionId: "SHOOT", color: color, disabled: false, size: 'giant' }
            ] : []
        };
        this.io.to(targetId).emit('renderUI', ui);
    };
    CowboyGame.prototype.refresh = function (playerId) { this.updateUI(); };
    CowboyGame.prototype.updatePlayerSocket = function (oldId, newId) {
        if (this.p1 === oldId)
            this.p1 = newId;
        if (this.p2 === oldId)
            this.p2 = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
        if (this.scores[oldId] !== undefined) {
            this.scores[newId] = this.scores[oldId];
            delete this.scores[oldId];
        }
    };
    CowboyGame.prototype.handleDisconnect = function (playerId) {
        if (this.timer)
            clearTimeout(this.timer);
        var winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd)
            this.onEnd(winner);
    };
    return CowboyGame;
}());
exports.CowboyGame = CowboyGame;
