// Big Two game engine (baseline rules)
// - Ranks high->low: 2 A K Q J 10 9 8 7 6 5 4 3
// - Suits high->low: S H C D
// - Valid plays: single, pair, triple, five-card: straight < flush < fullhouse < fourkind < straightflush
// - Straights: 2 ranks below 3; A can be high or low; A-2-3-4-5 is allowed as the lowest straight; 3-2-A-K-Q invalid.

export const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
export const SUITS = ['D','C','H','S']; // ascending
const SUIT_VALUE = Object.fromEntries(SUITS.map((s, i) => [s, i]));
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i]));

export function makeDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push({ id: r + s, r, s });
  }
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function dealToFour(deckShuffled) {
  const hands = [[], [], [], []];
  for (let i = 0; i < 52; i++) hands[i % 4].push(deckShuffled[i]);
  return hands.map(sortHand);
}

export function sortHand(hand) {
  return hand.slice().sort((a, b) => compareCard(a, b));
}

export function compareCard(a, b) {
  const ra = RANK_VALUE[a.r];
  const rb = RANK_VALUE[b.r];
  if (ra !== rb) return ra - rb; // ascending (3 low); higher value means higher rank index
  return SUIT_VALUE[a.s] - SUIT_VALUE[b.s];
}

// Types
// single, pair, triple, five: straight, flush, fullhouse, fourkind, straightflush
export function classify(cards) {
  const n = cards.length;
  const sorted = sortHand(cards);
  if (n === 1) return { type: 'single', key: keyCard(sorted[0]), info: { top: sorted[0] } };
  if (n === 2 && sameRank(sorted)) return { type: 'pair', key: keyPair(sorted), info: { rank: sorted[0].r, topSuit: maxSuit(sorted) } };
  if (n === 3 && sameRank(sorted)) return { type: 'triple', key: RANK_VALUE[sorted[0].r], info: { rank: sorted[0].r } };
  if (n === 5) return classifyFive(sorted);
  return null;
}

function sameRank(cards) { return cards.every(c => c.r === cards[0].r); }
function keyCard(c) { return RANK_VALUE[c.r] * 10 + SUIT_VALUE[c.s]; }
function keyPair(cards) {
  // Rank primary; tiebreaker by highest suit among the pair
  return RANK_VALUE[cards[0].r] * 10 + Math.max(SUIT_VALUE[cards[0].s], SUIT_VALUE[cards[1].s]);
}
function maxSuit(cards) { return cards.reduce((m, c) => Math.max(m, SUIT_VALUE[c.s]), -1); }

function classifyFive(sorted) {
  const isFlush = sorted.every(c => c.s === sorted[0].s);
  const straightInfo = straightRank(sorted);
  if (isFlush && straightInfo.valid) return { type: 'straightflush', key: straightInfo.key, info: straightInfo };
  // count ranks
  const counts = countByRank(sorted);
  const ranks = Object.keys(counts).sort((a,b)=> RANK_VALUE[b]-RANK_VALUE[a]);
  const values = ranks.map(r=>counts[r]).sort((a,b)=>b-a);
  if (values[0] === 4) {
    const quadRank = parseIntRank(Object.keys(counts).find(r => counts[r] === 4));
    return { type: 'fourkind', key: quadRank, info: { quadRank } };
  }
  if (values[0] === 3 && values[1] === 2) {
    const tripleRank = parseIntRank(Object.keys(counts).find(r => counts[r] === 3));
    return { type: 'fullhouse', key: tripleRank, info: { tripleRank } };
  }
  if (isFlush) {
    // In baseline: higher suit beats lower; within suit, compare highest card
    const top = sorted[4];
    const key = SUIT_VALUE[top.s] * 100 + RANK_VALUE[top.r];
    return { type: 'flush', key, info: { suit: top.s, top } };
  }
  if (straightInfo.valid) return { type: 'straight', key: straightInfo.key, info: straightInfo };
  return null;
}

