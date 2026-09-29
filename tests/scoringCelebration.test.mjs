import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectScoringCelebration, isWinner } from '../src/lib/scoringCelebration.ts';
import { LiveScoringClient } from '../src/lib/liveScoring.ts';
import { parseScoringEventUrl } from '../src/lib/scoring.ts';

function match(points = 501, lastScore = 0, darts = 0) {
    return {
        board: 1, matchKey: 'match-1', mode: '501', roundName: 'Finale', groupName: 'A',
        matchPlayers: [
            { playerName: 'Heim', points, lastScore, darts, legs: 0, sets: 0 },
            { playerName: 'Gast', points: 501, lastScore: 0, darts: 0, legs: 0, sets: 0 },
        ],
    };
}

test('only an explicit numeric zero is a winner', () => {
    for (const value of [0, '0', ' 0 ']) assert.equal(isWinner(value), true);
    for (const value of [null, undefined, '', ' ', false, NaN, -1, 26, 'checkout']) {
        assert.equal(isWinner(value), false);
    }
});

test('26, 171 and 180 celebrate the player who threw, regardless of whose turn is next', () => {
    for (const score of [26, 171, 180]) {
        const after = match(501 - score, score, 3);
        after.currentplayerIndex = 1;
        assert.deepEqual(detectScoringCelebration(match(), after), {
            board: '1', matchKey: 'match-1', playerName: 'Heim', kind: String(score),
        });
        assert.equal(detectScoringCelebration(after, structuredClone(after)), null);
    }
    const before = match();
    const after = match();
    after.matchPlayers[1] = { ...after.matchPlayers[1], points: 321, lastScore: 180, darts: 3 };
    assert.equal(detectScoringCelebration(before, after)?.playerName, 'Gast');
});

test('consecutive identical visits celebrate separately and score strings are accepted', () => {
    assert.equal(detectScoringCelebration(match(321, 180, 3), match(141, 180, 6))?.kind, '180');
    assert.equal(detectScoringCelebration(match('501', '0', '0'), match('330', '171', '3'))?.kind, '171');
});

test('initial data, new matches, board changes, resets and ordinary visits do not celebrate', () => {
    assert.equal(detectScoringCelebration(null, match(321, 180, 3)), null);
    assert.equal(detectScoringCelebration(match(), { ...match(321, 180, 3), matchKey: 'other' }), null);
    assert.equal(detectScoringCelebration(match(), { ...match(321, 180, 3), board: 2 }), null);
    assert.equal(detectScoringCelebration(match(26, 180, 18), match()), null);
    assert.equal(detectScoringCelebration(match(), match(401, 100, 3)), null);
    assert.equal(detectScoringCelebration(match(), match(475, 0, 3)), null);
    assert.equal(detectScoringCelebration(match(501, 0, 6), match(321, 180, 3)), null);
    assert.equal(detectScoringCelebration(match(321, 180, 3), match(321, 180, 6)), null);
});

test('checkout takes priority over a special score and survives an immediate leg reset', () => {
    assert.equal(detectScoringCelebration(match(26), match(0, 26, 3))?.kind, 'checkout');
    assert.equal(detectScoringCelebration(match(0, 26, 3), match(0, 26, 3)), null);
    const reset = match();
    reset.matchPlayers[0].legs = 1;
    assert.equal(detectScoringCelebration(match(40), reset)?.kind, 'checkout');
    assert.equal(detectScoringCelebration(reset, structuredClone(reset)), null);
    const newSet = match();
    newSet.matchPlayers[0].sets = 1;
    assert.equal(detectScoringCelebration(reset, newSet)?.kind, 'checkout');
    // A zero followed by the provider incrementing the leg is still the same checkout.
    assert.equal(detectScoringCelebration(match(0, 40, 3), reset), null);
});

test('client celebrates live packets once, never the initial snapshot or another board', async () => {
    const celebrations = [];
    let socket;
    const initial = match(321, 180, 3);
    const client = new LiveScoringClient({
        onMatches() {}, onStatus() {}, onCelebration: (event) => celebrations.push(event),
    }, {
        fetchImpl: async () => ({ ok: true, json: async () => ({ data: [initial] }) }),
        socketFactory: () => (socket = { close() {}, send() {} }),
    });
    try {
        client.start(parseScoringEventUrl('https://live.3k-darts.com/event/5/2995582'));
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(celebrations.length, 0);
        const send = (update) => socket.onmessage({
            data: `a${JSON.stringify([`MESSAGE\n\n${JSON.stringify({ match: update })}\0`])}`,
        });
        send(initial);
        assert.equal(celebrations.length, 0);
        send(match(141, 180, 6));
        send(match(141, 180, 6));
        assert.deepEqual(celebrations.map((event) => [event.board, event.kind]), [['1', '180']]);
        send({ ...match(330, 171, 3), board: 2, matchKey: 'match-2' });
        assert.equal(celebrations.length, 1);
        send(match(0, 141, 9));
        assert.equal(celebrations.at(-1).kind, 'checkout');
    } finally {
        client.stop();
    }
});
