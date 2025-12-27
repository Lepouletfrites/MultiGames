import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import os from 'os';

import { GameInstance } from './games/GameInterface';
import { Session } from './games/Session';
import { Lobby } from './games/Lobby';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const runningGames = new Map<string, GameInstance>();
const lobby = new Lobby(io);

io.on('connection', (socket) => {
  const pseudo = socket.handshake.auth.name || "Anonyme";
  socket.data.username = pseudo;
  socket.data.currentRoomId = null; 

  console.log(`[+] ${pseudo} est en ligne`);
  socket.emit('serverInfo', { ip: getLocalIp(), port: PORT });
  
  lobby.addPlayer(socket);

  socket.on('gameAction', (actionId: string) => {
    if (actionId.startsWith('LOBBY_')) {
        handleLobbyAction(socket, actionId);
        return;
    }

    const roomId = socket.data.currentRoomId;
    if (roomId) {
      const game = runningGames.get(roomId);
      if (game) game.handleAction(socket.id, actionId);
    }
  });

  function handleLobbyAction(socket: Socket, actionId: string) {
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
          const targetRoomId = actionId.replace('LOBBY_JOIN_', '');
          const room = lobby.getRoom(targetRoomId);

          if (room) {
              const p1Id = room.hostId;
              const p2Id = socket.id;

              lobby.removePlayer(p1Id);
              lobby.removePlayer(p2Id);

              const s1 = io.sockets.sockets.get(p1Id);
              const s2 = io.sockets.sockets.get(p2Id);

              if (s1 && s2) {
                  s1.join(targetRoomId);
                  s1.data.currentRoomId = targetRoomId;
                  s2.join(targetRoomId);
                  s2.data.currentRoomId = targetRoomId;

                  const session = new Session(io, targetRoomId, p1Id, p2Id);
                  runningGames.set(targetRoomId, session);
                  
                  session.start((winner) => {
                      console.log(`[SERVEUR] Fermeture de la session ${targetRoomId}`);
                      runningGames.delete(targetRoomId);

                      // --- LOGIQUE DE SORTIE CORRIGÉE ---
                      [p1Id, p2Id].forEach(pid => {
                          const s = io.sockets.sockets.get(pid);
                          if (s) {
                              // IMPORTANT : On ne quitte la room QUE si ce n'est pas notre propre ID
                              if (s.id !== targetRoomId) {
                                  s.leave(targetRoomId);
                              }
                              s.data.currentRoomId = null;
                              lobby.addPlayer(s); // Le lobby va envoyer le renderUI
                          }
                      });
                  });
              }
          } else {
              lobby.addPlayer(socket);
          }
      }
  }

  socket.on('disconnect', () => {
    const pseudo = socket.data.username;
    console.log(`[-] ${pseudo} est parti`);
    lobby.removePlayer(socket.id);
    const roomId = socket.data.currentRoomId;
    if (roomId) {
      const game = runningGames.get(roomId);
      if (game) {
        game.handleDisconnect(socket.id);
        runningGames.delete(roomId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 SERVEUR PRÊT : http://${getLocalIp()}:${PORT}`);
});
