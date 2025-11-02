import React, { useEffect, useMemo, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

type Card = { id: string; r: string; s: string };

type WaitingRoomState = {
  roomId: string;
  players: Array<{ id: string; name: string; isBot?: boolean }>;
  playersNeeded: number;
  isReady: boolean;
  isCreator?: boolean;
};

type GameState = {
  roomId: string;
  you: number;
  names: string[];
  hand: Card[];
  counts: number[];
  passed: boolean[];
  disconnected: boolean[]; // Add disconnected status
  isBot?: boolean[]; // Add bot status
  lastPlay: { by: number; type: string; count: number; cards: Card[] } | null;
  history: Array<{ by: number; type: string; count: number; cards: Card[] }>;
  scores: number[];
  matchNumber: number;
  turn: number;
  leader: number;
  finished: boolean;
};

type ChatMessage = {
  id?: string;
  playerIndex: number;
  playerName: string;
  message: string;
  timestamp: number;
  type?: 'player' | 'system';
};

export default function App() {
  const [name, setName] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [queuedPos, setQueuedPos] = useState<number | null>(null);
  const [waitingRoom, setWaitingRoom] = useState<WaitingRoomState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [playersWithOneCard, setPlayersWithOneCard] = useState<Set<number>>(new Set());
  const [highestCardWarnings, setHighestCardWarnings] = useState<string[]>([]);
  const [autoPassCountdown, setAutoPassCountdown] = useState<number>(0);
  const [autoPassExemptPlayer, setAutoPassExemptPlayer] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isChatMinimized, setIsChatMinimized] = useState<boolean>(false);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [reconnectMessage, setReconnectMessage] = useState<string>('');
  const warningTimeoutRef = useRef<number | null>(null);
  const playersWithOneCardRef = useRef<Set<number>>(new Set());
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const playerNameRef = useRef<string>(''); // Store player name for reconnection

  // Sync state to ref
  useEffect(() => {
    playersWithOneCardRef.current = playersWithOneCard;
  }, [playersWithOneCard]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Clear unread messages when chat is visible
  useEffect(() => {
    if (!isChatMinimized) {
      setUnreadMessages(0);
    }
  }, [isChatMinimized, chatMessages]);

  useEffect(() => {
    const s = io('/', { transports: ['websocket', 'polling'] });
    setSocket(s);
    
    // Handle socket disconnection
    s.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      if (state && playerNameRef.current) {
        setIsReconnecting(true);
        setReconnectMessage('Connection lost. Attempting to reconnect...');
      }
    });
    
    // Handle socket reconnection
    s.on('connect', () => {
      console.log('Connected to server');
      // If we were in a game and got disconnected, try to rejoin
      if (isReconnecting && playerNameRef.current) {
        console.log('Attempting to reconnect as:', playerNameRef.current);
        s.emit('reconnect', { name: playerNameRef.current });
      }
    });
    
    // Handle successful reconnection from server
    s.on('reconnected', (data: { message: string; roomId: string; playerIndex: number }) => {
      console.log('Successfully reconnected:', data);
      setIsReconnecting(false);
      setReconnectMessage('');
      setMessage('Reconnected successfully!');
      setTimeout(() => setMessage(''), 3000);
    });
    
    s.on('queued', (p: { position: number }) => setQueuedPos(p.position));
    s.on('waitingRoomState', (wr: WaitingRoomState) => {
      console.log('Received waiting room state:', wr);
      setWaitingRoom(wr);
      setQueuedPos(null);
    });
    s.on('leftWaitingRoom', () => {
      setWaitingRoom(null);
      setChatMessages([]);
      setTypingUsers(new Set());
    });
    s.on('gameStarted', (p: { matchNumber?: number; leader?: number }) => {
      setQueuedPos(null);
      setWaitingRoom(null);
      setIsReconnecting(false); // Clear reconnecting state when new game starts
      if (typeof p?.matchNumber === 'number') {
        setMessage(`Match ${p.matchNumber} started`);
      }
      // Clear warnings when new match starts
      setWarnings([]);
      setPlayersWithOneCard(new Set());
      setHighestCardWarnings([]);
    });
    s.on('state', (st: GameState) => {
      setState(st);
      // Clear warnings for players who no longer have exactly 1 card
      const newPlayersWithOneCard = new Set<number>();
      playersWithOneCardRef.current.forEach(playerIdx => {
        if (st.counts[playerIdx] === 1) {
          newPlayersWithOneCard.add(playerIdx);
        }
      });
      if (newPlayersWithOneCard.size !== playersWithOneCardRef.current.size) {
        setPlayersWithOneCard(newPlayersWithOneCard);
        // Update warnings array
        const newWarnings: string[] = [];
        newPlayersWithOneCard.forEach(idx => {
          newWarnings.push(`⚠️ ${st.names[idx]} has only 1 card left!`);
        });
        setWarnings(newWarnings);
      }
    });
    s.on('matchEnded', (p: { winner: number; pointsAdded: number[]; scores: number[]; matchNumber: number }) => {
      const nm = state?.names?.[p.winner] ?? `Player ${p.winner+1}`;
      const scoreboard = (state?.names || []).map((n, i) => `${n}:${p.scores?.[i] ?? 0}`).join(' | ');
      setMessage(`Match ${p.matchNumber} winner: ${nm}. Scores -> ${scoreboard}`);
      // Clear warnings when match ends
      setWarnings([]);
      setPlayersWithOneCard(new Set());
      setHighestCardWarnings([]);
    });
    s.on('gameOver', (p: { scores: number[]; busted: number[]; champion: number }) => {
      const names = state?.names || [];
      const champName = names[p.champion] ?? `Player ${p.champion+1}`;
      setMessage(`Game over. Champion: ${champName}. Final scores: ${names.map((n,i)=>`${n}:${p.scores[i]}`).join(' | ')}`);
    });
    s.on('gameAborted', (p: { reason: string }) => setMessage(p.reason));
    s.on('playRejected', (p: { error: string }) => setMessage(p.error));
    s.on('errorMessage', (msg: string) => {
      setMessage(typeof msg === 'string' ? msg : 'Error');
      // If we're trying to reconnect and get an error, clear the reconnecting state
      if (isReconnecting) {
        setIsReconnecting(false);
        setReconnectMessage('');
      }
    });
    s.on('playerOneCardLeft', (p: { playerIndex: number; playerName: string }) => {
      console.log('Received playerOneCardLeft event:', p);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      
      // Add this player to the set
      setPlayersWithOneCard(prev => {
        const newSet = new Set(prev);
        newSet.add(p.playerIndex);
        return newSet;
      });
      
      // Add warning to the array
      setWarnings(prev => {
        const newWarning = `⚠️ ${p.playerName} has only 1 card left!`;
        if (!prev.includes(newWarning)) {
          return [...prev, newWarning];
        }
        return prev;
      });
    });
    s.on('highestCardPlayed', (p: { playerIndex: number; playerName: string; info: any; combo: string }) => {
      console.log('Received highestCardPlayed event:', p);
      // Format the message based on combo type
      let cardDescription = '';
      if (p.info.type === 'single') {
        const suitSymbol = suitEmoji(p.info.suit);
        cardDescription = `${p.info.rank}${suitSymbol}`;
      } else if (p.info.type === 'pair') {
        const suitSymbols = p.info.suits.map((s: string) => suitEmoji(s)).join('');
        cardDescription = `${p.info.rank}${suitSymbols}`;
      } else if (p.info.type === 'triple') {
        cardDescription = `three ${p.info.rank}s`;
      }
      const newWarning = `🔥 ${p.playerName} played the highest ${p.combo}: ${cardDescription}!`;
      // Always show only the latest highest card warning
      setHighestCardWarnings([newWarning]);
    });
    s.on('autoPassCountdown', (p: { countdown: number; exemptPlayer: number | null }) => {
      console.log('Received autoPassCountdown event:', p);
      setAutoPassCountdown(p.countdown);
      setAutoPassExemptPlayer(p.exemptPlayer);
      
      // Clear highest card warnings when countdown ends (reaches 0)
      if (p.countdown === 0) {
        setHighestCardWarnings([]);
      }
    });
    s.on('chatMessage', (msg: ChatMessage) => {
      console.log('Received chat message:', msg);
      setChatMessages(prev => [...prev, msg]);
      // Increment unread count if chat is minimized
      setIsChatMinimized(minimized => {
        if (minimized) {
          setUnreadMessages(count => count + 1);
        }
        return minimized;
      });
    });
    s.on('playerTyping', (p: { playerIndex: number; playerName: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (p.isTyping) {
          newSet.add(p.playerName);
        } else {
          newSet.delete(p.playerName);
        }
        return newSet;
      });
    });
    return () => { 
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      s.disconnect(); 
    };
  }, []);

  const joined = useMemo(() => !!queuedPos || !!state || !!waitingRoom, [queuedPos, state, waitingRoom]);

  function join() {
    if (!socket) return;
    if (!name.trim()) { setMessage('Please enter a name'); return; }
    playerNameRef.current = name.trim(); // Store name for reconnection
    socket.emit('join', { name: name.trim() });
  }

  function rejoin() {
    if (!socket) return;
    if (!name.trim()) { setMessage('Please enter a name'); return; }
    playerNameRef.current = name.trim(); // Store name for reconnection
    setIsReconnecting(true);
    setReconnectMessage('Attempting to rejoin your game...');
    socket.emit('reconnect', { name: name.trim() });
  }

  function leaveWaitingRoom() {
    if (!socket) return;
    socket.emit('leaveWaitingRoom');
  }

  function startGameWithBots() {
    if (!socket) return;
    socket.emit('startGameWithBots');
  }

  function toggleCard(id: string) {
    setSelected((prev: Record<string, boolean>) => ({ ...prev, [id]: !prev[id] }));
  }

  function play() {
    if (!socket || !state) return;
    const cardIds = Object.keys(selected).filter(k => selected[k]);
    if (cardIds.length === 0) { setMessage('Select cards to play'); return; }
    setMessage('');
    socket.emit('play', cardIds);
    setSelected({});
  }

  function pass() {
    if (!socket || !state) return;
    setMessage('');
    socket.emit('pass');
  }

  function sendChatMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!socket || !chatInput.trim()) return;
    
    // Stop typing indicator
    if (isTyping) {
      socket.emit('typing', false);
      setIsTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
    
    socket.emit('chatMessage', chatInput.trim());
    setChatInput('');
  }

  function handleChatInputChange(value: string) {
    setChatInput(value);
    
    if (!socket) return;
    
    // Send typing indicator
    if (value.trim() && !isTyping) {
      socket.emit('typing', true);
      setIsTyping(true);
    }
    
    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 2 seconds of no input
    if (value.trim()) {
      typingTimeoutRef.current = window.setTimeout(() => {
        if (socket && isTyping) {
          socket.emit('typing', false);
          setIsTyping(false);
        }
      }, 2000);
    } else if (isTyping) {
      socket.emit('typing', false);
      setIsTyping(false);
    }
  }

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function toggleChatMinimize() {
    setIsChatMinimized(prev => {
      const newValue = !prev;
      // Clear unread messages when expanding chat
      if (!newValue) {
        setUnreadMessages(0);
      }
      return newValue;
    });
  }

  if (!joined) {
    return (
      <div style={styles.container}>
        <h1>Big Two</h1>
        <div style={styles.card}>
          <label>
            Your name
            <input 
              style={styles.input} 
              value={name} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setName(e.target.value)} 
              placeholder="e.g., Alex"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  join();
                }
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'center' }}>
            <button 
              style={{
                ...styles.button,
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: '600',
                cursor: 'pointer',
                padding: '12px 24px',
                fontSize: 16
              }} 
              onClick={join}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
            >
              Join New Game
            </button>
            <button 
              style={{
                ...styles.button,
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: '600',
                cursor: 'pointer',
                padding: '12px 24px',
                fontSize: 16
              }} 
              onClick={rejoin}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
            >
              Rejoin Game
            </button>
          </div>
          <p style={{ fontSize: '0.875em', color: '#9ca3af', marginTop: 16, maxWidth: 400 }}>
            Use "Join New Game" to start fresh, or "Rejoin Game" to reconnect to a game you were disconnected from (using the same name).
          </p>
        </div>
      </div>
    );
  }

  if (!state) {
    // Show waiting room if available
    if (waitingRoom) {
      return (
        <div style={styles.container}>
          <h1>Big Two - Waiting Room</h1>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="panel" style={{ ...styles.panel, marginBottom: 20 }}>
              <h2>Waiting for Players</h2>
              <p style={{ fontSize: '1.2em', color: '#2563eb', fontWeight: 'bold', margin: '16px 0' }}>
                {waitingRoom.playersNeeded > 0 
                  ? `Waiting for ${waitingRoom.playersNeeded} more player${waitingRoom.playersNeeded !== 1 ? 's' : ''}...`
                  : 'Starting game...'}
              </p>
              <div style={{ marginTop: 16 }}>
                <h3>Players in Room ({waitingRoom.players.length}/4)</h3>
                <ul style={{ textAlign: 'left', maxWidth: 300, margin: '12px auto', listStyle: 'none', padding: 0 }}>
                  {waitingRoom.players.map((player, idx) => (
                    <li key={player.id} style={{ 
                      padding: '8px 12px', 
                      margin: '4px 0', 
                      backgroundColor: player.isBot ? '#fef3c7' : '#f3f4f6',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <span style={{ 
                        width: 24, 
                        height: 24, 
                        borderRadius: '50%', 
                        backgroundColor: player.isBot ? '#f59e0b' : '#3b82f6',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.875em'
                      }}>
                        {player.isBot ? '🤖' : idx + 1}
                      </span>
                      <span style={{ fontWeight: '500' }}>{player.name}</span>
                      {player.isBot && <span style={{ color: '#92400e', fontSize: '0.75em', marginLeft: 'auto' }}>(AI)</span>}
                    </li>
                  ))}
                  {[...Array(4 - waitingRoom.players.length)].map((_, idx) => (
                    <li key={`empty-${idx}`} style={{ 
                      padding: '8px 12px', 
                      margin: '4px 0', 
                      backgroundColor: '#f9fafb',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      border: '2px dashed #d1d5db'
                    }}>
                      <span style={{ 
                        width: 24, 
                        height: 24, 
                        borderRadius: '50%', 
                        backgroundColor: '#e5e7eb',
                        color: '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.875em'
                      }}>
                        {waitingRoom.players.length + idx + 1}
                      </span>
                      <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Waiting...</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Show "Start with Bots" button if creator and not enough players */}
              {waitingRoom.isCreator && waitingRoom.playersNeeded > 0 && (
                <button 
                  style={{ 
                    ...styles.button, 
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginTop: 20,
                    marginRight: 10
                  }}
                  onClick={startGameWithBots}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d97706'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f59e0b'}
                >
                  Start Game with AI Bots
                </button>
              )}
              
              <button 
                style={{ 
                  ...styles.button, 
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginTop: 20
                }}
                onClick={leaveWaitingRoom}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              >
                Leave Waiting Room
              </button>
            </div>
            
            {/* Chat Room in Waiting Room */}
            <div className="panel" style={{ ...styles.panel, maxWidth: 600, margin: '0 auto' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: isChatMinimized ? 0 : 8
              }}>
                <h3 style={{ margin: 0 }}>Chat</h3>
                <button
                  onClick={toggleChatMinimize}
                  style={{
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '0.875em',
                    color: '#6b7280',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#9ca3af';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  title={isChatMinimized ? 'Expand chat' : 'Minimize chat'}
                >
                  {isChatMinimized ? '▲' : '▼'}
                </button>
              </div>
              
              {!isChatMinimized && (
                <>
                  <div style={{ 
                    height: 300, 
                    overflowY: 'auto', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: 4, 
                    padding: 8,
                    marginBottom: 8,
                    backgroundColor: '#f9fafb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    {chatMessages.length === 0 ? (
                      <p style={{ color: '#9ca3af', fontSize: '0.875em', textAlign: 'center', margin: 'auto' }}>No messages yet</p>
                    ) : (
                      chatMessages.map((msg, idx) => {
                        const isSystem = msg.type === 'system';
                        
                        return (
                          <div key={msg.id || idx} style={{ 
                            padding: '8px 10px', 
                            backgroundColor: isSystem ? '#fef3c7' : '#fff',
                            borderRadius: 6,
                            fontSize: '0.875em',
                            wordBreak: 'break-word',
                            borderLeft: isSystem ? '3px solid #f59e0b' : '3px solid #e5e7eb',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                              <span style={{ 
                                fontWeight: 'bold', 
                                color: isSystem ? '#92400e' : '#374151',
                                fontSize: '0.85em'
                              }}>
                                {isSystem ? '🔔 ' : ''}{msg.playerName}
                              </span>
                              <span style={{ 
                                fontSize: '0.75em', 
                                color: '#9ca3af',
                                marginLeft: 8
                              }}>
                                {formatTimestamp(msg.timestamp)}
                              </span>
                            </div>
                            <span style={{ color: '#1f2937', lineHeight: '1.4' }}>{msg.message}</span>
                          </div>
                        );
                      })
                    )}
                    {typingUsers.size > 0 && (
                      <div style={{ 
                        padding: '4px 8px', 
                        fontSize: '0.75em',
                        color: '#6b7280',
                        fontStyle: 'italic',
                        animation: 'pulse-text 1.5s ease-in-out infinite'
                      }}>
                        {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={sendChatMessage} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => handleChatInputChange(e.target.value)}
                        placeholder="Type a message..."
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '0.875em',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          outline: 'none',
                          transition: 'border-color 0.2s'
                        }}
                        maxLength={200}
                        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                        onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim()}
                        style={{
                          padding: '8px 16px',
                          fontSize: '0.875em',
                          backgroundColor: chatInput.trim() ? '#3b82f6' : '#9ca3af',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                          fontWeight: '600',
                          transition: 'background-color 0.2s',
                          boxShadow: chatInput.trim() ? '0 1px 3px rgba(59, 130, 246, 0.3)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (chatInput.trim()) {
                            e.currentTarget.style.backgroundColor = '#2563eb';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (chatInput.trim()) {
                            e.currentTarget.style.backgroundColor = '#3b82f6';
                          }
                        }}
                      >
                        Send
                      </button>
                    </div>
                    <div style={{ fontSize: '0.7em', color: '#9ca3af', textAlign: 'right' }}>
                      {chatInput.length}/200
                    </div>
                  </form>
                </>
              )}
              
              {isChatMinimized && chatMessages.length > 0 && (
                <div style={{ 
                  fontSize: '0.75em', 
                  color: '#6b7280', 
                  marginTop: 8,
                  textAlign: 'center'
                }}>
                  <span style={{
                    ...(unreadMessages > 0 ? {
                      animation: 'glow-pulse 2s ease-in-out infinite',
                      fontWeight: 'bold',
                      display: 'inline-block'
                    } : {})
                  }}>
                    {chatMessages.length} message{chatMessages.length !== 1 ? 's' : ''}
                  </span>
                  {typingUsers.size > 0 && (
                    <span style={{ 
                      display: 'block', 
                      marginTop: 4,
                      fontStyle: 'italic',
                      color: '#3b82f6'
                    }}>
                      💬 New activity
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
    
    // Show queue position if still waiting
    return (
      <div style={styles.container}>
        <h2>Waiting for players…</h2>
        {queuedPos && <p>Queue position: {queuedPos}</p>}
      </div>
    );
  }

  const yourTurn = state.turn === state.you;

  return (
    <div style={styles.container}>
      {/* Reconnection overlay */}
      {isReconnecting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: 32,
            borderRadius: 12,
            textAlign: 'center',
            maxWidth: 400,
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3)'
          }}>
            <h2 style={{ color: '#dc2626', marginBottom: 16 }}>🔌 Connection Lost</h2>
            <p style={{ fontSize: '1.1em', marginBottom: 24 }}>{reconnectMessage}</p>
            <div style={{
              width: 48,
              height: 48,
              margin: '0 auto',
              border: '4px solid #f3f4f6',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          </div>
        </div>
      )}
      
      <h1>Big Two</h1>
      
      {/* Notifications section */}
      {message && <p className="message">{message}</p>}
      
      {/* Combined highest card + auto-pass countdown */}
      {autoPassCountdown > 0 && autoPassExemptPlayer !== null && highestCardWarnings.length > 0 && (
        <div style={{ 
          marginBottom: 16, 
          padding: '16px', 
          backgroundColor: '#fef2f2', 
          borderRadius: 8, 
          border: '3px solid #dc2626',
          textAlign: 'center',
          boxShadow: '0 4px 6px rgba(220, 38, 38, 0.3)'
        }}>
          <p style={{ 
            fontSize: '1.3em', 
            fontWeight: 'bold', 
            color: '#dc2626',
            margin: '0 0 8px 0' 
          }}>
            {highestCardWarnings[0]}
          </p>
          <p style={{ 
            fontSize: '1.8em', 
            fontWeight: 'bold', 
            color: '#dc2626',
            margin: '8px 0',
            animation: 'pulse-text 1s ease-in-out infinite'
          }}>
            ⏱️ Auto-Pass in {autoPassCountdown}s
          </p>
          <p style={{ 
            fontSize: '0.95em', 
            color: '#991b1b',
            margin: '8px 0 0 0' 
          }}>
            {state && autoPassExemptPlayer === state.you 
              ? 'Other players will automatically pass unless they play.' 
              : 'You will auto-pass unless you play a card!'}
          </p>
        </div>
      )}
      
      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {warnings.map((warn, idx) => (
            <p key={idx} className="warning" style={{ color: '#d97706', fontWeight: 'bold', fontSize: '1.1em', padding: '8px', backgroundColor: '#fef3c7', borderRadius: 4, margin: '4px 0' }}>{warn}</p>
          ))}
        </div>
      )}

      {/* Play History */}
      <div className="panel" style={{ ...styles.panel, margin: '12px auto', maxWidth: 820 }}>
        <h3>Play history</h3>
        {state.history && state.history.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {state.history.slice(-3).map((h, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 140 }}>
                  <strong>{state.names[h.by]}</strong>: {h.type} ({h.count})
                </div>
                <div className="cards-row">
                  {h.cards.map(c => (
                    <CardImage key={c.id} id={c.id} alt={`${c.r}${c.s}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No plays yet.</p>
        )}
      </div>

      {/* Scores, Players, Current trick in a row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div className="panel" style={styles.panel}>
          <h3>Scores {typeof state.matchNumber === 'number' ? `(Match ${state.matchNumber})` : ''}</h3>
          <ul>
            {state.names.map((n, i) => (
              <li key={i} style={{ fontWeight: i === state.you ? 'bold' as const : 'normal' }}>
                {i === state.you ? '(You) ' : ''}{n}: {state.scores?.[i] ?? 0}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel" style={{
          ...styles.panel,
          ...(playersWithOneCard.size > 0 ? {
            border: '2px solid #dc2626',
            animation: 'pulse-border 1.5s ease-in-out infinite'
          } : {})
        }}>
          <h3>Players</h3>
          <ul>
            {state.names.map((n, i) => (
              <li key={i} style={{ fontWeight: i === state.turn ? 'bold' as const : 'normal' }}>
                {i === state.you ? '(You) ' : ''}{n}
                {state.isBot && state.isBot[i] && <span style={{ color: '#f59e0b', marginLeft: 4 }}>🤖</span>}
                {' '}— cards: {state.counts[i]} {state.passed[i] ? ' (passed)' : ''}
                {state.disconnected && state.disconnected[i] && (
                  <span style={{ 
                    color: '#dc2626', 
                    fontWeight: 'bold', 
                    marginLeft: 8,
                    animation: 'pulse-text 1.5s ease-in-out infinite'
                  }}>
                    🔌 DISCONNECTED
                  </span>
                )}
                {playersWithOneCard.has(i) && (
                  <span style={{ 
                    color: '#dc2626', 
                    fontWeight: 'bold', 
                    marginLeft: 8,
                    animation: 'pulse-text 1.5s ease-in-out infinite'
                  }}>
                    ⚠️ 1 CARD!
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel" style={styles.panel}>
          <h3>Current trick</h3>
          {state.lastPlay ? (
            <div>
              <div>Last by <strong>{state.names[state.lastPlay.by]}</strong>: {state.lastPlay.type} of {state.lastPlay.count}</div>
              <div className="cards-row" style={{ marginTop: 6 }}>
                {state.lastPlay.cards.map(c => (
                  <CardImage key={c.id} id={c.id} alt={`${c.r}${c.s}`} />
                ))}
              </div>
            </div>
          ) : (
            <p>No active trick. {state.leader === state.you ? 'You lead.' : `${state.names[state.leader]} leads.`}</p>
          )}
        </div>
        
        {/* Chat Room */}
        <div className="panel" style={{ 
          ...styles.panel, 
          minWidth: isChatMinimized ? 200 : 320, 
          maxWidth: isChatMinimized ? 200 : 320,
          transition: 'all 0.3s ease'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: isChatMinimized ? 0 : 8
          }}>
            <h3 style={{ margin: 0 }}>Chat</h3>
            <button
              onClick={toggleChatMinimize}
              style={{
                background: 'none',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.875em',
                color: '#6b7280',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
              title={isChatMinimized ? 'Expand chat' : 'Minimize chat'}
            >
              {isChatMinimized ? '▲' : '▼'}
            </button>
          </div>
          
          {!isChatMinimized && (
            <>
              <div style={{ 
                height: 200, 
                overflowY: 'auto', 
                border: '1px solid #e5e7eb', 
                borderRadius: 4, 
                padding: 8,
                marginBottom: 8,
                backgroundColor: '#f9fafb',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                {chatMessages.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: '0.875em', textAlign: 'center', margin: 'auto' }}>No messages yet</p>
                ) : (
                  chatMessages.map((msg, idx) => {
                    const isSystem = msg.type === 'system';
                    const isYou = msg.playerIndex === state.you;
                    
                    return (
                      <div key={msg.id || idx} style={{ 
                        padding: '8px 10px', 
                        backgroundColor: isSystem ? '#fef3c7' : (isYou ? '#dbeafe' : '#fff'),
                        borderRadius: 6,
                        fontSize: '0.875em',
                        wordBreak: 'break-word',
                        borderLeft: isSystem ? '3px solid #f59e0b' : (isYou ? '3px solid #3b82f6' : '3px solid #e5e7eb'),
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                          <span style={{ 
                            fontWeight: 'bold', 
                            color: isSystem ? '#92400e' : (isYou ? '#1e40af' : '#374151'),
                            fontSize: '0.85em'
                          }}>
                            {isSystem ? '🔔 ' : ''}{msg.playerName}{isYou && !isSystem ? ' (You)' : ''}
                          </span>
                          <span style={{ 
                            fontSize: '0.75em', 
                            color: '#9ca3af',
                            marginLeft: 8
                          }}>
                            {formatTimestamp(msg.timestamp)}
                          </span>
                        </div>
                        <span style={{ color: '#1f2937', lineHeight: '1.4' }}>{msg.message}</span>
                      </div>
                    );
                  })
                )}
                {typingUsers.size > 0 && (
                  <div style={{ 
                    padding: '4px 8px', 
                    fontSize: '0.75em',
                    color: '#6b7280',
                    fontStyle: 'italic',
                    animation: 'pulse-text 1.5s ease-in-out infinite'
                  }}>
                    {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendChatMessage} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => handleChatInputChange(e.target.value)}
                    placeholder="Type a message..."
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      fontSize: '0.875em',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    maxLength={200}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.875em',
                      backgroundColor: chatInput.trim() ? '#3b82f6' : '#9ca3af',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                      fontWeight: '600',
                      transition: 'background-color 0.2s',
                      boxShadow: chatInput.trim() ? '0 1px 3px rgba(59, 130, 246, 0.3)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (chatInput.trim()) {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (chatInput.trim()) {
                        e.currentTarget.style.backgroundColor = '#3b82f6';
                      }
                    }}
                  >
                    Send
                  </button>
                </div>
                <div style={{ fontSize: '0.7em', color: '#9ca3af', textAlign: 'right' }}>
                  {chatInput.length}/200
                </div>
              </form>
            </>
          )}
          
          {isChatMinimized && chatMessages.length > 0 && (
            <div style={{ 
              fontSize: '0.75em', 
              color: '#6b7280', 
              marginTop: 8,
              textAlign: 'center'
            }}>
              <span style={{
                ...(unreadMessages > 0 ? {
                  animation: 'glow-pulse 2s ease-in-out infinite',
                  fontWeight: 'bold',
                  display: 'inline-block'
                } : {})
              }}>
                {chatMessages.length} message{chatMessages.length !== 1 ? 's' : ''}
              </span>
              {typingUsers.size > 0 && (
                <span style={{ 
                  display: 'block', 
                  marginTop: 4,
                  fontStyle: 'italic',
                  color: '#3b82f6'
                }}>
                  💬 New activity
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Your Hand */}
      <div style={styles.hand}>
        <h3>Your hand {yourTurn ? '(Your turn)' : ''}</h3>
        <div className="cards-row">
          {state.hand.map(c => {
            const isSel = !!selected[c.id];
            return (
              <button key={c.id} className={`card-btn${isSel ? ' selected' : ''}`} onClick={() => toggleCard(c.id)} title={c.id}>
                <span className="ring" />
                <CardImage id={c.id} alt={`${c.r}${c.s}`} />
              </button>
            );
          })}
        </div>
        <div className="controls" style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="primary" disabled={!yourTurn} onClick={play}>Play</button>
          <button className="secondary" disabled={!yourTurn || !state.lastPlay} onClick={pass}>Pass</button>
        </div>
      </div>
    </div>
  );
}

function suitEmoji(s: string) {
  return s === 'S' ? '♠' : s === 'H' ? '♥' : s === 'C' ? '♣' : '♦';
}

function cardAssetUrl(id: string) {
  const r = id.slice(0, -1);
  const s = id.slice(-1);
  const suit = s === 'S' ? 'spades' : s === 'H' ? 'hearts' : s === 'C' ? 'clubs' : 'diamonds';
  const rank = r === 'A' ? 'ace' : r === 'K' ? 'king' : r === 'Q' ? 'queen' : r === 'J' ? 'jack' : r;
  return `https://www.tekeye.uk/playing_cards/images/svg_playing_cards/fronts/${suit}_${rank}.svg`;
}

function CardImage({ id, alt }: { id: string; alt?: string }) {
  return <img className="card-img" src={cardAssetUrl(id)} alt={alt ?? id} loading="lazy" />;
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 980, margin: '0 auto', padding: 16, textAlign: 'center', fontFamily: 'ui-sans-serif, system-ui, -apple-system' },
  card: { border: '1px solid #ddd', padding: 16, borderRadius: 8, display: 'inline-block' },
  input: { display: 'block', marginTop: 8, padding: 8, fontSize: 16, width: 240 },
  button: { marginTop: 12, padding: '10px 16px', fontSize: 16, cursor: 'pointer' },
  panel: { border: '1px solid #eee', borderRadius: 8, padding: 12, minWidth: 260 },
  hand: { marginTop: 24 },
  cards: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }
};
