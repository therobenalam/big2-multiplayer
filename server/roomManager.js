import { makeDeck, shuffle, dealToFour, classify, canBeat, includes3D, sortHand } from './engine.js';
import { randomUUID } from 'crypto';

export function createGameRoomManager(io) {
  const waiting = [];
  const rooms = new Map(); // roomId -> room
  const socketToRoom = new Map();

  function enqueuePlayer(socket, name) {
    if (!name) name = 'Player';
    socket.data.name = name;
    waiting.push(socket);
    socket.emit('queued', { position: waiting.length });
    tryStartGame();
  }

  function tryStartGame() {
    while (waiting.length >= 4) {
      const players = [waiting.shift(), waiting.shift(), waiting.shift(), waiting.shift()];
      const roomId = randomId();
      const room = {
        id: roomId,
        players: players.map((s) => ({ socket: s, id: s.id, name: s.data.name, hand: [], passed: false })),
        lastPlay: null, // {by: playerIndex, combo, cards}
        turn: null, // playerIndex whose turn
        leader: null, // playerIndex who leads current trick
        firstTrick: true,
        finished: false, // true when entire game over (>100)
        history: [], // array of { by, type, count, cards: [{id,r,s}] }
        scores: [0, 0, 0, 0],
        matchNumber: 1,
        enforce3D: true // only for the first match
      };

      rooms.set(roomId, room);
      for (const p of room.players) {
        socketToRoom.set(p.socket.id, roomId);
        p.socket.join(roomId);
      }

      // Start first match; starter is holder of 3♦ and 3♦ must be included on first lead
      startNewMatch(room, null, true);
    }
  }

  function handlePlay(socket, cardIds) {
    const room = getRoomBySocket(socket);
    if (!room || room.finished) throw new Error('Not in game');
    const meIdx = room.players.findIndex(p => p.socket.id === socket.id);
    if (meIdx !== room.turn) throw new Error("Not your turn");

    const me = room.players[meIdx];
    const cards = cardIds.map(id => me.hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) throw new Error('You do not hold these cards');

    const combo = classify(cards);
    if (!combo) throw new Error('Invalid combination');

    if (room.firstTrick && room.lastPlay === null && room.enforce3D) {
      if (!includes3D(cards)) throw new Error('First play must include 3♦');
    }

    if (room.lastPlay) {
      if (cards.length !== room.lastPlay.cards.length) throw new Error('Must match number of cards');
      if (!canBeat(room.lastPlay.combo, combo)) throw new Error('Does not beat previous');
    }

    // apply move: remove cards from hand
    me.hand = me.hand.filter(c => !cardIds.includes(c.id));
    me.passed = false;
    room.lastPlay = { by: meIdx, combo, cards };
  // persist in history
  room.history.push({ by: meIdx, type: combo.type, count: cards.length, cards: cards.map(c=>({ id: c.id, r: c.r, s: c.s })) });
    room.firstTrick = false;

    // match win?
    if (me.hand.length === 0) {
      finishMatch(room, meIdx);
      return;
    }

    // advance turn
    const nextIdx = nextAlive(room, meIdx);
    room.turn = nextIdx;

    // reset others' passed? We keep passed flags and only clear when trick ends; stepping continues.
    broadcastState(room);

    // If all others passed already (edge: can happen if only one competitor), end trick immediately
    if (allOthersPassed(room)) {
      endTrick(room);
    }
  }

  function handlePass(socket) {
    const room = getRoomBySocket(socket);
    if (!room || room.finished) throw new Error('Not in game');
    const meIdx = room.players.findIndex(p => p.socket.id === socket.id);
    if (meIdx !== room.turn) throw new Error('Not your turn');
    if (!room.lastPlay) throw new Error('Cannot pass on a fresh trick');

    room.players[meIdx].passed = true;
    // if passing makes all others passed -> end trick
    if (allOthersPassed(room)) {
      endTrick(room);
    } else {
      room.turn = nextAlive(room, meIdx);
      broadcastState(room);
    }
  }

  function allOthersPassed(room) {
    if (!room.lastPlay) return false;
    const lastBy = room.lastPlay.by;
    return room.players.every((p, idx) => idx === lastBy || p.passed === true);
  }

  function endTrick(room) {
    // last player to play becomes leader and next turn
    const lastBy = room.lastPlay.by;
    room.players.forEach(p => p.passed = false);
    room.leader = lastBy;
    room.turn = lastBy;
    room.lastPlay = null;
    broadcastState(room);
  }

  function handleDisconnect(socket) {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      // might be in waiting
      const i = waiting.findIndex(s => s.id === socket.id);
      if (i >= 0) waiting.splice(i, 1);
      return;
    }
    const room = rooms.get(roomId);
    if (!room) return;
    const idx = room.players.findIndex(p => p.socket.id === socket.id);
    if (idx >= 0) {
      // end game and notify
      room.finished = true;
      room.players.forEach(p => {
        if (p.socket.connected) p.socket.emit('gameAborted', { reason: 'A player disconnected.' });
        socketToRoom.delete(p.socket.id);
        p.socket.leave(roomId);
      });
      rooms.delete(roomId);
    }
  }

  function broadcastState(room) {
    for (let i=0;i<4;i++) {
      const p = room.players[i];
      const payload = roomStateFor(room, i);
      p.socket.emit('state', payload);
    }
  }

  function broadcastGameOver(room, summary) {
    for (let i=0;i<4;i++) {
      const p = room.players[i];
      p.socket.emit('gameOver', summary);
    }
    // cleanup
    const roomId = room.id;
    room.players.forEach(p => socketToRoom.delete(p.socket.id));
    rooms.delete(roomId);
  }

  function roomStateFor(room, viewerIdx) {
    return {
      roomId: room.id,
      you: viewerIdx,
      names: room.players.map(p=>p.name),
      hand: sortHand(room.players[viewerIdx].hand),
      counts: room.players.map(p=>p.hand.length),
      passed: room.players.map(p=>!!p.passed),
      lastPlay: room.lastPlay ? { by: room.lastPlay.by, type: room.lastPlay.combo.type, count: room.lastPlay.cards.length, cards: room.lastPlay.cards.map(c=>({ id: c.id, r: c.r, s: c.s })) } : null,
      history: room.history.slice(-30),
      scores: room.scores,
      matchNumber: room.matchNumber,
      turn: room.turn,
      leader: room.leader,
      finished: room.finished
    };
  }

  function getRoomBySocket(socket) {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return null;
    return rooms.get(roomId) || null;
  }

  function nextAlive(room, fromIdx) {
    for (let k=1;k<=4;k++) {
      const i = (fromIdx + k) % 4;
      // if no one has played yet in trick, everyone is alive; otherwise alive means not passed or is lastBy
      if (!room.lastPlay) return i;
      if (i === room.lastPlay.by) return i; // next to leader allowed
      if (!room.players[i].passed) return i;
    }
    return fromIdx; // shouldn't happen
  }

  function randomId() { return randomUUID?.() || Math.random().toString(36).slice(2,10); }

  // Helpers for multi-match lifecycle
  function startNewMatch(room, startingIdx /* number|null */, enforce3D) {
    const deck = shuffle(makeDeck());
    const hands = dealToFour(deck);
    room.players.forEach((p, i) => {
      p.hand = hands[i];
      p.passed = false;
    });
    // determine starting player
    let startIndex = startingIdx;
    if (startIndex === null || startIndex === undefined) {
      startIndex = room.players.findIndex(p => p.hand.some(c => c.id === '3D'));
      if (startIndex < 0) startIndex = 0;
    }
    room.turn = startIndex;
    room.leader = startIndex;
    room.firstTrick = true;
    room.lastPlay = null;
    room.enforce3D = !!enforce3D;

    // Broadcast fresh state and a start event for the match
    broadcastState(room);
    room.players.forEach((p, idx) => {
      p.socket.emit('gameStarted', {
        roomId: room.id,
        seat: idx,
        name: p.name,
        hand: room.players[idx].hand,
        turn: room.turn,
        leader: room.leader,
        scores: room.scores,
        matchNumber: room.matchNumber
      });
    });
  }

  function penaltyPoints(cardsLeft) {
    if (cardsLeft <= 0) return 0;
    if (cardsLeft <= 4) return cardsLeft;
    if (cardsLeft <= 9) return cardsLeft * 2;
    return cardsLeft * 3; // 10 to 13
  }

  function finishMatch(room, winnerIdx) {
    // accumulate scores for others
    const pointsAdded = [0, 0, 0, 0];
    room.players.forEach((p, i) => {
      if (i === winnerIdx) return;
      const n = p.hand.length;
      const add = penaltyPoints(n);
      room.scores[i] += add;
      pointsAdded[i] = add;
    });

    const handsLeft = room.players.map(p => p.hand.length);

    // notify match end summary
    for (let i=0;i<4;i++) {
      const ps = room.players[i];
      ps.socket.emit('matchEnded', {
        winner: winnerIdx,
        pointsAdded,
        scores: room.scores,
        handsLeft,
        matchNumber: room.matchNumber
      });
    }

    // Check game over condition (> 100)
    const busted = room.scores.map((s, i) => ({ i, s })).filter(x => x.s > 100).map(x => x.i);
    if (busted.length > 0) {
      room.finished = true;
      const minScore = Math.min(...room.scores);
      const champion = room.scores.findIndex(s => s === minScore);
      broadcastGameOver(room, {
        scores: room.scores,
        busted,
        champion,
        matchNumber: room.matchNumber
      });
      return;
    }

    // Start next match automatically with winner leading; no 3♦ enforcement from now on
    room.matchNumber += 1;
    setTimeout(() => startNewMatch(room, winnerIdx, false), 1200);
  }

  return { enqueuePlayer, handlePlay, handlePass, handleDisconnect };
}
