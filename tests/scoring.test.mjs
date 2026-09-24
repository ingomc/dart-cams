import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    displayLegDarts,
    displayNumber,
    listBoards,
    matchForBoard,
    parseScoringEventUrl,
    teamScoreForBoards,
    upsertMatch,
} from '../src/lib/scoring.ts';
import { LiveScoringClient } from '../src/lib/liveScoring.ts';

const eventA = parseScoringEventUrl('https://live.3k-darts.com/event/5/2995582.');
const eventB = parseScoringEventUrl('https://live.3k-darts.com/event/5/2995583');

function match(board, matchKey, darts = '0') {
    return {
        board, matchKey, matchPlayers: [
            { playerName: 'A Long Name', points: 501, sets: 0, legs: 0, darts, lastScore: 0 },
            { playerName: 'Another Player', points: 501, sets: 0, legs: 0, darts: '0', lastScore: 0 },
        ], mode: '501', roundName: 'Finale', groupName: 'A',
    };
}

test('accepts a 3K event link while rejecting unsupported links', () => {
    assert.deepEqual(eventA, {
        url: 'https://live.3k-darts.com/event/5/2995582',
        key: '5-2995582', databaseId: '5', groupKey: '2995582',
    });
    assert.deepEqual(parseScoringEventUrl('https://live.3k-darts.com/event/5/2995582/'), eventA);
    assert.equal(parseScoringEventUrl('https://example.com/event/5/2995582'), null);
    assert.equal(parseScoringEventUrl('http://live.3k-darts.com/event/5/2995582'), null);
    assert.equal(parseScoringEventUrl('https://live.3k-darts.com/event/nope/2995582'), null);
});

test('board selection survives a match change and includes board zero', () => {
    const first = match(0, 'old', '18');
    const next = match(0, 'new', '0');
    const other = match(2, 'other');
    assert.deepEqual(listBoards([first, other], ['3']), ['0', '2', '3']);
    const updated = upsertMatch([first, other], next);
    assert.equal(matchForBoard(updated, '0')?.matchKey, 'new');
    assert.equal(updated.length, 2);
    assert.equal(displayLegDarts(matchForBoard(updated, '0')?.matchPlayers[0].darts), '0');
    assert.equal(matchForBoard([], '0'), null);
});

test('missing or ambiguous scores show a dash, but zero stays visible', () => {
    assert.equal(displayNumber(0), '0');
    assert.equal(displayNumber(null), '–');
    assert.equal(displayLegDarts('12'), '12');
    assert.equal(displayLegDarts(12), '12');
    assert.equal(displayLegDarts('T20, S20'), '–');
    assert.equal(displayLegDarts(undefined), '–');
});

test('league footer uses the latest selected board and keeps hyphens in the guest team', () => {
    const fixture = 'Heim A - Gast - Club (Liga A)';
    const older = {
        ...match(1, 'board-1'), typ: 'LIGA', groupName: fixture,
        setsHome: 4, setsGuest: 3, lastUpdate: '2026-09-24T20:00:00Z',
    };
    const newer = {
        ...match(2, 'board-2'), typ: 'LIGA', groupName: fixture,
        setsHome: 5, setsGuest: 3, lastUpdate: '2026-09-24T20:01:00Z',
    };
    assert.deepEqual(teamScoreForBoards([older, newer], ['1', '2']), {
        home: 'Heim A', guest: 'Gast - Club', homeScore: '5', guestScore: '3',
    });
    assert.equal(teamScoreForBoards([older, newer], ['3']), null);
    assert.equal(teamScoreForBoards([{ ...newer, typ: 'TURNIER' }], ['2']), null);
    assert.equal(teamScoreForBoards([{ ...newer, setsHome: -1 }], ['2']), null);
});

test('switching events ignores the old request and closes its socket', async () => {
    assert.ok(eventA && eventB);
    const requests = [];
    const sockets = [];
    const seen = [];
    class FakeSocket {
        closed = false;
        constructor() { sockets.push(this); }
        close() { this.closed = true; this.onclose?.(); }
        send() {}
    }
    const client = new LiveScoringClient({
        onMatches: (matches) => seen.push(matches),
        onStatus: () => {},
    }, {
        fetchImpl: (_url, options) => new Promise((resolve) => requests.push({ resolve, signal: options.signal })),
        socketFactory: () => new FakeSocket(),
    });
    client.start(eventA);
    client.start(eventB);
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(sockets[0].closed, true);
    requests[0].resolve({ ok: true, json: async () => ({ data: [match(0, 'old')] }) });
    requests[1].resolve({ ok: true, json: async () => ({ data: [match(2, 'new')] }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(seen.at(-1)[0].matchKey, 'new');
    client.stop();
});

test('a lost socket marks retained scores as offline', async () => {
    assert.ok(eventA);
    const statuses = [];
    const seen = [];
    let socket;
    const client = new LiveScoringClient({
        onMatches: (matches) => seen.push(matches),
        onStatus: (status) => statuses.push(status),
    }, {
        fetchImpl: async () => ({ ok: true, json: async () => ({ data: [match(0, 'live')] }) }),
        socketFactory: () => (socket = { close() {}, send() {} }),
    });
    client.start(eventA);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.onclose();
    assert.equal(statuses.at(-1), 'offline');
    assert.equal(seen.at(-1)[0].matchKey, 'live');
    client.stop();
});
