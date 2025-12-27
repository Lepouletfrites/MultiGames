"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
var Duel_1 = require("./Duel"); // On importe le jeu Duel
var Session = /** @class */ (function () {
    function Session(io, roomId, p1, p2) {
        // État de la session
        this.scores = { p1: 0, p2: 0 };
        this.isReady = { p1: false, p2: false };
        this.currentGame = null; // Le mini-jeu en cours
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1;
        this.p2 = p2;
    }
    // Démarrage de la Session (On affiche le Hub)
    Session.prototype.start = function () {
        this.sendHubUI("Bienvenue dans l'Arène !");
    };
    // Gestion des actions (Hub ou Jeu ?)
    Session.prototype.handleAction = function (playerId, actionId) {
        // Si un jeu est en cours, on lui passe la main
        if (this.currentGame) {
            this.currentGame.handleAction(playerId, actionId);
            return;
        }
        // Sinon, on est dans le HUB. On gère le bouton "PRÊT"
        if (actionId === 'READY') {
            if (playerId === this.p1)
                this.isReady.p1 = true;
            if (playerId === this.p2)
                this.isReady.p2 = true;
            // Feedback visuel
            this.sendHubUI("En attente de l'autre joueur...");
            // Si les deux sont prêts -> ON LANCE LE JEU
            if (this.isReady.p1 && this.isReady.p2) {
                this.launchRandomGame();
            }
        }
    };
    // Logique pour lancer un mini-jeu
    Session.prototype.launchRandomGame = function () {
        var _this = this;
        // Reset des états "Prêt" pour la prochaine fois
        this.isReady.p1 = false;
        this.isReady.p2 = false;
        // --- SÉLECTION DU JEU (Pour l'instant que Duel) ---
        // C'est ici que tu feras ton Math.random() plus tard
        this.currentGame = new Duel_1.DuelGame(this.io, this.roomId, this.p1, this.p2);
        console.log("Lancement du jeu dans la room ".concat(this.roomId));
        // On démarre le jeu en lui donnant la fonction à appeler quand il finit
        this.currentGame.start(function (winnerId) {
            _this.handleGameEnd(winnerId);
        });
    };
    // Quand le mini-jeu est fini
    Session.prototype.handleGameEnd = function (winnerId) {
        this.currentGame = null; // Plus de jeu en cours
        // Mise à jour des scores
        if (winnerId === this.p1)
            this.scores.p1++;
        else if (winnerId === this.p2)
            this.scores.p2++;
        // On retourne au Hub
        var msg = "Match nul !";
        if (winnerId)
            msg = (winnerId === this.p1) ? "Joueur 1 a gagné !" : "Joueur 2 a gagné !";
        this.sendHubUI(msg);
    };
    // Affichage du HUB
    Session.prototype.sendHubUI = function (statusMsg) {
        // Pour P1
        this.sendToPlayer(this.p1, statusMsg, this.isReady.p1, this.scores.p1, this.scores.p2);
        // Pour P2
        this.sendToPlayer(this.p2, statusMsg, this.isReady.p2, this.scores.p2, this.scores.p1);
    };
    Session.prototype.sendToPlayer = function (targetId, msg, amIReady, myScore, opScore) {
        var ui = {
            title: "🏠 HUB CENTRAL",
            status: msg,
            displays: [
                { type: 'text', label: "MON SCORE", value: myScore.toString() },
                { type: 'text', label: "ADVERSAIRE", value: opScore.toString() }
            ],
            buttons: [
                {
                    label: amIReady ? "EN ATTENTE..." : "JE SUIS PRÊT ! ✅",
                    actionId: "READY",
                    color: amIReady ? "grey" : "green",
                    disabled: amIReady
                }
            ]
        };
        this.io.to(targetId).emit('renderUI', ui);
    };
    Session.prototype.handleDisconnect = function (playerId) {
        if (this.currentGame)
            this.currentGame.handleDisconnect(playerId);
    };
    return Session;
}());
exports.Session = Session;
