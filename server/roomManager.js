import { makeDeck, shuffle, dealToFour, classify, canBeat, includes3D, sortHand, getAIPlay } from './engine.js';
import { randomUUID } from 'crypto';

export function createGameRoomManager(io) {
  const waitingRooms = new Map(); // waitingRoomId -> waiting room
  const rooms = new Map(); // roomId -> active game room
  const socketToRoom = new Map(); // socket.id -> roomId (for both waiting and active rooms)
  const socketToWaitingRoom = new Map(); // socket.id -> waitingRoomId
  const playerSessions = new Map(); // playerName+roomId -> player session data for reconnection

  function enqueuePlayer(socket, name) {
    if (!name) name = 'Player';
    socket.data.name = name;
    
    // Try to find a waiting room with less than 4 players
    let waitingRoom = null;
    for (const [roomId, room] of waitingRooms) {
      if (room.players.length < 4) {
        waitingRoom = room;
        break;
      }
    }
    
    // If no available waiting room, create a new one
    if (!waitingRoom) {
      const roomId = randomId();
      waitingRoom = {
        id: roomId,
        players: [],
        chatHistory: [],
        creator: socket.id // Track who created the room
      };
      waitingRooms.set(roomId, waitingRoom);
    }
    
    // Add player to waiting room
    waitingRoom.players.push({
      socket: socket,
      id: socket.id,
      name: name,
      isBot: false
    });
    
    socketToWaitingRoom.set(socket.id, waitingRoom.id);
    socket.join(waitingRoom.id);
    
    // Broadcast updated waiting room state to all players in the room
    broadcastWaitingRoomState(waitingRoom);
    
    // Send chat history to the joining player
    waitingRoom.chatHistory.forEach(msg => {
      socket.emit('chatMessage', msg);
    });
    
    // Send system message that player joined
    sendWaitingRoomSystemMessage(waitingRoom, `${name} joined the waiting room`);
    
    // If 4 players, start the game
    if (waitingRoom.players.length === 4) {
      startGameFromWaitingRoom(waitingRoom);
    }
  }

  // Helper function to check if a play contains the highest unplayed card/combo
  function checkHighestCardPlayed(room, cards, combo) {
    const playedCards = room.playedCards || new Set();
    
    // For 5-card combinations where 2 is not the determining factor, skip notification
    if (combo.type === 'straight' || combo.type === 'flush' || combo.type === 'fullhouse' || combo.type === 'fourkind' || combo.type === 'straightflush') {
      // For straights: 2 is not determining strength unless it's the top card (e.g., A-2-3-4-5)
      if (combo.type === 'straight') {
        const ranks = cards.map(c => c.r);
        const isLowStraight = ranks.includes('A') && ranks.includes('2') && ranks.includes('3') && ranks.includes('4') && ranks.includes('5');
        if (!isLowStraight && ranks.includes('2')) {
          // 2 is present but not determining strength (e.g., 2-3-4-5-6)
          return null;
        }
      }
      // For full house: if 2 is in the pair, it's not determining
      if (combo.type === 'fullhouse') {
        const rankCounts = {};
        cards.forEach(c => rankCounts[c.r] = (rankCounts[c.r] || 0) + 1);
        const tripleRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
        if (tripleRank !== '2') {
          return null; // 2 is not the triple, so not determining
        }
      }
      // For four of a kind: if 2 is the single, it's not determining
      if (combo.type === 'fourkind') {
        const rankCounts = {};
        cards.forEach(c => rankCounts[c.r] = (rankCounts[c.r] || 0) + 1);
        const quadRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
        if (quadRank !== '2') {
          return null; // 2 is not the quad, so not determining
        }
      }
    }

    // Check singles, pairs, triples
    if (combo.type === 'single') {
      const card = cards[0];
      // Check if this is the highest unplayed card
      const allCards = ['2S', '2H', '2C', '2D', 'AS', 'AH', 'AC', 'AD', 'KS', 'KH', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD', 'JS', 'JH', 'JC', 'JD'];
      for (const testCard of allCards) {
        if (!playedCards.has(testCard)) {
          if (testCard === card.id) {
            return { type: 'single', card: card.id, rank: card.r, suit: card.s };
          }
          return null; // There's a higher card still unplayed
        }
      }
    }
    
    if (combo.type === 'pair') {
      // Check if this is the highest unplayed pair
      const rank = cards[0].r;
      const suits = cards.map(c => c.s).sort((a, b) => {
        const suitOrder = { 'D': 0, 'C': 1, 'H': 2, 'S': 3 };
        return suitOrder[a] - suitOrder[b];
      });
      
      // Check all possible pairs from highest to lowest
      const rankOrder = ['2', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3'];
      const suitOrderDesc = ['S', 'H', 'C', 'D']; // Descending by value
      
      for (const r of rankOrder) {
        // Generate all possible pairs for this rank, from highest to lowest
        const possiblePairs = [];
        for (let i = 0; i < suitOrderDesc.length; i++) {
          for (let j = i + 1; j < suitOrderDesc.length; j++) {
            possiblePairs.push([suitOrderDesc[i], suitOrderDesc[j]]);
          }
        }
        
        for (const [s1, s2] of possiblePairs) {
          const card1 = `${r}${s1}`;
          const card2 = `${r}${s2}`;
          
          if (!playedCards.has(card1) && !playedCards.has(card2)) {
            // This pair is unplayed - check if it matches our played pair
            if (r === rank && suits[0] === s2 && suits[1] === s1) {
              return { type: 'pair', rank: r, suits: [s1, s2] };
            }
            return null; // There's a higher pair still unplayed
          }
        }
      }
    }
    
    if (combo.type === 'triple') {
      const rank = cards[0].r;
      // Check if this is the highest unplayed triple
      const rankOrder = ['2', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3'];
      
      for (const r of rankOrder) {
        const suitOrder = ['S', 'H', 'C', 'D'];
        let availableCount = 0;
        for (const s of suitOrder) {
          if (!playedCards.has(`${r}${s}`)) {
            availableCount++;
          }
        }
        
        if (availableCount >= 3) {
          // This triple is still possible
          if (r === rank) {
            return { type: 'triple', rank: r };
          }
          return null; // There's a higher triple still possible
        }
      }
    }

    return null;
  }

  function startAutoPassCountdown(room, exemptPlayerIdx) {
    // Clear any existing timer
    if (room.autoPassTimer) {
      clearInterval(room.autoPassTimer);
    }

    room.autoPassCountdown = 10;
    
    // Emit initial countdown
    room.players.forEach(player => {
      if (player.socket) {
        player.socket.emit('autoPassCountdown', {
          countdown: room.autoPassCountdown,
          exemptPlayer: exemptPlayerIdx
        });
      }
    });

    // Start countdown
    room.autoPassTimer = setInterval(() => {
      room.autoPassCountdown -= 1;

      // Emit countdown update
      room.players.forEach(player => {
        if (player.socket) {
          player.socket.emit('autoPassCountdown', {
            countdown: room.autoPassCountdown,
            exemptPlayer: exemptPlayerIdx
          });
        }
      });

      // When countdown reaches 0, auto-pass all other players
      if (room.autoPassCountdown <= 0) {
        clearInterval(room.autoPassTimer);
        room.autoPassTimer = null;
        
        // Auto-pass all players except the one who played the highest card
        let allPassed = true;
        room.players.forEach((p, idx) => {
          if (idx !== exemptPlayerIdx && !p.passed && p.hand.length > 0) {
            p.passed = true;
            console.log(`Auto-passing ${p.name}`);
          }
        });

        // Check if all others have passed
        if (allOthersPassed(room)) {
          endTrick(room);
        } else {
          broadcastState(room);
        }
      }
    }, 1000);
  }

  function cancelAutoPassCountdown(room) {
    if (room.autoPassTimer) {
      clearInterval(room.autoPassTimer);
      room.autoPassTimer = null;
      room.autoPassCountdown = 0;
      
      // Notify clients that countdown is cancelled
      room.players.forEach(player => {
        if (player.socket) {
          player.socket.emit('autoPassCountdown', {
            countdown: 0,
            exemptPlayer: null
          });
        }
      });
    }
  }

  function broadcastWaitingRoomState(waitingRoom) {
    const state = {
      roomId: waitingRoom.id,
      players: waitingRoom.players.map(p => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot || false
      })),
      playersNeeded: 4 - waitingRoom.players.length,
      isReady: waitingRoom.players.length === 4,
      isCreator: {} // Will be filled per-socket
    };
    
    waitingRoom.players.forEach(p => {
      if (p.socket) {
        const personalState = {
          ...state,
          isCreator: p.id === waitingRoom.creator
        };
        p.socket.emit('waitingRoomState', personalState);
      }
    });
  }

  function startGameWithBots(socket) {
    console.log('startGameWithBots called by socket:', socket.id);
    const waitingRoomId = socketToWaitingRoom.get(socket.id);
    console.log('waitingRoomId:', waitingRoomId);
    if (!waitingRoomId) {
      socket.emit('errorMessage', 'Not in a waiting room');
      return;
    }
    
    const waitingRoom = waitingRooms.get(waitingRoomId);
    console.log('waitingRoom:', waitingRoom ? 'found' : 'not found');
    if (!waitingRoom) {
      socket.emit('errorMessage', 'Waiting room not found');
      return;
    }
    
    // Only the creator can start with bots
    console.log('creator:', waitingRoom.creator, 'socket.id:', socket.id);
    if (waitingRoom.creator !== socket.id) {
      socket.emit('errorMessage', 'Only the room creator can start the game with bots');
      return;
    }
    
    // Must have at least 1 human player
    if (waitingRoom.players.length === 0) {
      socket.emit('errorMessage', 'Need at least one player');
      return;
    }
    
    // Add AI bots to fill remaining slots
    const botsNeeded = 4 - waitingRoom.players.length;
    const botNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta'];
    
    console.log(`Adding ${botsNeeded} bots to waiting room`);
    for (let i = 0; i < botsNeeded; i++) {
      const botName = botNames[i];
      waitingRoom.players.push({
        socket: null, // Bots don't have sockets
        id: `bot-${randomId()}`,
        name: botName,
        isBot: true
      });
    }
    
    console.log('Total players after adding bots:', waitingRoom.players.length);
    // Broadcast updated state before starting
    sendWaitingRoomSystemMessage(waitingRoom, `${botsNeeded} AI bot(s) added. Starting game...`);
    broadcastWaitingRoomState(waitingRoom);
    
    console.log('Scheduling game start in 1 second...');
    // Start the game
    setTimeout(() => {
      console.log('Starting game from waiting room...');
      startGameFromWaitingRoom(waitingRoom);
    }, 1000);
  }

  function startGameFromWaitingRoom(waitingRoom) {
    console.log('=== startGameFromWaitingRoom called ===');
    console.log('Waiting room players:', waitingRoom.players.length);
    console.log('Players:', waitingRoom.players.map(p => ({ name: p.name, isBot: p.isBot })));
    
    const roomId = randomId();
    const room = {
      id: roomId,
      players: waitingRoom.players.map((p) => ({ 
        socket: p.socket, 
        id: p.id, 
        name: p.name, 
        hand: [], 
        passed: false,
        disconnected: false,
        disconnectTime: null,
        isBot: p.isBot || false
      })),
      lastPlay: null, // {by: playerIndex, combo, cards}
      lastPlayType: null, // The classified combo of the last play
      turn: null, // playerIndex whose turn
      leader: null, // playerIndex who leads current trick
      firstTrick: true,
      finished: false, // true when entire game over (>100)
      history: [], // array of { by, type, count, cards: [{id,r,s}] }
      scores: [0, 0, 0, 0],
      matchNumber: 1,
      enforce3D: true, // only for the first match
      playedCards: new Set(), // Track all cards played in current match
      autoPassTimer: null, // Timer for automatic pass
      autoPassCountdown: 0, // Current countdown value
      chatHistory: waitingRoom.chatHistory || [], // Transfer chat history from waiting room
      disconnectTimers: {} // Track disconnect timers for each player
    };

    rooms.set(roomId, room);
    
    // Update socket mappings (only for human players)
    for (const p of room.players) {
      if (p.socket) {
        socketToRoom.set(p.socket.id, roomId);
        socketToWaitingRoom.delete(p.socket.id);
        p.socket.leave(waitingRoom.id);
        p.socket.join(roomId);
      }
    }
    
    // Remove waiting room
    waitingRooms.delete(waitingRoom.id);
    
    // Send existing chat history to all human players
    room.chatHistory.forEach(msg => {
      room.players.forEach(p => {
        if (p.socket) {
          p.socket.emit('chatMessage', msg);
        }
      });
    });
    
    // Send system message that game is starting
    sendSystemMessage(room, 'Game is starting! Good luck!');

    // Start first match; starter is holder of 3♦ and 3♦ must be included on first lead
    startNewMatch(room, null, true);
  }

  function handlePlay(socket, cardIds) {
    const room = getRoomBySocket(socket);
    if (!room || room.finished) throw new Error('Not in game');
    const meIdx = room.players.findIndex(p => p.socket && p.socket.id === socket.id);
    if (meIdx === -1) throw new Error('Player not found');
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

    // Check if this is the highest card BEFORE adding to playedCards
    const highestCardInfo = checkHighestCardPlayed(room, cards, combo);

    // apply move: remove cards from hand and track played cards
    me.hand = me.hand.filter(c => !cardIds.includes(c.id));
    cards.forEach(c => room.playedCards.add(c.id));
    me.passed = false;
    room.lastPlay = { by: meIdx, combo, cards };
    room.lastPlayType = combo;
  // persist in history
  room.history.push({ by: meIdx, type: combo.type, count: cards.length, cards: cards.map(c=>({ id: c.id, r: c.r, s: c.s })) });
    room.firstTrick = false;

    // Emit highest card notification if applicable
    if (highestCardInfo) {
      console.log(`Highest card played: ${me.name} played ${combo.type}`, highestCardInfo);
      room.players.forEach(player => {
        if (player.socket) {
          player.socket.emit('highestCardPlayed', {
            playerIndex: meIdx,
            playerName: me.name,
            info: highestCardInfo,
            combo: combo.type
          });
        }
      });
      
      // Start 10-second countdown for auto-pass
      startAutoPassCountdown(room, meIdx);
    } else {
      // Cancel any existing countdown if this is not the highest card
      cancelAutoPassCountdown(room);
    }

    // match win?
    if (me.hand.length === 0) {
      finishMatch(room, meIdx);
      return;
    }

    // advance turn
    const nextIdx = nextAlive(room, meIdx);
    room.turn = nextIdx;

    // Check if any player has only 1 card left and emit warning BEFORE broadcasting state
    room.players.forEach((p, idx) => {
      if (p.hand.length === 1) {
        console.log(`Warning: ${p.name} has 1 card left!`);
        room.players.forEach(player => {
          if (player.socket) {
            player.socket.emit('playerOneCardLeft', { 
              playerIndex: idx, 
              playerName: p.name 
            });
          }
        });
      }
    });

    // reset others' passed? We keep passed flags and only clear when trick ends; stepping continues.
    broadcastState(room);

    // If all others passed already (edge: can happen if only one competitor), end trick immediately
    if (allOthersPassed(room)) {
      endTrick(room);
    } else if (room.players[nextIdx].isBot) {
      // If next player is a bot, trigger AI turn
      setTimeout(() => processAITurn(room), 1500);
    }
  }

  function handlePass(socket) {
    const room = getRoomBySocket(socket);
    if (!room || room.finished) throw new Error('Not in game');
    const meIdx = room.players.findIndex(p => p.socket && p.socket.id === socket.id);
    if (meIdx === -1) throw new Error('Player not found');
    if (meIdx !== room.turn) throw new Error('Not your turn');
    if (!room.lastPlay) throw new Error('Cannot pass on a fresh trick');

    room.players[meIdx].passed = true;
    
    // if passing makes all others passed -> end trick
    if (allOthersPassed(room)) {
      cancelAutoPassCountdown(room); // Cancel countdown when trick ends
      endTrick(room);
    } else {
      room.turn = nextAlive(room, meIdx);
      broadcastState(room);
      
      // If next player is a bot, trigger AI turn
      if (room.players[room.turn].isBot) {
        setTimeout(() => processAITurn(room), 1500);
      }
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
    room.lastPlayType = null;
    cancelAutoPassCountdown(room); // Cancel countdown when trick ends
    broadcastState(room);
    
    // If the new turn is a bot, trigger AI turn
    if (room.players[room.turn].isBot) {
      setTimeout(() => processAITurn(room), 1000);
    }
  }

  function processAITurn(room) {
    if (room.finished) return;
    
    const currentPlayerIdx = room.turn;
    const currentPlayer = room.players[currentPlayerIdx];
    
    // Make sure it's actually a bot's turn
    if (!currentPlayer.isBot) return;
    
    // Get all player card counts for AI decision making
    const allPlayerCounts = room.players.map((p, idx) => 
      idx === currentPlayerIdx ? -1 : p.hand.length
    );
    
    // Get AI decision
    const aiPlay = getAIPlay(
      currentPlayer.hand, 
      room.lastPlay, 
      room.lastPlayType, 
      allPlayerCounts
    );
    
    if (aiPlay && aiPlay.length > 0) {
      // AI decided to play cards
      const cardIds = aiPlay.map(c => c.id);
      
      try {
        // Validate and execute the play
        const cards = cardIds.map(id => currentPlayer.hand.find(c => c.id === id)).filter(Boolean);
        if (cards.length !== cardIds.length) {
          console.error('AI tried to play cards it doesn\'t have');
          return;
        }

        const combo = classify(cards);
        if (!combo) {
          console.error('AI tried to play invalid combination');
          return;
        }

        if (room.firstTrick && room.lastPlay === null && room.enforce3D) {
          if (!includes3D(cards)) {
            console.error('AI tried to play without 3♦ on first trick');
            return;
          }
        }

        if (room.lastPlay) {
          if (cards.length !== room.lastPlay.cards.length) {
            console.error('AI tried to play wrong number of cards');
            return;
          }
          if (!canBeat(room.lastPlay.combo, combo)) {
            console.error('AI tried to play cards that don\'t beat previous');
            return;
          }
        }

        // Check if this is the highest card BEFORE adding to playedCards
        const highestCardInfo = checkHighestCardPlayed(room, cards, combo);

        // Execute the play
        currentPlayer.hand = currentPlayer.hand.filter(c => !cardIds.includes(c.id));
        cards.forEach(c => room.playedCards.add(c.id));
        currentPlayer.passed = false;
        room.lastPlay = { by: currentPlayerIdx, combo, cards };
        room.lastPlayType = combo;
        room.history.push({ 
          by: currentPlayerIdx, 
          type: combo.type, 
          count: cards.length, 
          cards: cards.map(c => ({ id: c.id, r: c.r, s: c.s })) 
        });
        room.firstTrick = false;

        // Emit highest card notification if applicable
        if (highestCardInfo) {
          console.log(`Highest card played: ${currentPlayer.name} played ${combo.type}`, highestCardInfo);
          room.players.forEach(player => {
            if (player.socket) {
              player.socket.emit('highestCardPlayed', {
                playerIndex: currentPlayerIdx,
                playerName: currentPlayer.name,
                info: highestCardInfo,
                combo: combo.type
              });
            }
          });
          
          // Start 10-second countdown for auto-pass
          startAutoPassCountdown(room, currentPlayerIdx);
        } else {
          // Cancel any existing countdown if this is not the highest card
          cancelAutoPassCountdown(room);
        }

        // Check for match win
        if (currentPlayer.hand.length === 0) {
          finishMatch(room, currentPlayerIdx);
          return;
        }

        // Advance turn
        const nextIdx = nextAlive(room, currentPlayerIdx);
        room.turn = nextIdx;

        // Check if any player has only 1 card left
        room.players.forEach((p, idx) => {
          if (p.hand.length === 1) {
            console.log(`Warning: ${p.name} has 1 card left!`);
            room.players.forEach(player => {
              if (player.socket) {
                player.socket.emit('playerOneCardLeft', { 
                  playerIndex: idx, 
                  playerName: p.name 
                });
              }
            });
          }
        });

        broadcastState(room);

        // If all others passed, end trick
        if (allOthersPassed(room)) {
          endTrick(room);
          return;
        }
        
        // If next player is also a bot, continue AI turns
        if (room.players[nextIdx].isBot) {
          setTimeout(() => processAITurn(room), 1500);
        }
        
      } catch (error) {
        console.error('Error processing AI play:', error);
      }
      
    } else {
      // AI decided to pass
      if (!room.lastPlay) {
        console.error('AI tried to pass on fresh trick');
        return;
      }
      
      currentPlayer.passed = true;
      
      // If passing makes all others passed -> end trick
      if (allOthersPassed(room)) {
        cancelAutoPassCountdown(room);
        endTrick(room);
      } else {
        room.turn = nextAlive(room, currentPlayerIdx);
        broadcastState(room);
        
        // If next player is also a bot, continue AI turns
        if (room.players[room.turn].isBot) {
          setTimeout(() => processAITurn(room), 1500);
        }
      }
    }
  }

  function handleDisconnect(socket) {
    // Check if in waiting room
    const waitingRoomId = socketToWaitingRoom.get(socket.id);
    if (waitingRoomId) {
      const waitingRoom = waitingRooms.get(waitingRoomId);
      if (waitingRoom) {
        const playerIdx = waitingRoom.players.findIndex(p => p.socket && p.socket.id === socket.id);
        if (playerIdx >= 0) {
          const playerName = waitingRoom.players[playerIdx].name;
          waitingRoom.players.splice(playerIdx, 1);
          socketToWaitingRoom.delete(socket.id);
          socket.leave(waitingRoomId);
          
          // If waiting room is empty, delete it
          if (waitingRoom.players.length === 0) {
            waitingRooms.delete(waitingRoomId);
          } else {
            // Broadcast updated state and system message
            sendWaitingRoomSystemMessage(waitingRoom, `${playerName} left the waiting room`);
            broadcastWaitingRoomState(waitingRoom);
          }
        }
      }
      return;
    }
    
    // Check if in active game room
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }
    const room = rooms.get(roomId);
    if (!room) return;
    
    const idx = room.players.findIndex(p => p.socket && p.socket.id === socket.id);
    if (idx >= 0) {
      const player = room.players[idx];
      
      // Mark player as disconnected instead of ending game
      player.disconnected = true;
      player.disconnectTime = Date.now();
      
      // Store session for reconnection
      const sessionKey = `${player.name}:${roomId}`;
      playerSessions.set(sessionKey, {
        playerIndex: idx,
        roomId: roomId,
        playerName: player.name,
        disconnectTime: player.disconnectTime
      });
      
      // Notify other players
      sendSystemMessage(room, `${player.name} disconnected. They have 60 seconds to reconnect.`);
      
      // Broadcast updated state showing player as disconnected
      broadcastState(room);
      
      // Set timeout to end game if player doesn't reconnect
      const disconnectTimer = setTimeout(() => {
        // Check if player is still disconnected
        const currentRoom = rooms.get(roomId);
        if (currentRoom && currentRoom.players[idx]?.disconnected) {
          // Player didn't reconnect in time - end the game
          currentRoom.finished = true;
          currentRoom.players.forEach(p => {
            if (p.socket && p.socket.connected) {
              p.socket.emit('gameAborted', { 
                reason: `${player.name} disconnected and did not reconnect in time.` 
              });
              socketToRoom.delete(p.socket.id);
              p.socket.leave(roomId);
            }
          });
          
          // Clean up
          rooms.delete(roomId);
          playerSessions.delete(sessionKey);
          
          // Cancel any active countdown
          if (currentRoom.autoPassTimer) {
            clearInterval(currentRoom.autoPassTimer);
          }
        }
      }, 60000); // 60 second timeout
      
      // Store the timer reference
      if (!room.disconnectTimers) {
        room.disconnectTimers = {};
      }
      room.disconnectTimers[idx] = disconnectTimer;
      
      // Remove socket mapping (but keep room intact)
      socketToRoom.delete(socket.id);
    }
  }

  function broadcastState(room) {
    for (let i=0;i<4;i++) {
      const p = room.players[i];
      if (p.socket) { // Only broadcast to human players
        const payload = roomStateFor(room, i);
        p.socket.emit('state', payload);
      }
    }
  }

  function broadcastGameOver(room, summary) {
    for (let i=0;i<4;i++) {
      const p = room.players[i];
      if (p.socket) { // Only broadcast to human players
        p.socket.emit('gameOver', summary);
      }
    }
    // cleanup
    const roomId = room.id;
    room.players.forEach(p => {
      if (p.socket) {
        socketToRoom.delete(p.socket.id);
      }
    });
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
      disconnected: room.players.map(p=>!!p.disconnected),
      isBot: room.players.map(p=>!!p.isBot), // Add bot status
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
    // Cancel any active countdown
    cancelAutoPassCountdown(room);
    
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
    room.lastPlayType = null;
    room.enforce3D = !!enforce3D;
    room.playedCards = new Set(); // Reset played cards for new match

    // Broadcast fresh state and a start event for the match
    broadcastState(room);
    room.players.forEach((p, idx) => {
      if (p.socket) {
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
      }
    });
    
    // If the starting player is a bot, trigger AI turn
    if (room.players[room.turn].isBot) {
      setTimeout(() => processAITurn(room), 1000);
    }
  }

  function penaltyPoints(cardsLeft) {
    if (cardsLeft <= 0) return 0;
    if (cardsLeft <= 4) return cardsLeft;
    if (cardsLeft <= 9) return cardsLeft * 2;
    return cardsLeft * 3; // 10 to 13
  }

  function finishMatch(room, winnerIdx) {
    // Cancel any active countdown
    cancelAutoPassCountdown(room);
    
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
      if (ps.socket) { // Only emit to human players
        ps.socket.emit('matchEnded', {
          winner: winnerIdx,
          pointsAdded,
          scores: room.scores,
          handsLeft,
          matchNumber: room.matchNumber
        });
      }
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

  function handleChatMessage(socket, message) {
    // Check if in waiting room first
    const waitingRoomId = socketToWaitingRoom.get(socket.id);
    if (waitingRoomId) {
      const waitingRoom = waitingRooms.get(waitingRoomId);
      if (waitingRoom) {
        handleWaitingRoomChatMessage(socket, waitingRoom, message);
      }
      return;
    }
    
    // Handle active game room chat
    const room = getRoomBySocket(socket);
    if (!room || room.finished) {
      socket.emit('errorMessage', 'Not in an active game');
      return;
    }
    
    const meIdx = room.players.findIndex(p => p.socket && p.socket.id === socket.id);
    if (meIdx === -1) {
      socket.emit('errorMessage', 'Player not found');
      return;
    }

    // Validate message
    if (typeof message !== 'string') {
      socket.emit('errorMessage', 'Invalid message format');
      return;
    }

    const sanitizedMessage = message.toString().trim();
    
    if (!sanitizedMessage) {
      socket.emit('errorMessage', 'Message cannot be empty');
      return;
    }

    if (sanitizedMessage.length > 200) {
      socket.emit('errorMessage', 'Message too long (max 200 characters)');
      return;
    }

    // Rate limiting: check last message timestamp
    const now = Date.now();
    if (!room.lastChatTimestamps) {
      room.lastChatTimestamps = {};
    }
    const lastMessageTime = room.lastChatTimestamps[socket.id] || 0;
    const timeSinceLastMessage = now - lastMessageTime;
    
    if (timeSinceLastMessage < 500) { // 500ms cooldown
      socket.emit('errorMessage', 'Please wait before sending another message');
      return;
    }
    
    room.lastChatTimestamps[socket.id] = now;

    const me = room.players[meIdx];
    const chatMessage = {
      id: randomUUID(),
      playerIndex: meIdx,
      playerName: me.name,
      message: sanitizedMessage,
      timestamp: now,
      type: 'player' // 'player' or 'system'
    };

    // Initialize chat history if not exists
    if (!room.chatHistory) {
      room.chatHistory = [];
    }
    
    // Store message in room history (keep last 100 messages)
    room.chatHistory.push(chatMessage);
    if (room.chatHistory.length > 100) {
      room.chatHistory.shift();
    }

    // Broadcast chat message to all players in the room
    room.players.forEach(player => {
      player.socket.emit('chatMessage', chatMessage);
    });
  }

  function handleWaitingRoomChatMessage(socket, waitingRoom, message) {
    const meIdx = waitingRoom.players.findIndex(p => p.socket.id === socket.id);
    if (meIdx === -1) {
      socket.emit('errorMessage', 'Player not found');
      return;
    }

    // Validate message
    if (typeof message !== 'string') {
      socket.emit('errorMessage', 'Invalid message format');
      return;
    }

    const sanitizedMessage = message.toString().trim();
    
    if (!sanitizedMessage) {
      socket.emit('errorMessage', 'Message cannot be empty');
      return;
    }

    if (sanitizedMessage.length > 200) {
      socket.emit('errorMessage', 'Message too long (max 200 characters)');
      return;
    }

    // Rate limiting
    const now = Date.now();
    if (!waitingRoom.lastChatTimestamps) {
      waitingRoom.lastChatTimestamps = {};
    }
    const lastMessageTime = waitingRoom.lastChatTimestamps[socket.id] || 0;
    const timeSinceLastMessage = now - lastMessageTime;
    
    if (timeSinceLastMessage < 500) { // 500ms cooldown
      socket.emit('errorMessage', 'Please wait before sending another message');
      return;
    }
    
    waitingRoom.lastChatTimestamps[socket.id] = now;

    const me = waitingRoom.players[meIdx];
    const chatMessage = {
      id: randomUUID(),
      playerIndex: meIdx,
      playerName: me.name,
      message: sanitizedMessage,
      timestamp: now,
      type: 'player'
    };

    // Store message in waiting room history
    waitingRoom.chatHistory.push(chatMessage);
    if (waitingRoom.chatHistory.length > 100) {
      waitingRoom.chatHistory.shift();
    }

    // Broadcast to all players in waiting room
    waitingRoom.players.forEach(player => {
      if (player.socket) { // Only emit to players with sockets (not bots)
        player.socket.emit('chatMessage', chatMessage);
      }
    });
  }

  function sendWaitingRoomSystemMessage(waitingRoom, message) {
    const systemMessage = {
      id: randomUUID(),
      playerIndex: -1,
      playerName: 'System',
      message,
      timestamp: Date.now(),
      type: 'system'
    };

    waitingRoom.chatHistory.push(systemMessage);
    if (waitingRoom.chatHistory.length > 100) {
      waitingRoom.chatHistory.shift();
    }

    waitingRoom.players.forEach(player => {
      if (player.socket) { // Only emit to players with sockets (not bots)
        player.socket.emit('chatMessage', systemMessage);
      }
    });
  }

  // Helper function to send system messages
  function sendSystemMessage(room, message) {
    const systemMessage = {
      id: randomUUID(),
      playerIndex: -1,
      playerName: 'System',
      message,
      timestamp: Date.now(),
      type: 'system'
    };

    if (!room.chatHistory) {
      room.chatHistory = [];
    }
    
    room.chatHistory.push(systemMessage);
    if (room.chatHistory.length > 100) {
      room.chatHistory.shift();
    }

    room.players.forEach(player => {
      if (player.socket) {
        player.socket.emit('chatMessage', systemMessage);
      }
    });
  }

  // Handle typing indicator
  function handleTyping(socket, isTyping) {
    // Check if in waiting room first
    const waitingRoomId = socketToWaitingRoom.get(socket.id);
    if (waitingRoomId) {
      const waitingRoom = waitingRooms.get(waitingRoomId);
      if (waitingRoom) {
        const meIdx = waitingRoom.players.findIndex(p => p.socket.id === socket.id);
        if (meIdx === -1) return;

        const me = waitingRoom.players[meIdx];
        
        // Broadcast typing status to all other players
        waitingRoom.players.forEach((player, idx) => {
          if (idx !== meIdx && player.socket) {
            player.socket.emit('playerTyping', {
              playerIndex: meIdx,
              playerName: me.name,
              isTyping
            });
          }
        });
      }
      return;
    }
    
    // Handle active game room typing
    const room = getRoomBySocket(socket);
    if (!room || room.finished) return;
    
    const meIdx = room.players.findIndex(p => p.socket && p.socket.id === socket.id);
    if (meIdx === -1) return;

    const me = room.players[meIdx];
    
    // Broadcast typing status to all other players
    room.players.forEach((player, idx) => {
      if (idx !== meIdx && player.socket) {
        player.socket.emit('playerTyping', {
          playerIndex: meIdx,
          playerName: me.name,
          isTyping
        });
      }
    });
  }

  function handleLeaveWaitingRoom(socket) {
    const waitingRoomId = socketToWaitingRoom.get(socket.id);
    if (!waitingRoomId) {
      socket.emit('errorMessage', 'Not in a waiting room');
      return;
    }
    
    const waitingRoom = waitingRooms.get(waitingRoomId);
    if (!waitingRoom) {
      socket.emit('errorMessage', 'Waiting room not found');
      return;
    }
    
    const playerIdx = waitingRoom.players.findIndex(p => p.socket.id === socket.id);
    if (playerIdx >= 0) {
      const playerName = waitingRoom.players[playerIdx].name;
      waitingRoom.players.splice(playerIdx, 1);
      socketToWaitingRoom.delete(socket.id);
      socket.leave(waitingRoomId);
      
      // Notify player they left
      socket.emit('leftWaitingRoom');
      
      // If waiting room is empty, delete it
      if (waitingRoom.players.length === 0) {
        waitingRooms.delete(waitingRoomId);
      } else {
        // Broadcast updated state and system message
        sendWaitingRoomSystemMessage(waitingRoom, `${playerName} left the waiting room`);
        broadcastWaitingRoomState(waitingRoom);
      }
    }
  }

  function handleReconnect(socket, name) {
    if (!name) {
      socket.emit('errorMessage', 'Name required for reconnection');
      return;
    }
    
    const playerName = name.toString().trim();
    
    // Search for a session with this player name
    let foundSession = null;
    let sessionKey = null;
    
    for (const [key, session] of playerSessions.entries()) {
      if (session.playerName === playerName) {
        // Check if session is still valid (within 60 seconds)
        const timeSinceDisconnect = Date.now() - session.disconnectTime;
        if (timeSinceDisconnect < 60000) {
          foundSession = session;
          sessionKey = key;
          break;
        } else {
          // Session expired, clean it up
          playerSessions.delete(key);
        }
      }
    }
    
    if (!foundSession) {
      socket.emit('errorMessage', 'No active game found to reconnect to');
      return;
    }
    
    const room = rooms.get(foundSession.roomId);
    if (!room || room.finished) {
      socket.emit('errorMessage', 'Game has ended');
      playerSessions.delete(sessionKey);
      return;
    }
    
    const playerIdx = foundSession.playerIndex;
    const player = room.players[playerIdx];
    
    if (!player.disconnected) {
      socket.emit('errorMessage', 'Player slot already occupied');
      return;
    }
    
    // Clear the disconnect timer
    if (room.disconnectTimers && room.disconnectTimers[playerIdx]) {
      clearTimeout(room.disconnectTimers[playerIdx]);
      delete room.disconnectTimers[playerIdx];
    }
    
    // Reconnect the player
    player.socket = socket;
    player.id = socket.id;
    player.disconnected = false;
    player.disconnectTime = null;
    
    // Update socket data and mappings
    socket.data.name = playerName;
    socketToRoom.set(socket.id, foundSession.roomId);
    socket.join(foundSession.roomId);
    
    // Clean up session
    playerSessions.delete(sessionKey);
    
    // Notify player of successful reconnection
    socket.emit('reconnected', {
      message: 'Successfully reconnected to the game',
      roomId: foundSession.roomId,
      playerIndex: playerIdx
    });
    
    // Send chat history
    if (room.chatHistory) {
      room.chatHistory.forEach(msg => {
        socket.emit('chatMessage', msg);
      });
    }
    
    // Notify other players
    sendSystemMessage(room, `${playerName} reconnected!`);
    
    // Send current game state to reconnected player
    broadcastState(room);
  }

  return { 
    enqueuePlayer, 
    handlePlay, 
    handlePass, 
    handleDisconnect, 
    handleChatMessage, 
    handleTyping,
    handleLeaveWaitingRoom,
    handleReconnect,
    startGameWithBots
  };
}
