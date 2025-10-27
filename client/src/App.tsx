import React, { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Card = { id: string; r: string; s: string };

type GameState = {
  roomId: string;
  you: number;
  names: string[];
  hand: Card[];
  counts: number[];
  passed: boolean[];
  lastPlay: { by: number; type: string; count: number; cards: Card[] } | null;
  history: Array<{ by: number; type: string; count: number; cards: Card[] }>;
  scores: number[];
  matchNumber: number;
  turn: number;
  leader: number;
  finished: boolean;
};

export default function App() {
  const [name, setName] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [queuedPos, setQueuedPos] = useState<number | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const s = io('/', { transports: ['websocket', 'polling'] });
    setSocket(s);
    s.on('queued', (p: { position: number }) => setQueuedPos(p.position));
    s.on('gameStarted', (p: { matchNumber?: number; leader?: number }) => {
      setQueuedPos(null);
      if (typeof p?.matchNumber === 'number') {
        setMessage(`Match ${p.matchNumber} started`);
      }
    });
    s.on('state', (st: GameState) => setState(st));
    s.on('matchEnded', (p: { winner: number; pointsAdded: number[]; scores: number[]; matchNumber: number }) => {
      const nm = state?.names?.[p.winner] ?? `Player ${p.winner+1}`;
      const scoreboard = (state?.names || []).map((n, i) => `${n}:${p.scores?.[i] ?? 0}`).join(' | ');
      setMessage(`Match ${p.matchNumber} winner: ${nm}. Scores -> ${scoreboard}`);
    });
    s.on('gameOver', (p: { scores: number[]; busted: number[]; champion: number }) => {
      const names = state?.names || [];
      const champName = names[p.champion] ?? `Player ${p.champion+1}`;
      setMessage(`Game over. Champion: ${champName}. Final scores: ${names.map((n,i)=>`${n}:${p.scores[i]}`).join(' | ')}`);
    });
    s.on('gameAborted', (p: { reason: string }) => setMessage(p.reason));
    s.on('playRejected', (p: { error: string }) => setMessage(p.error));
    s.on('errorMessage', (msg: string) => setMessage(typeof msg === 'string' ? msg : 'Error'));
    return () => { s.disconnect(); };
  }, []);

  const joined = useMemo(() => !!queuedPos || !!state, [queuedPos, state]);

  function join() {
    if (!socket) return;
    if (!name.trim()) { setMessage('Please enter a name'); return; }
    socket.emit('join', { name: name.trim() });
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

  if (!joined) {
    return (
      <div style={styles.container}>
        <h1>Big Two</h1>
        <div style={styles.card}>
          <label>
            Your name
            <input style={styles.input} value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setName(e.target.value)} placeholder="e.g., Alex" />
          </label>
          <button style={styles.button} onClick={join}>Join</button>
        </div>
      </div>
    );
  }

  if (!state) {
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
      <h1>Big Two</h1>
  {message && <p className="message">{message}</p>}
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
  <div className="panel" style={styles.panel}>
          <h3>Players</h3>
          <ul>
            {state.names.map((n, i) => (
              <li key={i} style={{ fontWeight: i === state.turn ? 'bold' as const : 'normal' }}>
                {i === state.you ? '(You) ' : ''}{n} — cards: {state.counts[i]} {state.passed[i] ? ' (passed)' : ''}
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
      </div>

  <div className="panel" style={{ ...styles.panel, margin: '12px auto', maxWidth: 820 }}>
        <h3>Play history</h3>
        {state.history && state.history.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {state.history.map((h, idx) => (
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
