"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BombeGame = void 0;
var BombeGame = /** @class */ (function () {
    function BombeGame(io, roomId, p1Id, p2Id) {
        this.onEnd = null;
        // État du jeu
        this.bombHolder = "";
        this.explostionTimer = null;
        this.unlockButtonTimer = null;
        // Scores (J1 vs J2)
        this.scores = {};
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        // Initialisation des scores
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
    }
    BombeGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.startNewRound();
    };
    BombeGame.prototype.startNewRound = function () {
        var _this = this;
        // La bombe commence aléatoirement chez l'un des deux à chaque manche
        this.bombHolder = (Math.random() > 0.5) ? this.p1 : this.p2;
        // Durée secrète (entre 10 et 20 secondes)
        var duration = Math.floor(Math.random() * 10000) + 10000;
        this.explostionTimer = setTimeout(function () {
            _this.explode();
        }, duration);
        // On lance l'interface (avec le délai de blocage de 2s au début)
        this.updateInterface(true);
    };
    BombeGame.prototype.handleAction = function (playerId, actionId) {
        // Sécurité : Si ce n'est pas celui qui a la bombe, on ignore
        if (playerId !== this.bombHolder)
            return;
        if (actionId === 'PASS') {
            this.switchHolder();
        }
    };
    BombeGame.prototype.switchHolder = function () {
        // Si le joueur précédent avait encore un timer de blocage en cours (bug rare), on le coupe
        if (this.unlockButtonTimer)
            clearTimeout(this.unlockButtonTimer);
        // On passe la bombe à l'autre
        this.bombHolder = (this.bombHolder === this.p1) ? this.p2 : this.p1;
        // Mise à jour de l'interface (avec blocage pour le nouveau)
        this.updateInterface(true);
    };
    BombeGame.prototype.updateInterface = function (withCooldown) {
        var _this = this;
        var holderId = this.bombHolder;
        var otherId = (holderId === this.p1) ? this.p2 : this.p1;
        // UI pour celui qui est SAFE
        this.sendSafeUI(otherId);
        // UI pour celui qui a la BOMBE
        if (withCooldown) {
            // PHASE 1 : BLOQUÉ (Gros bouton rouge GRISÉ)
            this.sendBombUI(holderId, true);
            // Dans 2 secondes, on débloque
            this.unlockButtonTimer = setTimeout(function () {
                _this.sendBombUI(holderId, false);
            }, 2000);
        }
        else {
            // PHASE 2 : ACTIF
            this.sendBombUI(holderId, false);
        }
    };
    // Affiche les scores en haut de l'écran
    BombeGame.prototype.getScoreDisplays = function () {
        return [
            { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
            { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
        ];
    };
    BombeGame.prototype.sendSafeUI = function (playerId) {
        // Astuce : any pour éviter les erreurs de type strict sur 'text' si besoin
        var displays = this.getScoreDisplays();
        displays.push({ type: 'text', label: "STATUS", value: "SAFE 😅" });
        var ui = {
            title: "\uD83D\uDCA3 MANCHE ".concat(this.getTotalRounds()),
            status: "L'ennemi a la bombe ! Priez...",
            displays: displays,
            buttons: [] // Pas de bouton
        };
        this.io.to(playerId).emit('renderUI', ui);
    };
    BombeGame.prototype.sendBombUI = function (playerId, disabled) {
        var displays = this.getScoreDisplays();
        displays.push({ type: 'text', label: "STATUS", value: "DANGER 💀" });
        var ui = {
            title: "\uD83D\uDCA3 MANCHE ".concat(this.getTotalRounds()),
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
    };
    BombeGame.prototype.getTotalRounds = function () {
        return this.scores[this.p1] + this.scores[this.p2] + 1;
    };
    BombeGame.prototype.explode = function () {
        var _this = this;
        if (this.unlockButtonTimer)
            clearTimeout(this.unlockButtonTimer);
        // Celui qui a la bombe a perdu la manche
        var loser = this.bombHolder;
        var winner = (loser === this.p1) ? this.p2 : this.p1;
        // Point pour le survivant
        this.scores[winner]++;
        // 1. NETTOYAGE ÉCRAN (On enlève le bouton pour voir l'explosion)
        var uiClean = {
            title: "BOUM !",
            status: "La bombe a explosé...",
            displays: this.getScoreDisplays(),
            buttons: []
        };
        this.io.to(this.roomId).emit('renderUI', uiClean);
        // Vérification victoire (Premier à 3 points)
        if (this.scores[winner] >= 3) {
            this.finishGame(winner);
        }
        else {
            // Manche suivante
            var winnerName = (winner === this.p1) ? "J1" : "J2";
            this.io.to(this.roomId).emit('modal', {
                title: "EXPLOSION !",
                message: "Point pour ".concat(winnerName, ".\nPr\u00E9parez-vous pour la suite..."),
                btnText: "..."
            });
            setTimeout(function () {
                // On ferme la modale et on relance
                _this.io.to(_this.roomId).emit('modal', { close: true });
                _this.startNewRound();
            }, 3000);
        }
    };
    BombeGame.prototype.finishGame = function (winnerId) {
        var p1Name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE",
            message: "".concat(p1Name, " a surv\u00E9cu \u00E0 la guerre !\nScore final: ").concat(this.scores[this.p1], "-").concat(this.scores[this.p2]),
            btnText: "RETOUR AU HUB"
        });
        if (this.onEnd)
            this.onEnd(winnerId);
    };
    BombeGame.prototype.handleDisconnect = function (playerId) {
        if (this.explostionTimer)
            clearTimeout(this.explostionTimer);
        if (this.unlockButtonTimer)
            clearTimeout(this.unlockButtonTimer);
        var winner = (playerId === this.p1) ? this.p2 : this.p1;
        if (this.onEnd)
            this.onEnd(winner);
    };
    return BombeGame;
}());
exports.BombeGame = BombeGame;
