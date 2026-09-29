import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    displayAverage,
    displayLegDarts,
    displayNumber,
    listBoards,
    matchForBoard,
    mergeMatchSnapshot,
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

test('average prefers the supplied value and otherwise matches the provider totals', () => {
    const player = { ...match(0, 'average').matchPlayers[0], scoreTotal: 327, dartsTotal: 27 };
    assert.equal(displayAverage({ ...player, avg: '60,25' }), '60,3');
    assert.equal(displayAverage({ ...player, average: 52.4 }), '52,4');
    assert.equal(displayAverage({ ...player, avg: 0 }), '0,0');
    assert.equal(displayAverage(player), '36,3');
    assert.equal(displayAverage({ ...player, scoreAdditional: 60, dartsAdditional: 3 }), '38,7');
    assert.equal(displayAverage({ ...player, avg: '', average: NaN }), '36,3');
    assert.equal(displayAverage({ ...player, dartsTotal: 0 }), '–');
    assert.equal(displayAverage({ ...player, scoreTotal: undefined }), '–');
    assert.equal(displayAverage(undefined), '–');
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

function timedMatch(board, key, created, updated = created, points = 501) {
    const data = match(board, key);
    return { ...data, database: '6', groupKey: '32231', status: 1,
        created: `2026-09-29T${created}`, lastUpdate: `2026-09-29T${updated}`,
        matchPlayers: data.matchPlayers.map((player) => ({ ...player, playerName: `${key}: ${player.playerName}`, points })),
    };
}

test('three boards keep their own players and scores through interleaved and stale updates', () => {
    const boards = [1, 2, 3].map((board) => timedMatch(board, `game-${board}`, '20:00:00'));
    let matches = [...boards];
    for (const [board, points] of [[3, 421], [1, 321], [3, 321], [2, 401]]) {
        matches = upsertMatch(matches, { ...boards[board - 1], board: String(board),
            lastUpdate: `2026-09-29T20:01:${points === 321 ? '02' : '01'}`,
            matchPlayers: boards[board - 1].matchPlayers.map((player) => ({ ...player, points })),
        });
    }
    matches = upsertMatch(matches, boards[0]);
    assert.deepEqual(listBoards(matches), ['1', '2', '3']);
    for (const [board, points] of [[1, 321], [2, 401], [3, 321]]) {
        const selected = matchForBoard(matches, String(board));
        assert.equal(selected.matchKey, `game-${board}`);
        assert.equal(selected.matchPlayers[0].playerName, `game-${board}: A Long Name`);
        assert.equal(selected.matchPlayers[0].points, points);
    }
});

test('a reused board keeps its newest game regardless of snapshot order or late old-game updates', () => {
    const old = timedMatch(1, 'semifinal', '20:00:00', '20:30:00', 40);
    const current = timedMatch(1, 'final', '20:25:00', '20:26:00', 170);
    for (const snapshot of [[old, current], [current, old]]) {
        assert.equal(matchForBoard(snapshot, '1')?.matchKey, 'final');
        const matches = mergeMatchSnapshot([], snapshot);
        assert.equal(matches.length, 1);
        assert.equal(matchForBoard(matches, '1')?.matchPlayers[0].points, 170);
        assert.equal(matchForBoard(upsertMatch(matches, old), '1')?.matchKey, 'final');
        assert.equal(matchForBoard(upsertMatch(matches, { ...old, status: 4 }), '1')?.matchKey, 'final');
    }
});

test('3K status 4 removes only its own match and an old refresh cannot bring it back', () => {
    const first = timedMatch(1, 'first', '20:00:00', '20:10:00.277067708');
    const third = timedMatch(3, 'third', '20:00:00', '20:10:00');
    const removed = upsertMatch([first, third], { ...first, status: 4, lastUpdate: '2026-09-29T20:10:00' });
    assert.equal(matchForBoard(removed, '1'), null);
    assert.equal(matchForBoard(removed, '3'), third);
    assert.deepEqual(listBoards(removed, ['1']), ['1', '3']);
    assert.equal(matchForBoard(mergeMatchSnapshot(removed, [first, third]), '1'), null);
    const next = timedMatch(1, 'next', '20:11:00');
    assert.equal(matchForBoard(upsertMatch(removed, next), '1'), next);
});

test('refresh retains newer live scores while removing boards absent from the snapshot', () => {
    const before = timedMatch(1, 'first', '20:00:00', '20:01:00', 501);
    const live = timedMatch(1, 'first', '20:00:00', '20:02:00', 321);
    const missing = timedMatch(2, 'missing', '20:00:00');
    const third = timedMatch(3, 'third', '20:00:00');
    const merged = mergeMatchSnapshot([live, missing], [before, third]);
    assert.equal(matchForBoard(merged, '1'), live);
    assert.equal(matchForBoard(merged, '2'), null);
    assert.equal(matchForBoard(merged, '3'), third);
    const correction = timedMatch(1, 'first', '20:00:00', '20:03:00', 501);
    assert.equal(matchForBoard(mergeMatchSnapshot(merged, [correction]), '1'), correction);
});

test('provider match IDs distinguish games even when match keys are empty', () => {
    const first = { ...match(1, ''), id: 7827706 };
    const third = { ...match(3, ''), id: 7827588 };
    const matches = upsertMatch([first], third);
    assert.equal(matchForBoard(matches, '1'), first);
    assert.equal(matchForBoard(matches, '3'), third);
    const moved = upsertMatch(matches, { ...first, board: 2 });
    assert.equal(matchForBoard(moved, '1'), null);
    assert.equal(matchForBoard(moved, '2')?.id, first.id);
});

test('client merges refreshes and three-board packets without stale scores or false celebrations', async () => {
    const requests = [];
    const seen = [];
    const celebrations = [];
    let socket;
    const client = new LiveScoringClient({
        onMatches: (matches) => seen.push(matches), onStatus() {},
        onCelebration: (event) => celebrations.push(event),
    }, {
        fetchImpl: () => new Promise((resolve) => requests.push(resolve)),
        socketFactory: () => (socket = { close() {}, send() {} }),
    });
    const sendFrame = (frame) => socket.onmessage({ data: `a${JSON.stringify([frame])}` });
    const send = (data) => sendFrame(`MESSAGE\n\n${JSON.stringify({ match: data })}\0`);
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const boards = [1, 2, 3].map((board) => timedMatch(board, `game-${board}`, '20:00:00'));
    try {
        client.start(parseScoringEventUrl('https://live.3k-darts.com/event/6/32231'));
        requests[0]({ ok: true, json: async () => ({ data: boards }) });
        await flush();
        const live = { ...boards[0], lastUpdate: '2026-09-29T20:02:00',
            matchPlayers: boards[0].matchPlayers.map((player) => ({ ...player, points: 321, lastScore: 180, darts: 3 })),
        };
        send(live);
        assert.equal(celebrations.length, 1);
        sendFrame('CONNECTED\n\n\0'); // Reconnect refresh starts after the live score.
        send({ ...boards[2], lastUpdate: '2026-09-29T20:03:00',
            matchPlayers: boards[2].matchPlayers.map((player) => ({ ...player, points: 401 })),
        });
        requests[1]({ ok: true, json: async () => ({ data: [...boards].reverse() }) });
        await flush();
        assert.equal(matchForBoard(seen.at(-1), '1')?.matchPlayers[0].points, 321);
        assert.equal(matchForBoard(seen.at(-1), '2')?.matchPlayers[0].points, 501);
        assert.equal(matchForBoard(seen.at(-1), '3')?.matchPlayers[0].points, 401);
        // Late packets must neither roll scores back nor generate another 180.
        send({ ...boards[0], lastUpdate: '2026-09-29T20:01:00',
            matchPlayers: live.matchPlayers.map((player) => ({ ...player, points: 141 })),
        });
        send({ ...live, groupKey: 'another-event' });
        send({ ...live, database: '5' });
        assert.equal(matchForBoard(seen.at(-1), '1')?.matchPlayers[0].points, 321);
        assert.equal(celebrations.length, 1);
        send({ ...live, status: 4 });
        assert.equal(seen.at(-1).length, 2);
        assert.equal(matchForBoard(seen.at(-1), '1'), null);
        assert.equal(matchForBoard(seen.at(-1), '3')?.matchPlayers[0].points, 401);
        assert.equal(celebrations.length, 1);
    } finally {
        client.stop();
    }
});
