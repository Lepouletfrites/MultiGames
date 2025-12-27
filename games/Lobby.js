"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lobby = void 0;
var Lobby = /** @class */ (function () {
    function Lobby(io) {
        // Liste des ID des joueurs qui sont dans le menu principal
        this.lobbyPlayers = new Set();
        // Liste des salles ouvertes
        this.openRooms = new Map();
        this.io = io;
    }
    // Quand un joueur arrive ou revient au menu
    Lobby.prototype.addPlayer = function (socket) {
        this.lobbyPlayers.add(socket.id);
        this.updateMenuFor(socket.id);
    };
    // Quand un joueur part (déconnexion ou lance une partie)
    Lobby.prototype.removePlayer = function (socketId) {
        this.lobbyPlayers.delete(socketId);
        // S'il avait créé une salle, on la détruit
        if (this.openRooms.has(socketId)) {
            this.openRooms.delete(socketId);
            // On prévient tout le monde que la salle a disparu
            this.broadcastMenu();
        }
    };
    // Action : Créer une salle
    Lobby.prototype.createRoom = function (socketId) {
        // 1. On récupère le socket pour avoir le pseudo
        var socket = this.io.sockets.sockets.get(socketId);
        var pseudo = (socket === null || socket === void 0 ? void 0 : socket.data.username) || "INCONNU";
        // 2. On crée le nom de la salle
        var roomName = "SALON DE ".concat(pseudo.toUpperCase());
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
    };
    // Récupérer une salle par son ID
    Lobby.prototype.getRoom = function (roomId) {
        return this.openRooms.get(roomId);
    };
    // Mettre à jour l'écran de TOUS les joueurs du lobby
    Lobby.prototype.broadcastMenu = function () {
        var _this = this;
        this.lobbyPlayers.forEach(function (playerId) {
            // On ne met à jour que ceux qui ne sont pas déjà en train d'attendre dans leur propre salle
            if (!_this.openRooms.has(playerId)) {
                _this.updateMenuFor(playerId);
            }
        });
    };
    // Génère l'interface du Menu Principal pour un joueur précis
    Lobby.prototype.updateMenuFor = function (playerId) {
        var socket = this.io.sockets.sockets.get(playerId);
        var myName = (socket === null || socket === void 0 ? void 0 : socket.data.username) || "JOUEUR";
        var buttons = [];
        buttons.push({
            label: "➕ CRÉER MA SALLE",
            actionId: "LOBBY_CREATE",
            color: "green",
            disabled: false
        });
        this.openRooms.forEach(function (room) {
            buttons.push({
                label: "REJOINDRE : ".concat(room.hostName),
                actionId: "LOBBY_JOIN_".concat(room.id),
                color: "blue",
                disabled: false
            });
        });
        var ui = {
            title: "BIENVENUE ".concat(myName.toUpperCase()),
            status: "".concat(this.lobbyPlayers.size, " joueur(s) en ligne"),
            displays: [],
            buttons: buttons
        };
        // --- MODIFICATION ICI ---
        if (socket) {
            socket.emit('renderUI', ui); // Envoi direct au socket (plus fiable que io.to)
        }
        else {
            this.io.to(playerId).emit('renderUI', ui);
        }
    };
    // Génère l'interface "En attente" pour le créateur
    Lobby.prototype.sendWaitingScreen = function (playerId, roomName) {
        var ui = {
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
    };
    return Lobby;
}());
exports.Lobby = Lobby;
