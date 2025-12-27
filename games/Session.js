"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
var Duel_1 = require("./Duel");
var Cowboy_1 = require("./Cowboy");
var Bombe_1 = require("./Bombe");
var Chrono_1 = require("./Chrono");
var Mine_1 = require("./Mine");
var AVAILABLE_GAMES = [
    { id: 'DUEL', label: '⚔️ DUEL', color: 'blue' },
    { id: 'COWBOY', label: '🤠 COWBOY', color: 'orange' },
    { id: 'BOMBE', label: '💣 BOMBE', color: 'red' },
    { id: 'CHRONO', label: '⏱️ CHRONO', color: 'purple' },
    { id: 'MINE', label: '💎 MINE', color: 'green' }
];
var Session = /** @class */ (function () {
    function Session(io, roomId, p1, p2) {
        this.onSessionEnd = null;
        this.scores = { p1: 0, p2: 0 };
        this.votes = { p1: null, p2: null };
        this.currentGame = null;
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1;
        this.p2 = p2;
    }
    Session.prototype.start = function (onEnd) {
        this.onSessionEnd = onEnd;
        this.sendHubUI();
    };
    // --- LE CORRECTIF EST ICI ---
    Session.prototype.updatePlayerSocket = function (oldId, newId) {
        // On met à jour l'ID dans la Session
        if (this.p1 === oldId)
            this.p1 = newId;
        if (this.p2 === oldId)
            this.p2 = newId;
        // Et on le dit aussi au jeu en cours !
        if (this.currentGame) {
            this.currentGame.updatePlayerSocket(oldId, newId);
        }
    };
    Session.prototype.refresh = function (playerId) {
        if (this.currentGame) {
            this.currentGame.refresh(playerId);
        }
        else {
            // Le playerId est maintenant à jour, donc cette condition va marcher !
            if (playerId === this.p1)
                this.sendToPlayer(this.p1, this.scores.p1, this.scores.p2);
            else if (playerId === this.p2)
                this.sendToPlayer(this.p2, this.scores.p2, this.scores.p1);
        }
    };
    Session.prototype.handleAction = function (playerId, actionId) {
        var _this = this;
        if (this.currentGame) {
            this.currentGame.handleAction(playerId, actionId);
            return;
        }
        if (actionId === 'SESSION_EXIT') {
            if (this.onSessionEnd) {
                this.onSessionEnd(null);
                this.onSessionEnd = null;
            }
            return;
        }
        if (actionId.startsWith('VOTE_')) {
            var vote = actionId.replace('VOTE_', '');
            if (playerId === this.p1)
                this.votes.p1 = vote;
            else if (playerId === this.p2)
                this.votes.p2 = vote;
            this.sendHubUI();
            if (this.votes.p1 !== null && this.votes.p2 !== null) {
                setTimeout(function () { return _this.resolveVotesAndLaunch(); }, 500);
            }
        }
    };
    Session.prototype.resolveVotesAndLaunch = function () {
        var _this = this;
        try {
            var choice1 = this.votes.p1;
            var choice2 = this.votes.p2;
            if (choice1 === 'RANDOM')
                choice1 = this.pickRandomGameId();
            if (choice2 === 'RANDOM')
                choice2 = this.pickRandomGameId();
            var finalChoice = (Math.random() > 0.5) ? choice1 : choice2;
            this.votes.p1 = null;
            this.votes.p2 = null;
            if (finalChoice === 'DUEL')
                this.currentGame = new Duel_1.DuelGame(this.io, this.roomId, this.p1, this.p2);
            else if (finalChoice === 'COWBOY')
                this.currentGame = new Cowboy_1.CowboyGame(this.io, this.roomId, this.p1, this.p2);
            else if (finalChoice === 'BOMBE')
                this.currentGame = new Bombe_1.BombeGame(this.io, this.roomId, this.p1, this.p2);
            else if (finalChoice === 'CHRONO')
                this.currentGame = new Chrono_1.ChronoGame(this.io, this.roomId, this.p1, this.p2);
            else if (finalChoice === 'MINE')
                this.currentGame = new Mine_1.MineGame(this.io, this.roomId, this.p1, this.p2);
            if (this.currentGame)
                this.currentGame.start(function (winnerId) { return _this.handleGameEnd(winnerId); });
        }
        catch (e) {
            console.error(e);
        }
    };
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
        this.io.to(this.roomId).emit('modal', { title: "FIN DU MATCH", message: "Retour au vote", btnText: "OK" });
        this.sendHubUI();
    };
    Session.prototype.sendHubUI = function () {
        this.sendToPlayer(this.p1, this.scores.p1, this.scores.p2);
        this.sendToPlayer(this.p2, this.scores.p2, this.scores.p1);
    };
    Session.prototype.sendToPlayer = function (targetId, myScore, opScore) {
        var myVote = (targetId === this.p1) ? this.votes.p1 : this.votes.p2;
        var opVote = (targetId === this.p1) ? this.votes.p2 : this.votes.p1;
        var statusMsg = "Votez pour le prochain jeu !";
        if (myVote && opVote)
            statusMsg = "Lancement...";
        else if (myVote && !opVote)
            statusMsg = "Attente adversaire...";
        else if (!myVote && opVote)
            statusMsg = "L'adversaire a voté !";
        var buttons = AVAILABLE_GAMES.map(function (game) { return ({
            label: game.label, actionId: "VOTE_".concat(game.id), color: (myVote === game.id) ? 'green' : game.color, disabled: (myVote !== null)
        }); });
        buttons.push({ label: "🎲 ALÉATOIRE", actionId: "VOTE_RANDOM", color: (myVote === 'RANDOM') ? 'green' : 'grey', disabled: (myVote !== null) });
        buttons.push({ label: "🚪 QUITTER", actionId: "SESSION_EXIT", color: "red", disabled: false });
        this.io.to(targetId).emit('renderUI', {
            title: "VOTE", status: statusMsg, displays: [{ type: 'text', label: "MOI", value: myScore.toString() }, { type: 'text', label: "RIVAL", value: opScore.toString() }], buttons: buttons
        });
    };
    Session.prototype.handleDisconnect = function (playerId) { if (this.currentGame)
        this.currentGame.handleDisconnect(playerId); };
    return Session;
}());
exports.Session = Session;
