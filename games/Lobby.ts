import { Server, Socket } from 'socket.io';
import { UIState } from './GameInterface';

// Structure d'une salle en attente
interface OpenRoom {
    id: string;       // ID unique de la salle (souvent l'ID du socket hôte)
    hostId: string;   // ID du socket du créateur
    hostName: string; // Nom affiché (ex: "SALON DE TOTO")
}

export class Lobby {
    private io: Server;
    // Liste des ID des joueurs qui sont dans le menu principal
    private lobbyPlayers: Set<string> = new Set();
    // Liste des salles ouvertes
    private openRooms: Map<string, OpenRoom> = new Map();

    constructor(io: Server) {
        this.io = io;
    }

    // Quand un joueur arrive ou revient au menu
    addPlayer(socket: Socket) {
        this.lobbyPlayers.add(socket.id);
        this.updateMenuFor(socket.id);
    }

    // Quand un joueur part (déconnexion ou lance une partie)
    removePlayer(socketId: string) {
        this.lobbyPlayers.delete(socketId);

        // S'il avait créé une salle, on la détruit
        if (this.openRooms.has(socketId)) {
            this.openRooms.delete(socketId);
            // On prévient tout le monde que la salle a disparu
            this.broadcastMenu();
        }
    }

    // Action : Créer une salle
    createRoom(socketId: string) {
        // 1. On récupère le socket pour avoir le pseudo
        const socket = this.io.sockets.sockets.get(socketId);
        const pseudo = socket?.data.username || "INCONNU";

        // 2. On crée le nom de la salle
        const roomName = `SALON DE ${pseudo.toUpperCase()}`;

        // 3. On enregistre la salle
        this.openRooms.set(socketId, {
            id: socketId,
            hostId: socketId,
            hostName: roomName
        });

        // 4. On met à jour l'écran du créateur (Mode Attente)
        this.sendWaitingScreen(socketId, roomName);

        // 5. On met à jour le menu des autres (pour voir le nouveau bouton)
        this.broadcastMenu();
    }

    // Récupérer une salle par son ID
    getRoom(roomId: string): OpenRoom | undefined {
        return this.openRooms.get(roomId);
    }

    // Mettre à jour l'écran de TOUS les joueurs du lobby
    broadcastMenu() {
        this.lobbyPlayers.forEach(playerId => {
            // On ne met à jour que ceux qui ne sont pas déjà en train d'attendre dans leur propre salle
            if (!this.openRooms.has(playerId)) {
                this.updateMenuFor(playerId);
            }
        });
    }

    // Génère l'interface du Menu Principal pour un joueur précis
        private updateMenuFor(playerId: string) {
        const socket = this.io.sockets.sockets.get(playerId);
        const myName = socket?.data.username || "JOUEUR";

        const buttons = [];
        buttons.push({
            label: "➕ CRÉER MA SALLE",
            actionId: "LOBBY_CREATE",
            color: "green",
            disabled: false
        });

        this.openRooms.forEach(room => {
            buttons.push({
                label: `REJOINDRE : ${room.hostName}`,
                actionId: `LOBBY_JOIN_${room.id}`,
                color: "blue",
                disabled: false
            });
        });

        const ui: UIState = {
            title: `BIENVENUE ${myName.toUpperCase()}`,
            status: `${this.lobbyPlayers.size} joueur(s) en ligne`,
            displays: [], 
            buttons: buttons
        };

        // --- MODIFICATION ICI ---
        if (socket) {
            socket.emit('renderUI', ui); // Envoi direct au socket (plus fiable que io.to)
        } else {
            this.io.to(playerId).emit('renderUI', ui);
        }
    }


    // Génère l'interface "En attente" pour le créateur
    private sendWaitingScreen(playerId: string, roomName: string) {
        const ui: UIState = {
            title: "SALLE OUVERTE",
            status: "En attente d'un adversaire...",
            displays: [
                { type: 'text', label: "VOTRE SALON", value: roomName.replace("SALON DE ", "") }
            ],
            buttons: [
                {
                    label: "ANNULER ❌",
                    actionId: "LOBBY_CANCEL",
                    color: "red",
                    disabled: false
                }
            ]
        };
        this.io.to(playerId).emit('renderUI', ui);
    }
}
