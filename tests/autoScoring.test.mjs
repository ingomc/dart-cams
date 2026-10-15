import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    AutoScoringClient, parseAutoScoringContext, restoreAutoScoringContext,
    restoreBoardSelection, assignAvailableBoards, serializeBoardSelection,
} from '../src/lib/autoScoring.ts';

function context(matchId = 3876210) {
    return {
        version: 1, fetchedAt: '2026-10-15T10:00:00Z', stale: false, logosStale: false,
        fixture: {
            matchId, eventId: 24970, databaseId: 5, roundName: 'Spieltag 4',
            datePlanned: '2026-10-16T16:00:00Z', status: 'upcoming',
            liveUrl: `https://live.3k-darts.com/event/5/${matchId}`,
            home: { participantId: 633505, name: 'SCO', logoUrl: 'https://dartstory.ingomc.de/logo_sco.png' },
            guest: { participantId: 632080, name: 'Gast', logoUrl: null },
        },
    };
}
const response = (body) => ({ ok: true, json: async () => body });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('context validates the fixture and live link; missing or unsafe logos do not block scoring', () => {
    const valid = context();
    assert.deepEqual(parseAutoScoringContext(valid), valid);
    for (const invalid of [
        { ...valid, version: 2 }, { ...valid, fetchedAt: 'invalid' },
        { ...valid, fixture: { ...valid.fixture, matchId: 123 } },
        { ...valid, fixture: { ...valid.fixture, liveUrl: 'https://example.com/event/5/3876210' } },
    ]) assert.equal(parseAutoScoringContext(invalid), null);
    valid.fixture.home.logoUrl = 'javascript:alert(1)';
    assert.equal(parseAutoScoringContext(valid).fixture.home.logoUrl, null);
    assert.equal(restoreAutoScoringContext('{broken'), null);
    assert.equal(parseAutoScoringContext({ ...valid, fixture: null }).fixture, null);
});

test('a session pins its selected fixture until an explicit refresh; no next fixture clears it', async () => {
    const urls = [], seen = [], statuses = [];
    let next = context();
    const client = new AutoScoringClient({ onContext: value => seen.push(value), onStatus: value => statuses.push(value) }, {
        fetchImpl: async url => { urls.push(new URL(url)); return response(next); },
    });
    try {
        client.start(context(1));
        await flush();
        assert.equal(urls[0].search, '');
        next = { ...context(), fixture: { ...context().fixture, status: 'finished' } };
        await client.refresh();
        assert.equal(urls[1].searchParams.get('match'), '3876210');
        assert.equal(seen.at(-1).fixture.status, 'finished');
        next = context(3876220);
        await client.refresh(true);
        assert.equal(urls[2].search, '');
        assert.equal(seen.at(-1).fixture.matchId, 3876220);
        next = { ...next, fixture: null };
        await client.refresh(true);
        assert.equal(seen.at(-1).fixture, null);
        assert.equal(statuses.at(-1), 'ready');
    } finally { client.stop(); }
});

test('startup failures use the cache but retry selection without pinning an old game', async () => {
    const urls = [], seen = [], statuses = [];
    let failing = true;
    const client = new AutoScoringClient({ onContext: value => seen.push(value), onStatus: value => statuses.push(value) }, {
        fetchImpl: async url => {
            urls.push(new URL(url));
            if (failing) throw new Error('offline');
            return response(context());
        },
    });
    try {
        client.start(context(1));
        await flush();
        assert.equal(seen.at(-1).fixture.matchId, 1);
        assert.equal(seen.at(-1).stale, true);
        assert.equal(statuses.at(-1), 'stale');
        failing = false;
        await client.refresh();
        assert.equal(urls[1].search, '');
        assert.equal(seen.at(-1).fixture.matchId, 3876210);
        failing = true;
        await client.refresh();
        assert.equal(urls[2].searchParams.get('match'), '3876210');
        assert.equal(seen.at(-1).fixture.matchId, 3876210);
    } finally { client.stop(); }
});

test('disabling automatic selection cancels requests and ignores late responses', async () => {
    const seen = [], statuses = [], requests = [];
    const client = new AutoScoringClient({ onContext: value => seen.push(value), onStatus: value => statuses.push(value) }, {
        fetchImpl: (_url, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal })),
    });
    client.start();
    client.stop();
    assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve(response(context()));
    await flush();
    assert.equal(seen.length, 0);
    assert.deepEqual(statuses, ['loading']);
});

test('no cache plus an unavailable endpoint reports an error without a fabricated fixture', async () => {
    const statuses = [], seen = [];
    const client = new AutoScoringClient({ onContext: value => seen.push(value), onStatus: value => statuses.push(value) }, {
        fetchImpl: async () => ({ ok: false, status: 502 }),
    });
    try {
        client.start();
        await flush();
        assert.equal(statuses.at(-1), 'error');
        assert.equal(seen.length, 0);
    } finally { client.stop(); }
});

test('automatic boards fill as they arrive and retain explicit choices across reloads', () => {
    const matches = [0, 1, 2].map(board => ({ board, matchKey: `board-${board}`, matchPlayers: [] }));
    const empty = restoreBoardSelection(null, true);
    assert.deepEqual(assignAvailableBoards([], empty), empty);
    const first = assignAvailableBoards(matches.slice(0, 1), empty);
    assert.deepEqual(first.boards, { cam1: '0', cam2: '' });
    assert.deepEqual(first.pending, { cam1: false, cam2: true });
    const reloaded = restoreBoardSelection(serializeBoardSelection(first), true);
    const both = assignAvailableBoards(matches, reloaded);
    assert.deepEqual(both.boards, { cam1: '0', cam2: '1' });
    const manual = restoreBoardSelection('{"cam1":"2","cam2":""}', true);
    assert.deepEqual(assignAvailableBoards(matches, manual), manual);
    const disabled = restoreBoardSelection(null, false);
    assert.deepEqual(assignAvailableBoards(matches, disabled), disabled);
});
