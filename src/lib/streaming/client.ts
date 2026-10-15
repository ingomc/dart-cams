import { STREAM_HELPER_URL, MAX_STREAM_BUFFER, initialStreamState, isStreamActive, recordingMimeType, validateStreamDestination, type StreamState } from './protocol';

export class LivestreamClient {
	state = { ...initialStreamState };
	private token = '';
	private media: MediaStream | null = null;
	private recorder: MediaRecorder | null = null;
	private socket: WebSocket | null = null;
	private timeout: ReturnType<typeof setTimeout> | undefined;
	private generation = 0;
	private disposed = false;

	constructor(private readonly onChange: (state: StreamState) => void) {}
	private update(change: Partial<StreamState>) {
		this.state = { ...this.state, ...change };
		if (!this.disposed) this.onChange(this.state);
	}

	async connect(): Promise<void> {
		if (isStreamActive(this.state.phase) || this.state.busy) return;
		this.update({ busy: true, message: '' });
		try {
			const response = await fetch(`${STREAM_HELPER_URL}/v1/discovery`, {
				cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(60_000),
			});
			if (!response.ok) throw new Error();
			this.acceptMetadata(await response.json());
		} catch {
			this.token = '';
			this.update({ helperConnected: false, configured: false,
				message: 'Helfer nicht erreichbar. „bun run stream:helper“ auf diesem Computer starten und den lokalen Netzwerkzugriff im Browser erlauben.' });
		} finally { this.update({ busy: false }); }
	}

