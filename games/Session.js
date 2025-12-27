"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
var Duel_1 = require("./Duel");
var Cowboy_1 = require("./Cowboy");
var Bombe_1 = require("./Bombe");
// Liste des jeux disponibles pour créer les boutons
var AVAILABLE_GAMES = [
    { id: 'DUEL', label: '⚔️ DUEL TACTIQUE', color: 'red' },
    { id: 'COWBOY', label: '🤠 COWBOY', color: 'orange' },
    { id: 'BOMBE', label: '💣 LA BOMBE', color: 'red' }
];
var Session = /** @class */ (function () {
    function Session(io, roomId, p1, p2) {
        // État de la session
        this.scores = { p1: 0, p2: 0 };
        // Stockage des votes : 'DUEL', 'COWBOY', ou 'RANDOM'
        this.votes = { p1: null, p2: null };
        this.currentGame = null;
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1;
        this.p2 = p2;
    }
    Session.prototype.start = function () {
        this.sendHubUI("Votez pour le prochain jeu !");
    };
    Session.prototype.handleAction = function (playerId, actionId) {
        // Si un jeu est en cours, on lui passe l'action
        if (this.currentGame) {
            this.currentGame.handleAction(playerId, actionId);
            return;
        }
        // --- GESTION DES VOTES DANS LE HUB ---
        // Les actionId ressemblent à "VOTE_DUEL", "VOTE_COWBOY", "VOTE_RANDOM"
        if (actionId.startsWith('VOTE_')) {
            // On récupère ce qu'il y a après "VOTE_" (ex: "DUEL")
            var vote = actionId.replace('VOTE_', '');
            if (playerId === this.p1)
                this.votes.p1 = vote;
            if (playerId === this.p2)
                this.votes.p2 = vote;
            // Feedback : "En attente..."
            this.sendHubUI("Vote enregistré. Attente de l'adversaire...");
            // Si tout le monde a voté -> LANCEMENT
            if (this.votes.p1 && this.votes.p2) {
                this.resolveVotesAndLaunch();
            }
        }
    };
    Session.prototype.resolveVotesAndLaunch = function () {
        var _this = this;
        // 1. Résoudre les votes "RANDOM"
        // Si un joueur a mis Random, on choisit un jeu au hasard pour lui MAINTENANT
        var choice1 = this.votes.p1;
        var choice2 = this.votes.p2;
        if (choice1 === 'RANDOM')
            choice1 = this.pickRandomGameId();
        if (choice2 === 'RANDOM')
            choice2 = this.pickRandomGameId();
        // 2. Tirage au sort final entre les deux choix
        // (Si J1 veut Duel et J2 veut Cowboy, on a 50/50)
        var finalChoice = (Math.random() > 0.5) ? choice1 : choice2;
        console.log("Votes: J1=".concat(this.votes.p1, "(").concat(choice1, ") vs J2=").concat(this.votes.p2, "(").concat(choice2, ") -> Gagnant: ").concat(finalChoice));
        // 3. Reset des votes pour le prochain tour
        this.votes.p1 = null;
        this.votes.p2 = null;
        // 4. Lancement du jeu gagnant
        if (finalChoice === 'DUEL') {
            this.currentGame = new Duel_1.DuelGame(this.io, this.roomId, this.p1, this.p2);
        }
        else if (finalChoice === 'COWBOY') {
            this.currentGame = new Cowboy_1.CowboyGame(this.io, this.roomId, this.p1, this.p2);
        }
        else if (finalChoice === 'BOMBE') {
            this.currentGame = new Bombe_1.BombeGame(this.io, this.roomId, this.p1, this.p2);
        }
        // Démarrage
        if (this.currentGame) {
            this.currentGame.start(function (winnerId) {
                _this.handleGameEnd(winnerId);
            });
        }
    };
    // Helper pour choisir un jeu au pif
    Session.prototype.pickRandomGameId = function () {
        var randomIndex = Math.floor(Math.random() * AVAILABLE_GAMES.length);
        return AVAILABLE_GAMES[randomIndex].id;
    };
    Session.prototype.handleGameEnd = function (winnerId) {
        this.currentGame = null;
        if (winnerId === this.p1)
            this.scores.p1++;
        else if (winnerId === this.p2)
            this.scores.p2++;
        var msg = "Match nul !";
        if (winnerId)
            msg = (winnerId === this.p1) ? "Joueur 1 a gagné !" : "Joueur 2 a gagné !";
        this.sendHubUI(msg);
    };
    // --- CONSTRUCTION DE L'INTERFACE DE VOTE ---
    Session.prototype.sendHubUI = function (statusMsg) {
        // P1
        this.sendToPlayer(this.p1, statusMsg, this.votes.p1, this.scores.p1, this.scores.p2);
        // P2
        this.sendToPlayer(this.p2, statusMsg, this.votes.p2, this.scores.p2, this.scores.p1);
    };
    Session.prototype.sendToPlayer = function (targetId, msg, myVote, myScore, opScore) {
        // Création dynamique des boutons de vote
        var buttons = [];
        // 1. Boutons pour chaque jeu disponible
        AVAILABLE_GAMES.forEach(function (game) {
            buttons.push({
                label: game.label,
                actionId: "VOTE_".concat(game.id),
                color: (myVote === game.id) ? 'green' : game.color,
                disabled: (myVote !== null) // Désactivé si on a déjà voté quoi que ce soit
            });
        });
        // 2. Bouton Random
        buttons.push({
            label: "🎲 ALÉATOIRE",
            actionId: "VOTE_RANDOM",
            color: (myVote === 'RANDOM') ? 'green' : 'purple',
            disabled: (myVote !== null)
        });
        var ui = {
            title: "🗳️ VOTEZ !",
            status: msg,
            displays: [
                { type: 'text', label: "MON SCORE", value: myScore.toString() },
                { type: 'text', label: "ADVERSAIRE", value: opScore.toString() }
            ],
            buttons: buttons
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
