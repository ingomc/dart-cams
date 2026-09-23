import type { LiveMatch, ScoringEvent } from './scoring.ts';
import { upsertMatch } from './scoring.ts';

export type ScoringStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'error';

interface LiveScoringCallbacks {
    onMatches(matches: LiveMatch[]): void;
    onStatus(status: ScoringStatus): void;
}

interface LiveScoringDependencies {
    fetchImpl?: typeof fetch;
    socketFactory?: (url: string) => WebSocket;
}

export class LiveScoringClient {
    private event: ScoringEvent | null = null;
    private generation = 0;
    private socket: WebSocket | null = null;
    private abort: AbortController | null = null;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private matches: LiveMatch[] = [];
    private updatesDuringRefresh: LiveMatch[] = [];
    private status: ScoringStatus = 'idle';

    constructor(
        private callbacks: LiveScoringCallbacks,
        private dependencies: LiveScoringDependencies = {},
    ) {}

    start(event: ScoringEvent): void {
        this.dispose();
        this.event = event;
        this.matches = [];
        this.callbacks.onMatches([]);
        this.setStatus('connecting');
        const generation = this.generation;
        void this.refresh(generation);
        this.openSocket(generation);
        this.refreshTimer = setInterval(() => void this.refresh(generation), 60_000);
    }

    stop(): void {
        this.dispose();
        this.event = null;
        this.matches = [];
        this.callbacks.onMatches([]);
        this.setStatus('idle');
    }

    private dispose(): void {
        this.generation++;
        this.abort?.abort();
        this.abort = null;
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.refreshTimer = null;
        this.reconnectTimer = null;
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        this.reconnectAttempts = 0;
        this.updatesDuringRefresh = [];
    }

    private setStatus(status: ScoringStatus): void {
        this.status = status;
        this.callbacks.onStatus(status);
    }

    private async refresh(generation: number): Promise<void> {
        if (!this.event || generation !== this.generation) return;
        this.abort?.abort();
        const abort = new AbortController();
        this.abort = abort;
        this.updatesDuringRefresh = [];
        const { databaseId, groupKey } = this.event;
        try {
            const response = await (this.dependencies.fetchImpl ?? fetch)(
                `https://live-backend.2k-dart-software.com/dartsscorer-liveticker/api/v1/match/${databaseId}/0/${groupKey}`,
                { signal: abort.signal },
            );
            if (!response.ok) throw new Error(`Live-Scoring HTTP ${response.status}`);
            const json: unknown = await response.json();
            if (generation !== this.generation || abort.signal.aborted) return;
            const data = typeof json === 'object' && json !== null && 'data' in json
                ? (json as { data: unknown }).data : null;
            if (!Array.isArray(data)) throw new Error('Ungültige Match-Daten');
            const snapshot = data.filter((match): match is LiveMatch =>
                typeof match === 'object' && match !== null && Array.isArray(match.matchPlayers));
            this.matches = this.updatesDuringRefresh.reduce(upsertMatch, snapshot);
            this.callbacks.onMatches(this.matches);
            if (this.status === 'error') this.setStatus('offline');
        } catch (error) {
            if (!abort.signal.aborted && generation === this.generation && this.status !== 'live') {
                console.error('Fehler beim Laden der Matches:', error);
                this.setStatus('error');
            }
        } finally {
            if (this.abort === abort) this.abort = null;
        }
    }

    private openSocket(generation: number): void {
        if (!this.event || generation !== this.generation) return;
        const serverId = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const sessionId = Math.random().toString(36).slice(2, 10);
        const url = `wss://live-backend.2k-dart-software.com/dartsscorer-liveticker/api/v1/websocket/${serverId}/${sessionId}/websocket`;
        try {
            const socket = (this.dependencies.socketFactory ?? ((value) => new WebSocket(value)))(url);
            this.socket = socket;
            socket.onopen = () => {
                if (generation !== this.generation || this.socket !== socket) return;
                socket.send(JSON.stringify(['CONNECT\naccept-version:1.1,1.0\nheart-beat:10000,10000\n\n\0']));
            };
            socket.onmessage = (message) => {
                if (generation !== this.generation || this.socket !== socket || typeof message.data !== 'string') return;
                this.handleMessage(socket, message.data, generation);
            };
            socket.onerror = () => {
                if (generation === this.generation && this.socket === socket) this.setStatus('offline');
            };
            socket.onclose = () => {
                if (generation !== this.generation || this.socket !== socket) return;
                this.socket = null;
                this.setStatus('offline');
                const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts++);
                this.reconnectTimer = setTimeout(() => this.openSocket(generation), delay);
            };
        } catch (error) {
            console.error('Konnte Live-Verbindung nicht öffnen:', error);
            this.setStatus('offline');
            const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts++);
            this.reconnectTimer = setTimeout(() => this.openSocket(generation), delay);
        }
    }

    private handleMessage(socket: WebSocket, data: string, generation: number): void {
        if (!data.startsWith('a[')) return;
        try {
            const frames: unknown = JSON.parse(data.slice(1));
            if (!Array.isArray(frames)) return;
            for (const frame of frames) {
                if (typeof frame !== 'string') continue;
                if (frame.startsWith('CONNECTED')) {
                    const event = this.event;
                    if (!event) return;
                    socket.send(JSON.stringify([`SUBSCRIBE\nid:sub-0\ndestination:/topic/${event.databaseId}-${event.groupKey}\n\n\0`]));
                    this.reconnectAttempts = 0;
                    this.setStatus('live');
                    void this.refresh(generation);
                    continue;
                }
                const bodyStart = frame.indexOf('\n\n');
                if (bodyStart < 0) continue;
                const payload: unknown = JSON.parse(frame.slice(bodyStart + 2).replace(/\0$/, ''));
                const match = typeof payload === 'object' && payload !== null && 'match' in payload
                    ? (payload as { match: unknown }).match : null;
                if (typeof match !== 'object' || match === null || !('matchPlayers' in match) ||
                    !Array.isArray(match.matchPlayers)) continue;
                this.matches = upsertMatch(this.matches, match as LiveMatch);
                this.updatesDuringRefresh.push(match as LiveMatch);
                this.callbacks.onMatches(this.matches);
            }
        } catch (error) {
            console.error('Fehler beim Verarbeiten der Live-Daten:', error);
        }
    }
}
