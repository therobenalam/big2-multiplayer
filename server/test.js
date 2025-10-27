// Minimal sanity tests for engine
import assert from 'assert';
import { classify, canBeat } from './engine.js';

function cards(ids){ return ids.map(id=>({ id, r: id.slice(0,-1), s: id.slice(-1) })); }

// Singles
assert.equal(classify(cards(['3D'])).type, 'single');
assert.equal(classify(cards(['AS'])).type, 'single');

// Pair
assert.equal(classify(cards(['7D','7S'])).type, 'pair');

// Triple
assert.equal(classify(cards(['QC','QD','QS'])).type, 'triple');

// Straight lowest A-2-3-4-5
assert.equal(classify(cards(['AD','2C','3S','4D','5H'])).type, 'straight');
// Straight highest 10-J-Q-K-A
assert.equal(classify(cards(['10D','JH','QS','KC','AD'])).type, 'straight');

// Flush
assert.equal(classify(cards(['3S','5S','7S','9S','JS'])).type, 'flush');

// Full House
assert.equal(classify(cards(['9D','9S','9H','4C','4S'])).type, 'fullhouse');

// Four of a kind
assert.equal(classify(cards(['KD','KS','KH','KC','3D'])).type, 'fourkind');

// Straight flush
assert.equal(classify(cards(['6H','7H','8H','9H','10H'])).type, 'straightflush');

// Beats test (singles)
const s3 = classify(cards(['3D']));
const s4 = classify(cards(['4D']));
assert(canBeat(s3, s4) === false ? false : true);
assert.equal(canBeat(s3, classify(cards(['3S']))), true); // suit tiebreaker

console.log('Engine tests: OK');
