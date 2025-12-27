"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChronoGame = void 0;
var ChronoGame = /** @class */ (function () {
    function ChronoGame(io, roomId, p1Id, p2Id) {
        this.onEnd = null;
        // --- ÉTATS DE SYNCHRONISATION ---
        this.readyStatus = {};
        this.gameStarted = false;
        // --- ÉTAT DU JEU ---
        this.scores = {};
        this.targetTime = 0;
        this.startTime = 0;
        this.playerTimes = {};
        this.tickInterval = null;
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
        this.readyStatus[p1Id] = false;
        this.readyStatus[p2Id] = false;
    }
    ChronoGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.updateUI(); // Affiche l'écran des règles
    };
    ChronoGame.prototype.handleAction = function (playerId, actionId) {
        var _this = this;
        if (actionId === 'QUIT_GAME') {
            if (this.tickInterval)
                clearInterval(this.tickInterval); // STOPPE LE CHRONO
            var winner = (playerId === this.p1) ? this.p2 : this.p1;
            this.io.to(this.roomId).emit('modal', { title: "ABANDON", message: "Temps arrêté", btnText: "OK" });
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
                    _this.startNewRound(); // On lance la première manche
                }, 800);
            }
            return;
        }
        if (!this.gameStarted)
            return;
        // Logique de jeu (Bouton STOP)
        if (actionId === 'STOP') {
            if (this.playerTimes[playerId])
                return;
            var duration = (Date.now() - this.startTime) / 1000;
            this.playerTimes[playerId] = duration;
            this.updateUI();
            if (this.playerTimes[this.p1] && this.playerTimes[this.p2]) {
                this.resolveRound();
            }
        }
    };
    ChronoGame.prototype.startNewRound = function () {
        var _a;
        var _this = this;
        this.playerTimes = (_a = {}, _a[this.p1] = null, _a[this.p2] = null, _a);
        // Cible aléatoire entre 10 et 20s
        var randomSec = (Math.random() * 10) + 10;
        this.targetTime = Math.round(randomSec * 10) / 10;
        // Phase de préparation (3s)
        this.broadcastGameUI("CIBLE : ".concat(this.targetTime.toFixed(1), "s"), "PRÉPAREZ-VOUS...", true);
        setTimeout(function () {
            _this.beginTimer();
        }, 3000);
    };
    ChronoGame.prototype.beginTimer = function () {
        var _this = this;
        this.startTime = Date.now();
        this.updateUI();
        if (this.tickInterval)
            clearInterval(this.tickInterval);
        this.tickInterval = setInterval(function () {
            var elapsed = (Date.now() - _this.startTime) / 1000;
            if (_this.playerTimes[_this.p1] && _this.playerTimes[_this.p2]) {
                if (_this.tickInterval)
                    clearInterval(_this.tickInterval);
                return;
            }
            _this.updateUI();
            // Sécurité AFK
            if (elapsed > 30)
                _this.resolveRound();
        }, 1000);
    };
    ChronoGame.prototype.updateUI = function () {
        if (!this.gameStarted) {
            this.sendRulesUI(this.p1);
            this.sendRulesUI(this.p2);
        }
        else {
            this.sendPlayerGameUI(this.p1);
            this.sendPlayerGameUI(this.p2);
        }
    };
    ChronoGame.prototype.sendRulesUI = function (targetId) {
        var isReady = this.readyStatus[targetId];
        var otherReady = this.readyStatus[targetId === this.p1 ? this.p2 : this.p1];
        var ui = {
            title: "⏱️ CHRONO",
            status: "OBJECTIF : ARRÊTÉ AU PLUS PROCHE\n\n" +
                "1. Une cible s'affiche (ex: 14.2s).\n" +
                "2. Le chrono démarre : 1s, 2s, 3s...\n" +
                "3. APRÈS 5 SECONDES, LE CHRONO DEVIENT INVISIBLE !\n" +
                "4. Clique sur STOP pour valider ton temps.\n\n" +
                (otherReady ? "✅ L'adversaire est prêt !" : "⏳ L'adversaire lit les règles..."),
            displays: [],
            buttons: [
                {
                    label: isReady ? "ATTENTE..." : "D'ACCORD ! 👍",
                    actionId: "READY_PLAYER",
                    color: isReady ? "grey" : "green",
                    disabled: isReady
                }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    };
    ChronoGame.prototype.sendPlayerGameUI = function (playerId) {
        var elapsed = this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
        var hasPlayed = !!this.playerTimes[playerId];
        var centerText = "PRÉPARATION...";
        if (this.startTime > 0) {
            if (hasPlayed) {
                centerText = "TEMPS ENREGISTRÉ 🏁";
            }
            else {
                centerText = elapsed >= 5 ? "???" : "".concat(Math.floor(elapsed), "s...");
            }
        }
        var ui = {
            title: "CIBLE : ".concat(this.targetTime.toFixed(1), "s"),
            status: centerText,
            displays: [
                { type: 'text', label: "MOI", value: this.scores[playerId].toString() },
                { type: 'text', label: "RIVAL", value: this.scores[playerId === this.p1 ? this.p2 : this.p1].toString() }
            ],
            buttons: [
                {
                    label: hasPlayed ? "ATTENTE..." : "STOP 🛑",
                    actionId: "STOP",
                    color: hasPlayed ? "grey" : "orange",
                    disabled: hasPlayed || this.startTime === 0,
                    size: 'giant'
                }
            ]
        };
        this.io.to(playerId).emit('renderUI', ui);
    };
    ChronoGame.prototype.broadcastGameUI = function (title, status, disabled) {
        var _this = this;
        [this.p1, this.p2].forEach(function (id) {
            var ui = {
                title: title,
                status: status,
                displays: [
                    { type: 'text', label: "SCORE J1", value: _this.scores[_this.p1].toString() },
                    { type: 'text', label: "SCORE J2", value: _this.scores[_this.p2].toString() }
                ],
                buttons: [{ label: "STOP 🛑", actionId: "STOP", color: "orange", disabled: disabled, size: 'giant' }]
            };
            _this.io.to(id).emit('renderUI', ui);
        });
    };
    ChronoGame.prototype.resolveRound = function () {
        var _this = this;
        if (this.tickInterval)
            clearInterval(this.tickInterval);
        var t1 = this.playerTimes[this.p1] || 99.9;
        var t2 = this.playerTimes[this.p2] || 99.9;
        var diff1 = Math.abs(t1 - this.targetTime);
        var diff2 = Math.abs(t2 - this.targetTime);
        var winnerId = diff1 < diff2 ? this.p1 : this.p2;
        this.scores[winnerId]++;
        var msg = "Cible: ".concat(this.targetTime, "s\nJ1: ").concat(t1.toFixed(2), "s | J2: ").concat(t2.toFixed(2), "s");
        if (this.scores[winnerId] >= 3) {
            this.finishGame(winnerId, msg);
        }
        else {
            var name = winnerId === this.p1 ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', { title: "POINT POUR ".concat(name), message: msg, btnText: "..." });
            setTimeout(function () {
                _this.io.to(_this.roomId).emit('modal', { close: true });
                _this.startNewRound();
            }, 4000);
        }
    };
    ChronoGame.prototype.finishGame = function (winnerId, msg) {
        var name = winnerId === this.p1 ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE !",
            message: "".concat(name, " est le ma\u00EEtre du temps !\n").concat(msg),
            btnText: "RETOUR"
        });
        if (this.onEnd)
            this.onEnd(winnerId);
    };
    ChronoGame.prototype.refresh = function (playerId) { this.updateUI(); };
    ChronoGame.prototype.updatePlayerSocket = function (oldId, newId) {
        if (this.p1 === oldId)
            this.p1 = newId;
        if (this.p2 === oldId)
            this.p2 = newId;
        if (this.readyStatus[oldId] !== undefined) {
            this.readyStatus[newId] = this.readyStatus[oldId];
            delete this.readyStatus[oldId];
        }
        if (this.playerTimes[oldId] !== undefined) {
            this.playerTimes[newId] = this.playerTimes[oldId];
            delete this.playerTimes[oldId];
        }
        if (this.scores[oldId] !== undefined) {
            this.scores[newId] = this.scores[oldId];
            delete this.scores[oldId];
        }
    };
    ChronoGame.prototype.handleDisconnect = function (playerId) {
        if (this.tickInterval)
            clearInterval(this.tickInterval);
        var winner = playerId === this.p1 ? this.p2 : this.p1;
        if (this.onEnd)
            this.onEnd(winner);
    };
    return ChronoGame;
}());
exports.ChronoGame = ChronoGame;
