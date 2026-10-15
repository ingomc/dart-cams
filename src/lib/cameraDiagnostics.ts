export type CameraDiagnosticArea = 'app' | 'cam1' | 'cam2' | 'floating';
export type CameraDiagnosticValue = string | number | boolean | null;

export interface CameraDiagnosticEvent {
    at: string;
    area: CameraDiagnosticArea;
    event: string;
    details: Record<string, CameraDiagnosticValue>;
}

type DiagnosticStorage = Pick<Storage, 'getItem' | 'setItem'>;
type Listener = () => void;

const STORAGE_KEY = 'dartCamCameraDiagnosticsV1';
const WINDOW_MS = 10 * 60 * 1000;
const MAX_EVENTS = 1200;
const ALLOWED_DETAILS = new Set([
    'board', 'cameraCount', 'captureSequence', 'deviceLabel', 'errorName', 'frameRate',
    'currentTimeSec', 'generation', 'height', 'httpStatus', 'mediaReadyState', 'muted', 'ready', 'reason', 'sendAgeMs',
    'sessionChanged', 'source', 'sourceAgeMs', 'status', 'streamCount', 'viewers',
    'visible', 'width'
]);

function browserStorage(): DiagnosticStorage | null {
    try { return typeof window === 'undefined' ? null : window.localStorage; }
    catch { return null; }
}

/** A short, local-only camera history. Callers pass structured fields, never URLs or tokens. */
export class CameraDiagnostics {
    private events: CameraDiagnosticEvent[] = [];
    private listeners = new Set<Listener>();
    private canPersist: boolean;
    private storage: DiagnosticStorage | null;
    private now: () => number;

    constructor(options: { storage?: DiagnosticStorage | null; now?: () => number } = {}) {
        this.storage = options.storage === undefined ? browserStorage() : options.storage;
        this.now = options.now ?? Date.now;
        this.canPersist = this.storage !== null;
        try {
            const saved = this.storage?.getItem(STORAGE_KEY);
            const parsed: unknown = saved ? JSON.parse(saved) : [];
            if (Array.isArray(parsed)) {
                this.events = parsed.filter((item): item is CameraDiagnosticEvent =>
                    item && typeof item === 'object' && typeof item.at === 'string' &&
                    typeof item.area === 'string' && typeof item.event === 'string' &&
                    item.details && typeof item.details === 'object' && !Array.isArray(item.details));
            }
        } catch { this.canPersist = false; }
        this.trim();
        this.save();
    }

    private trim(): void {
        const cutoff = this.now() - WINDOW_MS;
        this.events = this.events.filter(item => {
            const at = Date.parse(item.at);
            return Number.isFinite(at) && at >= cutoff && at <= this.now() + 60_000;
        }).slice(-MAX_EVENTS);
    }

    private save(): void {
        if (!this.canPersist) return;
        try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.events)); }
        catch { this.canPersist = false; }
    }

    private notify(): void { for (const listener of this.listeners) listener(); }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener();
        return () => this.listeners.delete(listener);
    }

    record(area: CameraDiagnosticArea, event: string, details: Record<string, CameraDiagnosticValue> = {}): void {
        const safeDetails: Record<string, CameraDiagnosticValue> = {};
        for (const [key, value] of Object.entries(details)) {
            if (!ALLOWED_DETAILS.has(key)) continue;
            if (typeof value === 'string') safeDetails[key] = value.slice(0, 120);
            else if (typeof value === 'number' && Number.isFinite(value)) safeDetails[key] = value;
            else if (typeof value === 'boolean' || value === null) safeDetails[key] = value;
        }
        this.events.push({ at: new Date(this.now()).toISOString(), area, event: event.slice(0, 64), details: safeDetails });
        this.trim();
        this.save();
        this.notify();
    }

    snapshot(): CameraDiagnosticEvent[] {
        const before = this.events.length;
        this.trim();
        if (this.events.length !== before) { this.save(); this.notify(); }
        return this.events.map(item => ({ ...item, details: { ...item.details } }));
    }

    exportData(): { schemaVersion: 1; app: string; exportedAt: string; windowMinutes: 10; storage: string; events: CameraDiagnosticEvent[] } {
        return {
            schemaVersion: 1,
            app: 'SCO Dartcams',
            exportedAt: new Date(this.now()).toISOString(),
            windowMinutes: 10,
            storage: this.canPersist ? 'browser' : 'memory',
            events: this.snapshot()
        };
    }

    get storageAvailable(): boolean { return this.canPersist; }
}
