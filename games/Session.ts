import { Server } from 'socket.io';
import { GameInstance, UIState } from './GameInterface';
import { DuelGame } from './Duel';
import { CowboyGame } from './Cowboy';
import { BombeGame } from './Bombe';

// Liste des jeux disponibles pour créer les boutons
const AVAILABLE_GAMES = [
    { id: 'DUEL', label: '⚔️ DUEL TACTIQUE', color: 'red' },
    { id: 'COWBOY', label: '🤠 COWBOY', color: 'orange' },
    { id: 'BOMBE', label: '💣 LA BOMBE', color: 'red' }
];

export class Session implements GameInstance {
    private io: Server;
    private roomId: string;
    private p1: string;
    private p2: string;

    // État de la session
    private scores = { p1: 0, p2: 0 };
    
    // Stockage des votes : 'DUEL', 'COWBOY', ou 'RANDOM'
    private votes: { p1: string | null, p2: string | null } = { p1: null, p2: null };
    
    private currentGame: GameInstance | null = null;

    constructor(io: Server, roomId: string, p1: string, p2: string) {
        this.io = io;
        this.roomId = roomId;
        this.p1 = p1;
        this.p2 = p2;
    }

    start() {
        this.sendHubUI("Votez pour le prochain jeu !");
    }

    handleAction(playerId: string, actionId: string) {
        // Si un jeu est en cours, on lui passe l'action
        if (this.currentGame) {
            this.currentGame.handleAction(playerId, actionId);
            return;
        }

        // --- GESTION DES VOTES DANS LE HUB ---
        // Les actionId ressemblent à "VOTE_DUEL", "VOTE_COWBOY", "VOTE_RANDOM"
        
        if (actionId.startsWith('VOTE_')) {
            // On récupère ce qu'il y a après "VOTE_" (ex: "DUEL")
            const vote = actionId.replace('VOTE_', '');

            if (playerId === this.p1) this.votes.p1 = vote;
            if (playerId === this.p2) this.votes.p2 = vote;

            // Feedback : "En attente..."
            this.sendHubUI("Vote enregistré. Attente de l'adversaire...");

            // Si tout le monde a voté -> LANCEMENT
            if (this.votes.p1 && this.votes.p2) {
                this.resolveVotesAndLaunch();
            }
        }
    }

    private resolveVotesAndLaunch() {
        // 1. Résoudre les votes "RANDOM"
        // Si un joueur a mis Random, on choisit un jeu au hasard pour lui MAINTENANT
        let choice1 = this.votes.p1!;
        let choice2 = this.votes.p2!;

        if (choice1 === 'RANDOM') choice1 = this.pickRandomGameId();
        if (choice2 === 'RANDOM') choice2 = this.pickRandomGameId();

        // 2. Tirage au sort final entre les deux choix
        // (Si J1 veut Duel et J2 veut Cowboy, on a 50/50)
        const finalChoice = (Math.random() > 0.5) ? choice1 : choice2;

        console.log(`Votes: J1=${this.votes.p1}(${choice1}) vs J2=${this.votes.p2}(${choice2}) -> Gagnant: ${finalChoice}`);

        // 3. Reset des votes pour le prochain tour
        this.votes.p1 = null;
        this.votes.p2 = null;

        // 4. Lancement du jeu gagnant
        if (finalChoice === 'DUEL') {
            this.currentGame = new DuelGame(this.io, this.roomId, this.p1, this.p2);
        } else if (finalChoice === 'COWBOY') {
            this.currentGame = new CowboyGame(this.io, this.roomId, this.p1, this.p2);
        } else if (finalChoice === 'BOMBE') {
            this.currentGame = new BombeGame(this.io, this.roomId, this.p1, this.p2);
        }

        // Démarrage
        if (this.currentGame) {
            this.currentGame.start((winnerId) => {
                this.handleGameEnd(winnerId);
            });
        }
    }

    // Helper pour choisir un jeu au pif
    private pickRandomGameId() {
        const randomIndex = Math.floor(Math.random() * AVAILABLE_GAMES.length);
        return AVAILABLE_GAMES[randomIndex].id;
    }

    private handleGameEnd(winnerId: string | null) {
        this.currentGame = null;

        if (winnerId === this.p1) this.scores.p1++;
        else if (winnerId === this.p2) this.scores.p2++;

        let msg = "Match nul !";
        if (winnerId) msg = (winnerId === this.p1) ? "Joueur 1 a gagné !" : "Joueur 2 a gagné !";
        
        this.sendHubUI(msg);
    }

    // --- CONSTRUCTION DE L'INTERFACE DE VOTE ---
    private sendHubUI(statusMsg: string) {
        // P1
        this.sendToPlayer(this.p1, statusMsg, this.votes.p1, this.scores.p1, this.scores.p2);
        // P2
        this.sendToPlayer(this.p2, statusMsg, this.votes.p2, this.scores.p2, this.scores.p1);
    }

    private sendToPlayer(targetId: string, msg: string, myVote: string | null, myScore: number, opScore: number) {
        // Création dynamique des boutons de vote
        const buttons = [];

        // 1. Boutons pour chaque jeu disponible
        AVAILABLE_GAMES.forEach(game => {
            buttons.push({
                label: game.label,
                actionId: `VOTE_${game.id}`,
                color: (myVote === game.id) ? 'green' : game.color, // Vert si sélectionné
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

        const ui: UIState = {
            title: "🗳️ VOTEZ !",
            status: msg,
            displays: [
                { type: 'text', label: "MON SCORE", value: myScore.toString() },
                { type: 'text', label: "ADVERSAIRE", value: opScore.toString() }
            ],
            buttons: buttons
        };

        this.io.to(targetId).emit('renderUI', ui);
    }

    handleDisconnect(playerId: string) {
        if (this.currentGame) this.currentGame.handleDisconnect(playerId);
    }
}
