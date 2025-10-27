import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGameRoomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(cors());

// Health endpoint for Render
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// Serve built client (vite build outputs to client/dist)
const clientDist = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const mgr = createGameRoomManager(io);

eo.on('connection', (socket) => {
  socket.on('join', ({ name }) => {
    try {
      mgr.enqueuePlayer(socket, name?.toString().trim() || 'Player');
    } catch (e) {
      socket.emit('errorMessage', e?.message || 'Failed to join');
    }
  });

  socket.on('play', (cardIds) => {
    try {
      mgr.handlePlay(socket, cardIds);
    } catch (e) {
      socket.emit('playRejected', { error: e?.message || 'Invalid play' });
    }
  });

  socket.on('pass', () => {
    try {
      mgr.handlePass(socket);
    } catch (e) {
      socket.emit('playRejected', { error: e?.message || 'Cannot pass' });
    }
  });

  socket.on('disconnect', () => {
    mgr.handleDisconnect(socket);
  });
});

const port = process.env.PORT || 10000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Big2 server listening on port ${port}`);
});
