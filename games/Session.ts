import { Server } from 'socket.io';
import { GameInstance, UIState, OnGameEndCallback } from './GameInterface';

import { DuelGame } from './Duel';
import { CowboyGame } from './Cowboy';
import { BombeGame } from './Bombe';
import { ChronoGame } from './Chrono';

const AVAILABLE_GAMES = [
    { id: 'DUEL', label: '⚔️ DUEL', color: 'blue' },
    { id: 'COWBOY', label: '🤠 COWBOY', color: 'orange' },
    { id: 'BOMBE', label: '💣 BOMBE', color: 'red' },
    { id: 'CHRONO', label: '⏱️ CHRONO', color: 'purple' }
];

export class Session implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;
    private onSessionEnd: OnGameEndCallback | null = null; // Callback pour le serveur

    private scores = { p1: 0, p2: 0 };
    private votes: { p1: string | null, p2: string | null } = { p1: null, p2: null };
    private currentGame: GameInstance | null = null;

    constructor(io: Server, roomId: string, p1: string, p2: string) {
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1;
        this.p2 = p2;
    }

    // Le serveur passe une fonction ici pour savoir quand la session ferme
    start(onEnd: OnGameEndCallback) {
        this.onSessionEnd = onEnd;
        this.sendHubUI();
    }

    handleAction(playerId: string, actionId: string) {
        if (this.currentGame) {
            this.currentGame.handleAction(playerId, actionId);
            return;
        }

        // --- NOUVEAU : QUITTER LA SESSION ---
        if (actionId === 'SESSION_EXIT') {
            console.log(`[SESSION] ${playerId} souhaite quitter.`);
            if (this.onSessionEnd) {
                this.onSessionEnd(null); // On prévient le serveur (null = pas de vainqueur global)
                this.onSessionEnd = null;
            }
            return;
        }

        if (actionId.startsWith('VOTE_')) {
            const vote = actionId.replace('VOTE_', '');
            if (playerId === this.p1) this.votes.p1 = vote;
            else if (playerId === this.p2) this.votes.p2 = vote;

            this.sendHubUI();

            if (this.votes.p1 !== null && this.votes.p2 !== null) {
                setTimeout(() => this.resolveVotesAndLaunch(), 500);
            }
        }
    }

    private resolveVotesAndLaunch() {
        try {
            let choice1 = this.votes.p1!;
            let choice2 = this.votes.p2!;
            if (choice1 === 'RANDOM') choice1 = this.pickRandomGameId();
            if (choice2 === 'RANDOM') choice2 = this.pickRandomGameId();
            const finalChoice = (Math.random() > 0.5) ? choice1 : choice2;
            
            this.votes.p1 = null;
            this.votes.p2 = null;

            if (finalChoice === 'DUEL') this.currentGame = new DuelGame(this.io, this.roomId, this.p1, this.p2);
            else if (finalChoice === 'COWBOY') this.currentGame = new CowboyGame(this.io, this.roomId, this.p1, this.p2);
            else if (finalChoice === 'BOMBE') this.currentGame = new BombeGame(this.io, this.roomId, this.p1, this.p2);
            else if (finalChoice === 'CHRONO') this.currentGame = new ChronoGame(this.io, this.roomId, this.p1, this.p2);

            if (this.currentGame) {
                this.currentGame.start((winnerId) => this.handleGameEnd(winnerId));
            }
        } catch (e) { console.error(e); }
    }

    private pickRandomGameId() {
        const randomIndex = Math.floor(Math.random() * AVAILABLE_GAMES.length);
        return AVAILABLE_GAMES[randomIndex].id;
    }

    private handleGameEnd(winnerId: string | null) {
        this.currentGame = null;
        if (winnerId === this.p1) this.scores.p1++;
        else if (winnerId === this.p2) this.scores.p2++;

        this.io.to(this.roomId).emit('modal', {
            title: "FIN DU MATCH",
            message: "Retour au menu de vote",
            btnText: "OK"
        });
        this.sendHubUI();
    }

    private sendHubUI() {
        this.sendToPlayer(this.p1, this.scores.p1, this.scores.p2);
        this.sendToPlayer(this.p2, this.scores.p2, this.scores.p1);
    }

    private sendToPlayer(targetId: string, myScore: number, opScore: number) {
        const myVote = (targetId === this.p1) ? this.votes.p1 : this.votes.p2;
        const opVote = (targetId === this.p1) ? this.votes.p2 : this.votes.p1;

        let statusMsg = "Votez pour le prochain jeu !";
        if (myVote && opVote) statusMsg = "Lancement...";
        else if (myVote && !opVote) statusMsg = "Attente de l'adversaire...";
        else if (!myVote && opVote) statusMsg = "L'adversaire a voté ! À toi !";

        const buttons = AVAILABLE_GAMES.map(game => ({
            label: game.label,
            actionId: `VOTE_${game.id}`,
            color: (myVote === game.id) ? 'green' : game.color,
            disabled: (myVote !== null)
        }));

        buttons.push({
            label: "🎲 ALÉATOIRE",
            actionId: "VOTE_RANDOM",
            color: (myVote === 'RANDOM') ? 'green' : 'grey',
            disabled: (myVote !== null)
        });

        // --- AJOUT DU BOUTON QUITTER ---
        buttons.push({
            label: "🚪 QUITTER LA SESSION",
            actionId: "SESSION_EXIT",
            color: "red",
            disabled: false
        });

        const ui: UIState = {
            title: "VOTE",
            status: statusMsg,
            displays: [
                { type: 'text', label: "MOI", value: myScore.toString() },
                { type: 'text', label: "RIVAL", value: opScore.toString() }
            ],
            buttons: buttons
        };
        this.io.to(targetId).emit('renderUI', ui);
    }

    handleDisconnect(playerId: string) {
        if (this.currentGame) this.currentGame.handleDisconnect(playerId);
        // Note: On laisse le serveur gérer la fermeture de session ici
    }
}
