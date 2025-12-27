import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import os from 'os';

// Imports
import { GameInstance } from './games/GameInterface';
import { Session } from './games/Session'; // Important : On importe Session

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Utilitaire IP
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// Stockage des parties (Sessions)
const runningGames = new Map<string, GameInstance>();
let waitingPlayer: Socket | null = null;

io.on('connection', (socket) => {
  socket.emit('serverInfo', { ip: getLocalIp(), port: 3000 });

  // --- MATCHMAKING ---
  if (waitingPlayer) {
    const opponent = waitingPlayer;
    waitingPlayer = null;

    const roomId = Math.random().toString(36).substring(7);
    socket.join(roomId);
    opponent.join(roomId);

    console.log(`Session lancée dans la room ${roomId}`);

    // ON LANCE LA SESSION (Hub)
    const session = new Session(io, roomId, socket.id, opponent.id);
    runningGames.set(roomId, session);
    session.start();

  } else {
    waitingPlayer = socket;
    socket.emit('renderUI', { 
        title: "MULTIJEUX ARCADE", 
        status: "En attente d'un adversaire...",
        displays: [],
        buttons: [] 
    });
  }

  // --- ROUTEUR D'ACTIONS ---
  socket.on('gameAction', (actionId: string) => {
    const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;

    const game = runningGames.get(roomId);
    if (game) {
      game.handleAction(socket.id, actionId);
    }
  });

  // --- DÉCONNEXION ---
  socket.on('disconnect', () => {
    if (waitingPlayer === socket) waitingPlayer = null;

    const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
    if (roomId) {
      const game = runningGames.get(roomId);
      if (game) {
        game.handleDisconnect(socket.id);
        runningGames.delete(roomId);
      }
    }
  });
});

server.listen(3000, () => {
  const ip = getLocalIp();
  console.log('---------------------------------');
  console.log(`🚀 SERVEUR SESSION LANCÉ !`);
  console.log(`🏠 http://${ip}:3000`);
  console.log('---------------------------------');
});
