import { boardId, type LiveMatch } from './scoring.ts';

export interface ScoringCelebration {
    board: string;
    matchKey?: string;
    playerName: string;
    kind: '26' | '171' | '180' | 'checkout';
}

export function scoreValue(value: unknown): number | null {
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function isWinner(points: unknown): boolean {
    return scoreValue(points) === 0;
}

/** Compare live updates only: initial snapshots and new matches are not new throws. */
export function detectScoringCelebration(previous: LiveMatch | null, current: LiveMatch): ScoringCelebration | null {
    const board = boardId(current.board);
    if (!previous || board === null || boardId(previous.board) !== board ||
        previous.matchKey !== current.matchKey || previous.mode !== current.mode ||
        previous.matchPlayers.length !== current.matchPlayers.length ||
        previous.matchPlayers.some((player, index) => player.playerName !== current.matchPlayers[index]?.playerName)) return null;

    let highlight: ScoringCelebration | null = null;
    for (const [index, player] of current.matchPlayers.entries()) {
        const before = previous.matchPlayers[index];
        const points = scoreValue(player.points);
        const previousPoints = scoreValue(before.points);
        const event = { board, matchKey: current.matchKey, playerName: player.playerName };
        const legs = scoreValue(player.legs);
        const previousLegs = scoreValue(before.legs);
        const sets = scoreValue(player.sets);
        const previousSets = scoreValue(before.sets);
        const wonLeg = legs !== null && previousLegs !== null && legs > previousLegs;
        const wonSet = sets !== null && previousSets !== null && sets > previousSets;

        // Some feeds advance straight to the next leg without sending a zero score.
        if ((points === 0 && previousPoints !== null && previousPoints > 0) ||
            ((wonLeg || wonSet) && previousPoints !== 0)) {
            return { ...event, kind: 'checkout' };
        }

        const lastScore = scoreValue(player.lastScore);
        const darts = scoreValue(player.darts);
        const previousDarts = scoreValue(before.darts);
        const sameLeg = current.legsHome === previous.legsHome && current.legsGuest === previous.legsGuest &&
            current.setsHome === previous.setsHome && current.setsGuest === previous.setsGuest &&
            player.legs === before.legs && player.sets === before.sets;
        // A score decrease identifies a fresh visit, including consecutive identical scores.
        // Reject resets, corrections that move the dart counter backwards, and repeated packets.
        if (sameLeg && points !== null && previousPoints !== null &&
            (darts === null || previousDarts === null || darts >= previousDarts) &&
            previousPoints - points === lastScore &&
            (lastScore === 26 || lastScore === 171 || lastScore === 180)) {
            highlight = { ...event, kind: String(lastScore) as '26' | '171' | '180' };
        }
    }
    return highlight;
}
