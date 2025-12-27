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
io.on('connection', function (socket) {
    var pseudo = socket.handshake.auth.name || "Anonyme";
    socket.data.username = pseudo;
    socket.data.currentRoomId = null;
    console.log("[+] ".concat(pseudo, " est en ligne"));
    socket.emit('serverInfo', { ip: getLocalIp(), port: PORT });
    lobby.addPlayer(socket);
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
        if (actionId === 'LOBBY_CREATE') {
            lobby.createRoom(socket.id);
            socket.join(socket.id);
            socket.data.currentRoomId = socket.id;
        }
        else if (actionId === 'LOBBY_CANCEL') {
            lobby.removePlayer(socket.id);
            socket.data.currentRoomId = null;
            lobby.addPlayer(socket);
        }
        else if (actionId.startsWith('LOBBY_JOIN_')) {
            var targetRoomId_1 = actionId.replace('LOBBY_JOIN_', '');
            var room = lobby.getRoom(targetRoomId_1);
            if (room) {
                var p1Id_1 = room.hostId;
                var p2Id_1 = socket.id;
                lobby.removePlayer(p1Id_1);
                lobby.removePlayer(p2Id_1);
                var s1 = io.sockets.sockets.get(p1Id_1);
                var s2 = io.sockets.sockets.get(p2Id_1);
                if (s1 && s2) {
                    s1.join(targetRoomId_1);
                    s1.data.currentRoomId = targetRoomId_1;
                    s2.join(targetRoomId_1);
                    s2.data.currentRoomId = targetRoomId_1;
                    var session = new Session_1.Session(io, targetRoomId_1, p1Id_1, p2Id_1);
                    runningGames.set(targetRoomId_1, session);
                    session.start(function (winner) {
                        console.log("[SERVEUR] Fermeture de la session ".concat(targetRoomId_1));
                        runningGames.delete(targetRoomId_1);
                        // --- LOGIQUE DE SORTIE CORRIGÉE ---
                        [p1Id_1, p2Id_1].forEach(function (pid) {
                            var s = io.sockets.sockets.get(pid);
                            if (s) {
                                // IMPORTANT : On ne quitte la room QUE si ce n'est pas notre propre ID
                                if (s.id !== targetRoomId_1) {
                                    s.leave(targetRoomId_1);
                                }
                                s.data.currentRoomId = null;
                                lobby.addPlayer(s); // Le lobby va envoyer le renderUI
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
    socket.on('disconnect', function () {
        var pseudo = socket.data.username;
        console.log("[-] ".concat(pseudo, " est parti"));
        lobby.removePlayer(socket.id);
        var roomId = socket.data.currentRoomId;
        if (roomId) {
            var game = runningGames.get(roomId);
            if (game) {
                game.handleDisconnect(socket.id);
                runningGames.delete(roomId);
            }
        }
    });
});
server.listen(PORT, function () {
    console.log("\uD83D\uDE80 SERVEUR PR\u00CAT : http://".concat(getLocalIp(), ":").concat(PORT));
});