function parseIntRank(r) { return RANK_VALUE[r]; }

function countByRank(cards) {
  const m = {};
  for (const c of cards) m[c.r] = (m[c.r]||0)+1;
  return m;
}

// Straights: ranks consecutive with special handling: 2 ranks below 3; A can be high or low
// Allowed: A-2-3-4-5 (lowest), ..., A-K-Q-J-10 (highest). Not allowed: 3-2-A-K-Q, etc.
function straightRank(sorted) {
  // map ranks to order for straights: lowest order for A-2-3-4-5 is 0, etc.
  // Build arrays of possible straight sequences and check membership.
  const ranks = sorted.map(c=>c.r);
  // set of unique ranks
  const uniq = Array.from(new Set(ranks));
  if (uniq.length !== 5) return { valid: false };

  const sequences = [
    ['A','2','3','4','5'], // lowest
    ['2','3','4','5','6'],
    ['3','4','5','6','7'],
    ['4','5','6','7','8'],
    ['5','6','7','8','9'],
    ['6','7','8','9','10'],
    ['7','8','9','10','J'],
    ['8','9','10','J','Q'],
    ['9','10','J','Q','K'],
    ['10','J','Q','K','A'], // highest
  ];
  for (let idx=0; idx<sequences.length; idx++) {
    const seq = sequences[idx];
    if (isSameSet(ranks, seq)) {
      // key: primary by sequence index, secondary by top card suit
      const topRank = seq[4];
      const top = sorted.filter(c => c.r === topRank).sort((a,b)=>SUIT_VALUE[a.s]-SUIT_VALUE[b.s])[sorted.filter(c => c.r === topRank).length - 1];
      return { valid: true, key: idx*10 + SUIT_VALUE[top.s], top };
    }
  }
  return { valid: false };
}

function isSameSet(arr, target) {
  const s1 = [...arr].sort((a,b)=>RANK_VALUE[a]-RANK_VALUE[b]);
  const s2 = [...target].sort((a,b)=>RANK_VALUE[a]-RANK_VALUE[b]);
  return s1.every((v,i)=>v===s2[i]);
}

export function compareCombos(cA, cB) {
  // same type compare by key; for fives allow type hierarchy
  const order = ['straight','flush','fullhouse','fourkind','straightflush'];
  if (cA.type !== cB.type) {
    const ia = order.indexOf(cA.type);
    const ib = order.indexOf(cB.type);
    if (ia === -1 || ib === -1) return cA.type === cB.type ? 0 : NaN;
    return ia - ib;
  }
  return cA.key - cB.key; // ascending
}

export function canBeat(prev, next) {
  if (!prev) return true;
  if (prev.type === 'single' && next.type === 'single') return next.key > prev.key;
  if (prev.type === 'pair' && next.type === 'pair') return next.key > prev.key;
  if (prev.type === 'triple' && next.type === 'triple') return next.key > prev.key;
  if (isFive(prev) && isFive(next)) {
    const ordCmp = compareCombos(prev, next);
    return ordCmp < 0 || (ordCmp === 0 && next.key > prev.key);
  }
  return false;
}
function isFive(c){ return c && ['straight','flush','fullhouse','fourkind','straightflush'].includes(c.type); }

export function includes3D(cards){ return cards.some(c=>c.id==='3D'); }

// ===== AI BOT LOGIC =====

