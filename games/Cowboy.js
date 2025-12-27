"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CowboyGame = void 0;
var CowboyGame = /** @class */ (function () {
    function CowboyGame(io, roomId, p1Id, p2Id) {
        this.onEnd = null;
        // État du jeu
        this.gameState = 'WAITING';
        this.timer = null;
        // NOUVEAU : Scores de la partie
        this.scores = {};
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1Id;
        this.p2 = p2Id;
        // Initialisation des scores à 0
        this.scores[p1Id] = 0;
        this.scores[p2Id] = 0;
    }
    CowboyGame.prototype.start = function (onEnd) {
        this.onEnd = onEnd;
        this.startNewRound();
    };
    // Lance une nouvelle manche
    CowboyGame.prototype.startNewRound = function () {
        var _this = this;
        this.gameState = 'WAITING';
        // 1. On affiche "PRÉPAREZ-VOUS..." avec le gros bouton Orange
        this.broadcastUI("PRÉPAREZ-VOUS...", "orange", "ATTENDEZ ! ✋");
        // 2. Timer aléatoire (2 à 6 secondes)
        var randomTime = Math.floor(Math.random() * 4000) + 2000;
        this.timer = setTimeout(function () {
            _this.triggerSignal();
        }, randomTime);
    };
    CowboyGame.prototype.triggerSignal = function () {
        if (this.gameState !== 'WAITING')
            return;
        this.gameState = 'GO';
        // BOUTON VERT et TEXTE QUI CHANGE
        this.broadcastUI("TIREZ !!!", "green", "PAN ! 🔥");
    };
    CowboyGame.prototype.handleAction = function (playerId, actionId) {
        // Si la manche est déjà finie, on ignore les clics
        if (this.gameState === 'ROUND_OVER')
            return;
        // CAS 1 : FAUX DÉPART (Trop tôt)
        if (this.gameState === 'WAITING') {
            var loser = playerId;
            var winner = (loser === this.p1) ? this.p2 : this.p1;
            this.handleRoundWin(winner, "Faux départ ! 🚫");
        }
        // CAS 2 : TIR VALIDE (Le premier qui clique)
        else if (this.gameState === 'GO') {
            this.handleRoundWin(playerId, "Tir réussi ! 🎯");
        }
    };
    CowboyGame.prototype.handleRoundWin = function (winnerId, reason) {
        var _this = this;
        this.gameState = 'ROUND_OVER';
        if (this.timer)
            clearTimeout(this.timer);
        this.scores[winnerId]++;
        // 1. NETTOYAGE : On envoie une interface SANS boutons pour que l'écran soit propre
        // Cela efface le gros bouton orange/vert pendant qu'on lit le résultat
        var uiClean = {
            title: "\uD83E\uDD20 MANCHE ".concat(this.scores[this.p1] + this.scores[this.p2], " TERMINEE"),
            status: "Résultats...",
            displays: [
                { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
                { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
            ],
            buttons: [] // Liste vide = Pas de bouton à l'écran
        };
        this.io.to(this.roomId).emit('renderUI', uiClean);
        // Préparation du message
        var p1Score = this.scores[this.p1];
        var p2Score = this.scores[this.p2];
        var roundMsg = "".concat(reason, "\nScore : ").concat(p1Score, " - ").concat(p2Score);
        if (this.scores[winnerId] >= 3) {
            // Victoire finale
            this.finishGame(winnerId);
        }
        else {
            // Manche suivante
            this.io.to(this.roomId).emit('modal', {
                title: "MANCHE TERMINÉE",
                message: roundMsg,
                btnText: "..." // Le bouton est là pour la déco, ça va changer tout seul
            });
            setTimeout(function () {
                // 2. MODIFICATION ICI : On ferme juste la modale, sans afficher de texte "GO"
                _this.io.to(_this.roomId).emit('modal', { close: true });
                // Et on relance immédiatement
                _this.startNewRound();
            }, 3000);
        }
    };
    CowboyGame.prototype.finishGame = function (winnerId) {
        var p1Name = (winnerId === this.p1) ? "J1" : "J2";
        this.io.to(this.roomId).emit('modal', {
            title: "VICTOIRE FINALE !",
            message: "Le ".concat(p1Name, " remporte le duel (Score: ").concat(this.scores[this.p1], "-").concat(this.scores[this.p2], ")"),
            btnText: "RETOUR AU HUB"
        });
        if (this.onEnd) {
            this.onEnd(winnerId);
            this.onEnd = null;
        }
    };
    CowboyGame.prototype.broadcastUI = function (status, color, btnLabel) {
        var ui = {
            title: "\uD83E\uDD20 MANCHE ".concat(this.scores[this.p1] + this.scores[this.p2] + 1),
            status: status,
            displays: [
                { type: 'text', label: "SCORE J1", value: this.scores[this.p1].toString() },
                { type: 'text', label: "SCORE J2", value: this.scores[this.p2].toString() }
            ],
            buttons: [
                {
                    label: btnLabel,
                    actionId: "SHOOT",
                    color: color,
                    disabled: false,
                    size: 'giant' // <--- C'EST ÇA QUI FAIT LE GROS BOUTON
                }
            ]
        };
        this.io.to(this.roomId).emit('renderUI', ui);
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
