import { boardId, listBoards, parseScoringEventUrl, type LiveMatch } from './scoring.ts';

export const DEFAULT_CONTEXT_URL = 'https://darts.sc-oberfuellbach.de/api/dartcams/context';
export interface FixtureTeam {
    participantId: number;
    name: string;
    logoUrl: string | null;
}
export interface AutoFixture {
    matchId: number;
    eventId: number;
    databaseId: number;
    roundName: string;
    datePlanned: string;
    status: 'live' | 'upcoming' | 'finished';
    liveUrl: string;
    home: FixtureTeam;
    guest: FixtureTeam;
}
export interface AutoScoringContext {
    version: 1;
    fetchedAt: string;
    stale: boolean;
    logosStale: boolean;
    fixture: AutoFixture | null;
}
export type AutoScoringStatus = 'loading' | 'ready' | 'stale' | 'error';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function parseTeam(value: unknown): FixtureTeam | null {
    if (!record(value) || !positiveId(value.participantId) || typeof value.name !== 'string' || !value.name.trim()) return null;
    let logoUrl: string | null = null;
    if (typeof value.logoUrl === 'string') {
        try {
            const url = new URL(value.logoUrl);
            if (url.protocol === 'https:' && !url.username && !url.password) logoUrl = url.href;
        } catch { /* A missing or invalid logo does not block scoring. */ }
    }
    return { participantId: value.participantId, name: value.name, logoUrl };
}

export function parseAutoScoringContext(value: unknown): AutoScoringContext | null {
    if (!record(value) || value.version !== 1 || !timestamp(value.fetchedAt) || typeof value.stale !== 'boolean' || typeof value.logosStale !== 'boolean') return null;
    let fixture: AutoFixture | null = null;
    if (value.fixture !== null) {
        const raw = value.fixture;
        if (!record(raw) || !positiveId(raw.matchId) || !positiveId(raw.eventId) || !positiveId(raw.databaseId) ||
            !timestamp(raw.datePlanned) || typeof raw.roundName !== 'string' || typeof raw.liveUrl !== 'string' ||
            (raw.status !== 'live' && raw.status !== 'upcoming' && raw.status !== 'finished')) return null;
        const event = parseScoringEventUrl(raw.liveUrl);
        const home = parseTeam(raw.home);
        const guest = parseTeam(raw.guest);
        if (!home || !guest || event?.databaseId !== String(raw.databaseId) || event.groupKey !== String(raw.matchId)) return null;
        fixture = { matchId: raw.matchId, eventId: raw.eventId, databaseId: raw.databaseId,
            datePlanned: raw.datePlanned, roundName: raw.roundName, status: raw.status, liveUrl: event.url, home, guest };
    }
    return { version: 1, fetchedAt: value.fetchedAt, stale: value.stale, logosStale: value.logosStale, fixture };
}

export function restoreAutoScoringContext(raw: string | null): AutoScoringContext | null {
    try { return parseAutoScoringContext(JSON.parse(raw ?? 'null')); } catch { return null; }
}

export class AutoScoringClient {
    private context: AutoScoringContext | null = null;
    private abort: AbortController | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private generation = 0;
    private enabled = false;
    private selectedThisSession = false;

    constructor(private callbacks: {
        onContext(context: AutoScoringContext): void;
        onStatus(status: AutoScoringStatus): void;
    }, private options: { fetchImpl?: typeof fetch; endpoint?: string } = {}) {}

    start(cached: AutoScoringContext | null = null): void {
        this.stop();
        this.enabled = true;
        this.context = cached;
        this.selectedThisSession = false;
        void this.refresh(true);
        this.timer = setInterval(() => { void this.refresh(); }, 60_000);
    }

    stop(): void {
        this.enabled = false;
        this.generation++;
        this.abort?.abort();
        this.abort = null;
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
    }

    async refresh(selectNext = false): Promise<void> {
        if (!this.enabled) return;
        this.abort?.abort();
        const abort = new AbortController();
        this.abort = abort;
        const generation = ++this.generation;
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; abort.abort(); }, 12_000);
        this.callbacks.onStatus('loading');
        try {
            const url = new URL(this.options.endpoint ?? DEFAULT_CONTEXT_URL);
            if (!selectNext && this.selectedThisSession && this.context?.fixture) url.searchParams.set('match', String(this.context.fixture.matchId));
            const response = await (this.options.fetchImpl ?? fetch)(url.href, { signal: abort.signal, credentials: 'omit' });
            if (!response.ok) throw new Error(`Spielauswahl HTTP ${response.status}`);
            const context = parseAutoScoringContext(await response.json());
            if (!context) throw new Error('Ungültige Spielauswahl');
            if (!this.enabled || generation !== this.generation) return;
            if (abort.signal.aborted) throw new Error('Spielauswahl abgebrochen');
            this.context = context;
            if (!context.stale) this.selectedThisSession = true;
            this.callbacks.onContext(context);
            this.callbacks.onStatus(context.stale ? 'stale' : 'ready');
        } catch {
            if (!this.enabled || generation !== this.generation || (abort.signal.aborted && !timedOut)) return;
            if (this.context) {
                this.context = { ...this.context, stale: true };
                this.callbacks.onContext(this.context);
            }
            this.callbacks.onStatus(this.context ? 'stale' : 'error');
        } finally {
            clearTimeout(timeout);
            if (this.abort === abort) this.abort = null;
        }
    }
}

export interface BoardSelection {
    boards: { cam1: string; cam2: string };
    pending: { cam1: boolean; cam2: boolean };
}

export function restoreBoardSelection(raw: string | null, automatic: boolean): BoardSelection {
    let saved: Record<string, unknown> = {};
    try { const value: unknown = JSON.parse(raw ?? '{}'); if (record(value)) saved = value; } catch { /* Start with unassigned boards. */ }
    const selection: BoardSelection = { boards: { cam1: '', cam2: '' }, pending: { cam1: false, cam2: false } };
    for (const slot of ['cam1', 'cam2'] as const) {
        const value = saved[slot];
        const valid = typeof value === 'string' && (value === '' || boardId(value) !== null);
        selection.boards[slot] = valid && value ? boardId(value)! : '';
        selection.pending[slot] = automatic && !valid;
    }
    return selection;
}

export function assignAvailableBoards(matches: LiveMatch[], selection: BoardSelection): BoardSelection {
    const next = { boards: { ...selection.boards }, pending: { ...selection.pending } };
    const available = listBoards(matches).filter(board => !Object.values(next.boards).includes(board));
    for (const slot of ['cam1', 'cam2'] as const) {
        if (!next.pending[slot] || !available.length) continue;
        next.boards[slot] = available.shift()!;
        next.pending[slot] = false;
    }
    return next;
}

export function serializeBoardSelection(selection: BoardSelection): string {
    return JSON.stringify(Object.fromEntries((['cam1', 'cam2'] as const)
        .filter(slot => !selection.pending[slot]).map(slot => [slot, selection.boards[slot]])));
}