// AI plays a hand - returns array of card objects to play, or null to pass
export function getAIPlay(hand, lastPlay, lastPlayType, allPlayerCounts) {
  if (!hand || hand.length === 0) return null;

  // If starting new trick (lastPlay is null/undefined OR lastPlayType is null/undefined), AI prefers 5-card combos, then pairs, then singles
  if (!lastPlay || !lastPlayType) {
    // Try to find best 5-card combo
    const fiveCardCombo = findBestFiveCardCombo(hand);
    if (fiveCardCombo && fiveCardCombo.length === 5) {
      return fiveCardCombo;
    }
    
    // Try to find lowest pair
    const lowestPair = findLowestPair(hand);
    if (lowestPair && lowestPair.length === 2) {
      return lowestPair;
    }
    
    // Play lowest single card
    return [hand[0]];
  }

  // Try to beat the last play
  const validPlays = findValidPlays(hand, lastPlayType);
  if (validPlays.length === 0) return null; // Must pass

  // Defensive strategy: if opponent has few cards, play high
  const minOpponentCards = Math.min(...allPlayerCounts.filter((_, idx) => idx !== -1));

  if (minOpponentCards <= 3) {
    return validPlays[validPlays.length - 1]; // Play highest
  } else if (minOpponentCards <= 5 && Math.random() < 0.5) {
    return validPlays[Math.floor(validPlays.length / 2)]; // Play medium
  } else {
    return validPlays[0]; // Play lowest valid
  }
}

function findValidPlays(hand, lastPlayType) {
  const validPlays = [];
  
  if (lastPlayType.type === 'single') {
    // Find all singles that beat the last play
    for (const card of hand) {
      const combo = classify([card]);
      if (combo && canBeat(lastPlayType, combo)) {
        validPlays.push([card]);
      }
    }
  } else if (lastPlayType.type === 'pair') {
    // Find all pairs that beat the last play
    const pairs = findAllPairs(hand);
    for (const pair of pairs) {
      const combo = classify(pair);
      if (combo && canBeat(lastPlayType, combo)) {
        validPlays.push(pair);
      }
    }
  } else if (lastPlayType.type === 'triple') {
    // Find all triples that beat the last play
    const triples = findAllTriples(hand);
    for (const triple of triples) {
      const combo = classify(triple);
      if (combo && canBeat(lastPlayType, combo)) {
        validPlays.push(triple);
      }
    }
  } else if (lastPlayType.type === 'straight' || lastPlayType.type === 'flush' || 
             lastPlayType.type === 'fullhouse' || lastPlayType.type === 'fourkind' || 
             lastPlayType.type === 'straightflush') {
    // Find all 5-card combos that beat the last play
    const fiveCardCombos = findAllFiveCardCombos(hand);
    for (const combo of fiveCardCombos) {
      const classified = classify(combo);
      if (classified && canBeat(lastPlayType, classified)) {
        validPlays.push(combo);
      }
    }
  }

  return validPlays;
}

function findAllPairs(hand) {
  const pairs = [];
  for (let i = 0; i < hand.length - 1; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].r === hand[j].r) {
        pairs.push([hand[i], hand[j]]);
      }
    }
  }
  return pairs;
}

function findAllTriples(hand) {
  const triples = [];
  for (let i = 0; i < hand.length - 2; i++) {
    for (let j = i + 1; j < hand.length - 1; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        if (hand[i].r === hand[j].r && hand[j].r === hand[k].r) {
          triples.push([hand[i], hand[j], hand[k]]);
        }
      }
    }
  }
  return triples;
}

function findAllFiveCardCombos(hand) {
  const combos = [];
  // This is a simplified version - checks all possible 5-card combinations
  for (let i = 0; i < hand.length - 4; i++) {
    for (let j = i + 1; j < hand.length - 3; j++) {
      for (let k = j + 1; k < hand.length - 2; k++) {
        for (let l = k + 1; l < hand.length - 1; l++) {
          for (let m = l + 1; m < hand.length; m++) {
            const fiveCards = [hand[i], hand[j], hand[k], hand[l], hand[m]];
            const combo = classify(fiveCards);
            if (combo && isFive(combo)) {
              combos.push(fiveCards);
            }
          }
        }
      }
    }
  }
  return combos;
}

function findLowestPair(hand) {
  const pairs = findAllPairs(hand);
  return pairs.length > 0 ? pairs[0] : null;
}

function findBestFiveCardCombo(hand) {
  const combos = findAllFiveCardCombos(hand);
  return combos.length > 0 ? combos[0] : null;
}
