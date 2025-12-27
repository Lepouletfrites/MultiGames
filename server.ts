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

// --- UTILITAIRES ---
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

const playersRegistry = new Map<string, any>();

io.on('connection', (socket) => {
  const pseudo = socket.handshake.auth.name || "Anonyme";
  const userId = socket.handshake.auth.userId;

  if (!userId) return socket.disconnect();

  socket.data.username = pseudo;
  socket.data.userId = userId;

  if (playersRegistry.has(userId)) {
      const savedData = playersRegistry.get(userId);
      const oldSocketId = savedData.socketId;

      if (savedData.disconnectTimer) clearTimeout(savedData.disconnectTimer);

      socket.data.currentRoomId = savedData.currentRoomId;

      if (socket.data.currentRoomId) {
          socket.join(socket.data.currentRoomId);
          const game = runningGames.get(socket.data.currentRoomId);
          
          if (game) {
              game.updatePlayerSocket(oldSocketId, socket.id);
              // On force un refresh immédiat ET un refresh après un court délai
              game.refresh(socket.id); 
              setTimeout(() => { game.refresh(socket.id); }, 500);
          } else {
              // Si le jeu n'existe plus (cas d'erreur), retour lobby
              socket.data.currentRoomId = null;
              lobby.addPlayer(socket);
          }
      } else {
          lobby.addPlayer(socket);
      }
  } else {
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
      const uId = socket.data.userId;

      if (actionId === 'LOBBY_CREATE') {
          lobby.createRoom(socket.id);
          socket.join(socket.id);
          socket.data.currentRoomId = socket.id;
          if (playersRegistry.has(uId)) playersRegistry.get(uId).currentRoomId = socket.id;
      }
      else if (actionId === 'LOBBY_CANCEL') {
          lobby.removePlayer(socket.id);
          socket.data.currentRoomId = null;
          if (playersRegistry.has(uId)) playersRegistry.get(uId).currentRoomId = null;
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
              const s2 = socket;

              if (s1 && s2) {
                  s1.join(targetRoomId);
                  s1.data.currentRoomId = targetRoomId;
                  s2.join(targetRoomId);
                  s2.data.currentRoomId = targetRoomId;

                  if (playersRegistry.has(s1.data.userId)) playersRegistry.get(s1.data.userId).currentRoomId = targetRoomId;
                  if (playersRegistry.has(s2.data.userId)) playersRegistry.get(s2.data.userId).currentRoomId = targetRoomId;

                  const session = new Session(io, targetRoomId, p1Id, p2Id);
                  runningGames.set(targetRoomId, session);
                  
                  session.start((winner) => {
                      runningGames.delete(targetRoomId);
                      [s1, s2].forEach(s => {
                          if (s) {
                              if (s.id !== targetRoomId) s.leave(targetRoomId);
                              s.data.currentRoomId = null;
                              if (playersRegistry.has(s.data.userId)) playersRegistry.get(s.data.userId).currentRoomId = null;
                              lobby.addPlayer(s);
                          }
                      });
                  });
              }
          } else {
              lobby.addPlayer(socket);
          }
      }
  }

  // --- DÉCONNEXION ---
  socket.on('disconnect', () => {
    const uId = socket.data.userId;
    const rId = socket.data.currentRoomId;
    const name = socket.data.username;
    const oldSocketId = socket.id;

    console.log(`[-] ${name} déconnecté. Attente 15s...`);

    const timer = setTimeout(() => {
        console.log(`[X] ${name} supprimé définitivement.`);
        
        if (rId) {
            const game = runningGames.get(rId);
            if (game) {
                game.handleDisconnect(oldSocketId);
                runningGames.delete(rId);

                // --- CORRECTION : Récupérer le survivant et le remettre au LOBBY ---
                const roomSockets = io.sockets.adapter.rooms.get(rId);
                if (roomSockets) {
                    for (const survivorId of roomSockets) {
                        const s = io.sockets.sockets.get(survivorId);
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

server.listen(PORT, () => {
  console.log(`🚀 SERVEUR PRÊT : http://${getLocalIp()}:${PORT}`);
});
