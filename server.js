"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var path_1 = require("path");
var os_1 = require("os");
var Session_1 = require("./games/Session");
var Lobby_1 = require("./games/Lobby");
var app = (0, express_1.default)();
var server = http_1.default.createServer(app);
var io = new socket_io_1.Server(server);
var PORT = process.env.PORT || 3000;
app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
// --- UTILITAIRES ---
function getLocalIp() {
    var interfaces = os_1.default.networkInterfaces();
    for (var _i = 0, _a = Object.keys(interfaces); _i < _a.length; _i++) {
        var name = _a[_i];
        for (var _b = 0, _c = interfaces[name]; _b < _c.length; _b++) {
            var iface = _c[_b];
            if (iface.family === 'IPv4' && !iface.internal)
                return iface.address;
        }
    }
    return 'localhost';
}
var runningGames = new Map();
var lobby = new Lobby_1.Lobby(io);
var playersRegistry = new Map();
io.on('connection', function (socket) {
    var pseudo = socket.handshake.auth.name || "Anonyme";
    var userId = socket.handshake.auth.userId;
    if (!userId)
        return socket.disconnect();
    socket.data.username = pseudo;
    socket.data.userId = userId;
    if (playersRegistry.has(userId)) {
        var savedData = playersRegistry.get(userId);
        var oldSocketId = savedData.socketId;
        if (savedData.disconnectTimer)
            clearTimeout(savedData.disconnectTimer);
        socket.data.currentRoomId = savedData.currentRoomId;
        if (socket.data.currentRoomId) {
            socket.join(socket.data.currentRoomId);
            var game_1 = runningGames.get(socket.data.currentRoomId);
            if (game_1) {
                game_1.updatePlayerSocket(oldSocketId, socket.id);
                // On force un refresh immédiat ET un refresh après un court délai
                game_1.refresh(socket.id);
                setTimeout(function () { game_1.refresh(socket.id); }, 500);
            }
            else {
                // Si le jeu n'existe plus (cas d'erreur), retour lobby
                socket.data.currentRoomId = null;
                lobby.addPlayer(socket);
            }
        }
        else {
            lobby.addPlayer(socket);
        }
    }
    else {
        socket.data.currentRoomId = null;
        lobby.addPlayer(socket);
    }
    // Toujours mettre à jour le registre avec le nouveau socket.id
    playersRegistry.set(userId, {
        socketId: socket.id,
        username: pseudo,
        currentRoomId: socket.data.currentRoomId,
        disconnectTimer: null
    });
    socket.emit('serverInfo', { ip: getLocalIp(), port: PORT });
    // ... reste du code (gameAction, etc.)
    socket.emit('serverInfo', { ip: getLocalIp(), port: PORT });
    if (!socket.data.currentRoomId) {
        lobby.addPlayer(socket);
    }
    // --- GESTION DES ACTIONS ---
    socket.on('gameAction', function (actionId) {
        if (actionId.startsWith('LOBBY_')) {
            handleLobbyAction(socket, actionId);
            return;
        }
        var roomId = socket.data.currentRoomId;
        if (roomId) {
            var game = runningGames.get(roomId);
            if (game)
                game.handleAction(socket.id, actionId);
        }
    });
    function handleLobbyAction(socket, actionId) {
        var uId = socket.data.userId;
        if (actionId === 'LOBBY_CREATE') {
            lobby.createRoom(socket.id);
            socket.join(socket.id);
            socket.data.currentRoomId = socket.id;
            if (playersRegistry.has(uId))
                playersRegistry.get(uId).currentRoomId = socket.id;
        }
        else if (actionId === 'LOBBY_CANCEL') {
            lobby.removePlayer(socket.id);
            socket.data.currentRoomId = null;
            if (playersRegistry.has(uId))
                playersRegistry.get(uId).currentRoomId = null;
            lobby.addPlayer(socket);
        }
        else if (actionId.startsWith('LOBBY_JOIN_')) {
            var targetRoomId_1 = actionId.replace('LOBBY_JOIN_', '');
            var room = lobby.getRoom(targetRoomId_1);
            if (room) {
                var p1Id = room.hostId;
                var p2Id = socket.id;
                lobby.removePlayer(p1Id);
                lobby.removePlayer(p2Id);
                var s1_1 = io.sockets.sockets.get(p1Id);
                var s2_1 = socket;
                if (s1_1 && s2_1) {
                    s1_1.join(targetRoomId_1);
                    s1_1.data.currentRoomId = targetRoomId_1;
                    s2_1.join(targetRoomId_1);
                    s2_1.data.currentRoomId = targetRoomId_1;
                    if (playersRegistry.has(s1_1.data.userId))
                        playersRegistry.get(s1_1.data.userId).currentRoomId = targetRoomId_1;
                    if (playersRegistry.has(s2_1.data.userId))
                        playersRegistry.get(s2_1.data.userId).currentRoomId = targetRoomId_1;
                    var session = new Session_1.Session(io, targetRoomId_1, p1Id, p2Id);
                    runningGames.set(targetRoomId_1, session);
                    session.start(function (winner) {
                        runningGames.delete(targetRoomId_1);
                        [s1_1, s2_1].forEach(function (s) {
                            if (s) {
                                if (s.id !== targetRoomId_1)
                                    s.leave(targetRoomId_1);
                                s.data.currentRoomId = null;
                                if (playersRegistry.has(s.data.userId))
                                    playersRegistry.get(s.data.userId).currentRoomId = null;
                                lobby.addPlayer(s);
                            }
                        });
                    });
                }
            }
            else {
                lobby.addPlayer(socket);
            }
        }
    }
    // --- DÉCONNEXION ---
    socket.on('disconnect', function () {
        var uId = socket.data.userId;
        var rId = socket.data.currentRoomId;
        var name = socket.data.username;
        var oldSocketId = socket.id;
        console.log("[-] ".concat(name, " d\u00E9connect\u00E9. Attente 15s..."));
        var timer = setTimeout(function () {
            console.log("[X] ".concat(name, " supprim\u00E9 d\u00E9finitivement."));
            if (rId) {
                var game = runningGames.get(rId);
                if (game) {
                    game.handleDisconnect(oldSocketId);
                    runningGames.delete(rId);
                    // --- CORRECTION : Récupérer le survivant et le remettre au LOBBY ---
                    var roomSockets = io.sockets.adapter.rooms.get(rId);
                    if (roomSockets) {
                        for (var _i = 0, roomSockets_1 = roomSockets; _i < roomSockets_1.length; _i++) {
                            var survivorId = roomSockets_1[_i];
                            var s = io.sockets.sockets.get(survivorId);
                            if (s) {
                                s.data.currentRoomId = null; // Il n'est plus en jeu
                                s.leave(rId); // Il quitte la salle technique
                                // Mise à jour de sa persistance
                                if (playersRegistry.has(s.data.userId)) {
                                    playersRegistry.get(s.data.userId).currentRoomId = null;
                                }
                                // On le remet physiquement dans le système du Lobby
                                lobby.addPlayer(s);
                                // On ferme ses modales
                                s.emit('modal', { close: true });
                            }
                        }
                    }
                }
            }
            lobby.removePlayer(oldSocketId);
            playersRegistry.delete(uId);
        }, 15000);
        if (playersRegistry.has(uId)) {
            playersRegistry.get(uId).disconnectTimer = timer;
        }
    });
}); // <--- C'EST CETTE ACCOLADE QUI MANQUAIT
server.listen(PORT, function () {
    console.log("\uD83D\uDE80 SERVEUR PR\u00CAT : http://".concat(getLocalIp(), ":").concat(PORT));
});
