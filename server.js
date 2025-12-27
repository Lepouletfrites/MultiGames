"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var path_1 = require("path");
var os_1 = require("os");
var Session_1 = require("./games/Session"); // Important : On importe Session
var app = (0, express_1.default)();
var server = http_1.default.createServer(app);
var io = new socket_io_1.Server(server);
app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
// Utilitaire IP
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
// Stockage des parties (Sessions)
var runningGames = new Map();
var waitingPlayer = null;
io.on('connection', function (socket) {
    socket.emit('serverInfo', { ip: getLocalIp(), port: 3000 });
    // --- MATCHMAKING ---
    if (waitingPlayer) {
        var opponent = waitingPlayer;
        waitingPlayer = null;
        var roomId = Math.random().toString(36).substring(7);
        socket.join(roomId);
        opponent.join(roomId);
        console.log("Session lanc\u00E9e dans la room ".concat(roomId));
        // ON LANCE LA SESSION (Hub)
        var session = new Session_1.Session(io, roomId, socket.id, opponent.id);
        runningGames.set(roomId, session);
        session.start();
    }
    else {
        waitingPlayer = socket;
        socket.emit('renderUI', {
            title: "MULTIJEUX ARCADE",
            status: "En attente d'un adversaire...",
            displays: [],
            buttons: []
        });
    }
    // --- ROUTEUR D'ACTIONS ---
    socket.on('gameAction', function (actionId) {
        var roomId = Array.from(socket.rooms).find(function (r) { return r !== socket.id; });
        if (!roomId)
            return;
        var game = runningGames.get(roomId);
        if (game) {
            game.handleAction(socket.id, actionId);
        }
    });
    // --- DÉCONNEXION ---
    socket.on('disconnect', function () {
        if (waitingPlayer === socket)
            waitingPlayer = null;
        var roomId = Array.from(socket.rooms).find(function (r) { return r !== socket.id; });
        if (roomId) {
            var game = runningGames.get(roomId);
            if (game) {
                game.handleDisconnect(socket.id);
                runningGames.delete(roomId);
            }
        }
    });
});
server.listen(3000, function () {
    var ip = getLocalIp();
    console.log('---------------------------------');
    console.log("\uD83D\uDE80 SERVEUR SESSION LANC\u00C9 !");
    console.log("\uD83C\uDFE0 http://".concat(ip, ":3000"));
    console.log('---------------------------------');
});
