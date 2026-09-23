import type { MatchData } from './types';

export type LiveMatch = MatchData['match'];

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
