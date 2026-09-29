export interface BridgeConnection { status: 'searching' | 'online' | 'offline' | 'permission' | 'blocked'; token: string; baseUrl: string }
export const bridgeBaseUrl = 'http://127.0.0.1:8731';
export const initialConnection: BridgeConnection = { status: 'searching', token: '', baseUrl: bridgeBaseUrl };
export const connectionLabels: Record<BridgeConnection['status'], string> = {
    searching: 'wird gesucht', online: 'verbunden', offline: 'nicht erreichbar',
    permission: 'Browserfreigabe erforderlich', blocked: 'vom Browser blockiert'
};
export const connectionHelp: Record<BridgeConnection['status'], string> = {
    searching: 'Suche die DartRectify-App auf diesem PC.', online: 'Die lokale DartRectify-App ist verbunden.',
    offline: 'DartRectify auf diesem PC starten. Falls die App läuft: links neben der Browseradresse den Zugriff auf lokale Apps bzw. das lokale Netzwerk erlauben und erneut verbinden.',
    permission: 'Die Browserabfrage für lokale Apps bzw. das lokale Netzwerk mit „Zulassen“ bestätigen. Falls keine Abfrage erscheint, auf „DartRectify verbinden“ klicken.',
    blocked: 'Der Browser blockiert die lokale Verbindung. Links neben der Browseradresse unter Website-Einstellungen den Zugriff auf lokale Apps bzw. das lokale Netzwerk erlauben. Die Verbindung wird anschließend erneut versucht.'
};

export class DartRectifyDiscovery {
    private running = false;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private controller: AbortController | undefined;
    private epoch = 0;
    private lifetime = 0;
    private last = '';
    private permission: PermissionStatus | undefined;
    constructor(private changed: (connection: BridgeConnection) => void) {}
    private notify(status: BridgeConnection['status'], token = '') {
        const key = `${status}:${token}`;
        if (key !== this.last) { this.last = key; this.changed({ status, token, baseUrl: bridgeBaseUrl }); }
    }
    private visibility = () => {
        clearTimeout(this.timer); this.controller?.abort(); ++this.epoch;
        if (this.running && !document.hidden) void this.poll(this.epoch);
    };
    private async observePermission(lifetime: number) {
        // Chrome 145 split loopback from LAN access; older versions use the alias.
        for (const name of ['loopback-network', 'local-network-access']) {
            try {
                const permission = await navigator.permissions.query({ name } as PermissionDescriptor);
                if (!this.running || lifetime !== this.lifetime) return;
                this.permission = permission;
                permission.addEventListener('change', this.visibility);
                return;
            } catch { /* Browsers without this permission API can still connect. */ }
        }
    }
    start() {
        if (this.running) return;
        this.running = true;
        const lifetime = ++this.lifetime;
        document.addEventListener('visibilitychange', this.visibility);
        navigator.serviceWorker?.addEventListener('controllerchange', this.visibility);
        void this.observePermission(lifetime).then(() => {
            if (this.running && lifetime === this.lifetime) this.visibility();
        });
    }
    retry() { this.visibility(); }
    stop() {
        this.running = false; ++this.epoch; clearTimeout(this.timer); this.controller?.abort();
        ++this.lifetime;
        this.permission?.removeEventListener('change', this.visibility); this.permission = undefined;
        document.removeEventListener('visibilitychange', this.visibility);
        navigator.serviceWorker?.removeEventListener('controllerchange', this.visibility);
    }
    private async poll(epoch: number) {
        if (!this.running || document.hidden || epoch !== this.epoch) return;
        if (this.permission?.state === 'denied') { this.notify('blocked'); return; }
        if (this.permission?.state === 'prompt') this.notify('permission');
        const controller = new AbortController(); this.controller = controller;
        let timedOut = false;
        // A pending browser permission prompt needs time for a human to respond.
        // The short network timeout is safe only after permission was granted.
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.permission?.state === 'granted' ? 1500 : 60000);
        try {
            const response = await fetch(`${bridgeBaseUrl}/api/v1/discovery`, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
            if (!response.ok) throw new Error('Bridge unavailable');
            const value = await response.json();
            if (value.service !== 'dartrectify' || value.protocol_version !== 1 || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/i.test(value.token) || !Array.isArray(value.boards) || !value.boards.includes('home') || !value.boards.includes('guest')) throw new Error('Invalid bridge');
            if (this.running && epoch === this.epoch) this.notify('online', value.token);
        } catch {
            if (this.running && epoch === this.epoch) {
                const permission = this.permission?.state as PermissionState | undefined;
                this.notify(permission === 'denied' ? 'blocked' : permission === 'prompt' ? 'permission' : 'offline');
            }
        }
        finally {
            clearTimeout(timeout);
            // Never reopen a dismissed/timed-out permission prompt in a loop.
            if (this.running && epoch === this.epoch && !document.hidden && this.permission?.state !== 'prompt' &&
                !(timedOut && this.permission?.state !== 'granted'))
                this.timer = setTimeout(() => void this.poll(epoch), 3000);
        }
    }
}
