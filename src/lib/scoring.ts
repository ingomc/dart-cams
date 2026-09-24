import type { MatchData } from './types';

export type LiveMatch = MatchData['match'];

export interface TeamScore {
    home: string;
    guest: string;
    homeScore: string;
    guestScore: string;
}

export interface ScoringEvent {
    url: string;
    key: string;
    databaseId: string;
    groupKey: string;
}

export function parseScoringEventUrl(input: string): ScoringEvent | null {
    try {
        const url = new URL(input.trim().replace(/\.$/, ''));
        const match = /^\/event\/(\d+)\/(\d+)\/?$/.exec(url.pathname);
        if (url.protocol !== 'https:' || url.hostname !== 'live.3k-darts.com' || !match) return null;
        const [, databaseId, groupKey] = match;
        return {
            url: `${url.origin}/event/${databaseId}/${groupKey}`,
            key: `${databaseId}-${groupKey}`,
            databaseId,
            groupKey,
        };
    } catch {
        return null;
    }
}

export function boardId(value: unknown): string | null {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const board = String(value).trim();
    return /^\d+$/.test(board) ? String(Number(board)) : null;
}

export function listBoards(matches: LiveMatch[], selected: string[] = []): string[] {
    return [...new Set([...selected, ...matches.map((match) => boardId(match.board))]
        .filter((value): value is string => value !== null && value !== ''))]
        .sort((a, b) => Number(a) - Number(b));
}

export function matchForBoard(matches: LiveMatch[], selected: string): LiveMatch | null {
    return [...matches].reverse().find((match) => boardId(match.board) === selected) ?? null;
}

function teamNames(match: LiveMatch): Pick<TeamScore, 'home' | 'guest'> {
    const title = (match.teamParentMatchName || match.groupName || '').trim();
    // Some league titles repeat the fixture in parentheses, with an explicit "vs." separator.
    const repeatedFixture = /\(([^()]+\s+vs\.?\s+[^()]+)\)\s*$/i.exec(title);
    const fixture = (repeatedFixture?.[1] ?? title.replace(/\s+\([^()]*\)\s*$/, '')).trim();
    const versus = /\s+(?:vs\.?|gegen)\s+/i.exec(fixture);
    const separator = versus ?? /\s+-\s+/.exec(fixture);
    if (!separator || separator.index === undefined) return { home: 'Heim', guest: 'Gast' };

    return {
        home: fixture.slice(0, separator.index).trim() || 'Heim',
        guest: fixture.slice(separator.index + separator[0].length).trim() || 'Gast',
    };
}

/** Team totals are shared by boards in a league fixture; use the freshest selected board. */
export function teamScoreForBoards(matches: LiveMatch[], selectedBoards: string[]): TeamScore | null {
    const selected = new Set(selectedBoards.filter(Boolean));
    if (!selected.size) return null;

    let latest: LiveMatch | null = null;
    for (const match of matches) {
        const homeScore = displayNumber(match.setsHome);
        const guestScore = displayNumber(match.setsGuest);
        if (!selected.has(boardId(match.board) ?? '') ||
            !(match.typ?.startsWith('LIGA') || match.teamParentMatchName) ||
            homeScore === '–' || guestScore === '–' ||
            Number(homeScore) < 0 || Number(guestScore) < 0) continue;
        const updated = Date.parse(match.lastUpdate ?? '') || 0;
        const previous = Date.parse(latest?.lastUpdate ?? '') || 0;
        if (!latest || updated >= previous) latest = match;
    }
    if (!latest) return null;
    return {
        ...teamNames(latest),
        homeScore: displayNumber(latest.setsHome),
        guestScore: displayNumber(latest.setsGuest),
    };
}

export function upsertMatch(matches: LiveMatch[], incoming: LiveMatch): LiveMatch[] {
    const board = boardId(incoming.board);
    return [
        ...matches.filter((match) =>
            (incoming.matchKey === undefined || match.matchKey !== incoming.matchKey) &&
            (board === null || boardId(match.board) !== board)),
        incoming,
    ];
}

export function displayNumber(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
    return '–';
}

/** The provider's `darts` field is the current leg counter when it is numeric. */
export function displayLegDarts(value: unknown): string {
    const number = displayNumber(value);
    return number !== '–' && Number(number) >= 0 ? number : '–';
}
