export interface BridgeConnection { status: 'searching' | 'online' | 'offline'; token: string; baseUrl: string }
export const bridgeBaseUrl = 'http://127.0.0.1:8731';
export const initialConnection: BridgeConnection = { status: 'searching', token: '', baseUrl: bridgeBaseUrl };

export class DartRectifyDiscovery {
    private running = false;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private controller: AbortController | undefined;
    private epoch = 0;
    private last = '';
    constructor(private changed: (connection: BridgeConnection) => void) {}
    private notify(status: BridgeConnection['status'], token = '') {
        const key = `${status}:${token}`;
        if (key !== this.last) { this.last = key; this.changed({ status, token, baseUrl: bridgeBaseUrl }); }
    }
    private visibility = () => {
        clearTimeout(this.timer); this.controller?.abort(); ++this.epoch;
        if (this.running && !document.hidden) void this.poll(this.epoch);
    };
    start() {
        if (this.running) return;
        this.running = true; document.addEventListener('visibilitychange', this.visibility); this.visibility();
    }
    retry() { this.visibility(); }
    stop() {
        this.running = false; ++this.epoch; clearTimeout(this.timer); this.controller?.abort();
        document.removeEventListener('visibilitychange', this.visibility);
    }
    private async poll(epoch: number) {
        if (!this.running || document.hidden || epoch !== this.epoch) return;
        const controller = new AbortController(); this.controller = controller;
        const timeout = setTimeout(() => controller.abort(), 1500);
        try {
            const response = await fetch(`${bridgeBaseUrl}/api/v1/discovery`, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
            if (!response.ok) throw new Error('Bridge unavailable');
            const value = await response.json();
            if (value.service !== 'dartrectify' || value.protocol_version !== 1 || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/i.test(value.token) || !Array.isArray(value.boards) || !value.boards.includes('home') || !value.boards.includes('guest')) throw new Error('Invalid bridge');
            if (this.running && epoch === this.epoch) this.notify('online', value.token);
        } catch { if (this.running && epoch === this.epoch) this.notify('offline'); }
        finally {
            clearTimeout(timeout);
            if (this.running && epoch === this.epoch && !document.hidden) this.timer = setTimeout(() => void this.poll(epoch), 3000);
        }
    }
}