	private acceptMetadata(data: { service: string; version: number; token: string; ffmpegAvailable: boolean; configured: boolean; viewerUrl: string; rtmpUrl: string }) {
		if (data.service !== 'dartcams-stream' || data.version !== 1 || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error();
		const destination = validateStreamDestination(data.viewerUrl, data.rtmpUrl);
		this.token = data.token;
		this.update({ ...destination, helperConnected: true, configured: !!data.configured && data.ffmpegAvailable,
			phase: 'idle', message: data.ffmpegAvailable ? '' : 'FFmpeg fehlt auf diesem Computer. Bitte installieren und den Helfer neu starten.' });
	}

	async configure(viewerUrl: string, rtmpUrl: string, streamKey: string): Promise<boolean> {
		if (!this.token || this.state.busy || isStreamActive(this.state.phase)) return false;
		this.update({ busy: true, message: '' });
		try {
			const destination = validateStreamDestination(viewerUrl, rtmpUrl);
			const response = await fetch(`${STREAM_HELPER_URL}/v1/config`, {
				method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(5000),
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
				body: JSON.stringify({ ...destination, streamKey }),
			});
			const data = await response.json();
			if (!response.ok) {
				if (response.status === 401) this.update({ helperConnected: false, configured: false });
				throw new Error(data.error || 'Einstellungen konnten nicht übernommen werden.');
			}
			this.acceptMetadata(data);
			return true;
		} catch (error) {
			this.update({ message: error instanceof TypeError ? 'Helfer nicht erreichbar. Bitte erneut verbinden.' : error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.' });
			return false;
		} finally { this.update({ busy: false }); }
	}

	// Invoked directly by a click: the capture chooser needs transient user activation.
	async start(): Promise<void> {
		if (!this.state.configured || this.state.busy || isStreamActive(this.state.phase)) return;
		if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
			this.update({ phase: 'error', message: 'Tab-Streaming wird hier nicht unterstützt. Bitte Dartcams in Chrome oder Edge öffnen.' });
			return;
		}
		const mimeType = recordingMimeType(type => MediaRecorder.isTypeSupported(type));
		if (!mimeType) {
			this.update({ phase: 'error', message: 'WebM-Aufnahme fehlt. Bitte Chrome oder Edge verwenden.' });
			return;
		}
		const generation = ++this.generation;
		this.update({ phase: 'selecting', message: '' });
		try {
			const captureOptions = {
				video: { displaySurface: 'browser', frameRate: 30, width: 1920, height: 1080 }, audio: false,
				preferCurrentTab: true, selfBrowserSurface: 'include', monitorTypeSurfaces: 'exclude',
				surfaceSwitching: 'exclude', systemAudio: 'exclude',
			};
			const media = await navigator.mediaDevices.getDisplayMedia(captureOptions);
			if (generation !== this.generation || this.disposed) { media.getTracks().forEach(track => track.stop()); return; }
			this.media = media;
			const track = media.getVideoTracks()[0];
			if (!track || track.getSettings().displaySurface !== 'browser') {
				this.stop('Bitte den Dartcams-Browser-Tab auswählen. Ganze Bildschirme und Fenster werden nicht übertragen.');
				return;
			}
			track.addEventListener('ended', () => { if (generation === this.generation) this.stop(); }, { once: true });
			this.update({ phase: 'connecting' });
			const socket = new WebSocket(`${STREAM_HELPER_URL.replace('http:', 'ws:')}/v1/stream`);
			this.socket = socket;
			this.timeout = setTimeout(() => { if (generation === this.generation) this.stop('Stream-Start dauert zu lange. Helfer und Owncast prüfen.'); }, 30_000);
			socket.onopen = () => {
				if (generation === this.generation) socket.send(JSON.stringify({ type: 'start', token: this.token }));
			};
			socket.onmessage = event => {
				if (generation !== this.generation) return;
				let data: { type: string; message?: string };
				try { data = JSON.parse(event.data); } catch { this.stop('Ungültige Antwort des Streaming-Helfers.'); return; }
				if (data.type === 'ready') {
					if (this.recorder) return;
					try {
						const recorder = new MediaRecorder(media, { mimeType, videoBitsPerSecond: 5_000_000 });
						this.recorder = recorder;
						recorder.ondataavailable = chunk => {
							if (generation !== this.generation || socket.readyState !== WebSocket.OPEN || !chunk.data.size) return;
							if (socket.bufferedAmount + chunk.data.size > MAX_STREAM_BUFFER) { this.stop('Übertragung zu langsam. Bitte Stream erneut starten.'); return; }
							socket.send(chunk.data);
						};
						recorder.onerror = () => this.stop('Die Tab-Aufnahme ist abgebrochen. Bitte erneut starten.');
						recorder.start(500);
					} catch { this.stop('Die Tab-Aufnahme konnte nicht gestartet werden.'); }
				} else if (data.type === 'live') {
					clearTimeout(this.timeout);
					this.update({ phase: 'live', message: '' });
				} else if (data.type === 'error') this.stop(data.message || 'Streaming-Verbindung unterbrochen.');
				else if (data.type === 'stopped') this.stop();
			};
			socket.onerror = () => { if (generation === this.generation) this.stop('Verbindung zum Streaming-Helfer fehlgeschlagen.'); };
			socket.onclose = () => { if (generation === this.generation) this.stop('Verbindung zum Streaming-Helfer unterbrochen.'); };
		} catch (error) {
			if (generation !== this.generation) return;
			this.stop(error instanceof DOMException && error.name === 'NotAllowedError'
				? 'Tab-Freigabe abgebrochen oder nicht erlaubt.' : 'Tab-Freigabe fehlgeschlagen. Bitte Chrome oder Edge verwenden und die Freigabe erlauben.');
		}
	}

	stop(message = ''): void {
		++this.generation;
		clearTimeout(this.timeout);
		const recorder = this.recorder;
		this.recorder = null;
		if (recorder) {
			recorder.ondataavailable = null;
			recorder.onerror = null;
			if (recorder.state !== 'inactive') recorder.stop();
		}
		this.media?.getTracks().forEach(track => track.stop());
		this.media = null;
		const socket = this.socket;
		this.socket = null;
		if (socket) {
			socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.onopen = null;
			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'stop' }));
			socket.close();
		}
		this.update({ phase: message ? 'error' : 'idle', message });
	}

	dispose(): void { this.disposed = true; this.stop(); }
}
