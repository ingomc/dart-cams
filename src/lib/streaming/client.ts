import { STREAM_HELPER_URL, MAX_STREAM_BUFFER, initialStreamState, isStreamActive, recordingMimeType, validateStreamDestination, type StreamState } from './protocol';
import { StreamCompositor, type StreamOutput, type StreamOutputFactory } from './compositor';
import type { StreamScene } from './scenes';
import { acceptsCapture, captureModeForBrowser, needsCapturePreview } from './capture';
import { STREAM_PROFILE } from './profile';

export class LivestreamClient {
	state = { ...initialStreamState };
	private token = '';
	private media: MediaStream | null = null;
	private output: StreamOutput | null = null;
	private recorder: MediaRecorder | null = null;
	private socket: WebSocket | null = null;
	private timeout: ReturnType<typeof setTimeout> | undefined;
	private generation = 0;
	private disposed = false;
	private approveCapture: ((approved: boolean) => void) | null = null;

	constructor(private readonly onChange: (state: StreamState) => void,
		private readonly createOutput: StreamOutputFactory = (source, scene, onError) => new StreamCompositor(source, scene, onError)) {}
	get captureMode() { return captureModeForBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''); }
	get capturePreview(): MediaStream | null { return this.state.phase === 'previewing' ? this.media : null; }
	confirmCapture(): void {
		const approve = this.approveCapture;
		this.approveCapture = null;
		approve?.(true);
	}
	private update(change: Partial<StreamState>) {
		this.state = { ...this.state, ...change };
		if (!this.disposed) this.onChange(this.state);
	}

	setScene(scene: StreamScene): void {
		if (this.disposed || !['start', 'live', 'pause'].includes(scene)) return;
		try {
			this.output?.setScene(scene);
			this.update({ scene });
		} catch { this.stop('Sendebild konnte nicht gewechselt werden. Bitte den Stream erneut starten.'); }
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

	private acceptMetadata(data: { service: string; version: number; profileId?: string; token: string; ffmpegAvailable: boolean; configured: boolean; viewerUrl: string; rtmpUrl: string }) {
		if (data.service !== 'dartcams-stream' || data.version !== 1 || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error();
		const destination = validateStreamDestination(data.viewerUrl, data.rtmpUrl);
		this.token = data.token;
		const compatible = data.profileId === STREAM_PROFILE.id;
		this.update({ ...destination, helperConnected: true, configured: !!data.configured && data.ffmpegAvailable && compatible,
			phase: 'idle', message: !compatible
				? 'Für 1080p bitte den Streaming-Helfer aktualisieren und neu starten („bun run stream:helper“). Danach erneut verbinden und den Stream-Key eintragen.'
				: data.ffmpegAvailable ? '' : 'FFmpeg fehlt auf diesem Computer. Bitte installieren und den Helfer neu starten.' });
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
			this.update({ phase: 'error', message: 'Bildfreigabe wird hier nicht unterstützt. Bitte Dartcams über HTTPS oder localhost in einem aktuellen Desktop-Browser öffnen.' });
			return;
		}
		const mimeType = recordingMimeType(type => MediaRecorder.isTypeSupported(type));
		if (!mimeType) {
			this.update({ phase: 'error', message: 'WebM-Aufnahme fehlt. Bitte einen aktuellen Firefox, Chrome oder Edge verwenden.' });
			return;
		}
		const generation = ++this.generation;
		const captureMode = this.captureMode;
		let preparingOutput = false;
		this.update({ phase: 'selecting', message: '' });
		try {
			const video = { frameRate: { ideal: STREAM_PROFILE.fps, max: STREAM_PROFILE.fps }, width: STREAM_PROFILE.width, height: STREAM_PROFILE.height };
			const captureOptions = captureMode === 'window' ? {
				video, audio: false,
			} : {
				video: { ...video, displaySurface: 'browser' }, audio: false,
				preferCurrentTab: true, selfBrowserSurface: 'include', monitorTypeSurfaces: 'exclude',
				surfaceSwitching: 'exclude', systemAudio: 'exclude',
			};
			const media = await navigator.mediaDevices.getDisplayMedia(captureOptions);
			if (generation !== this.generation || this.disposed) { media.getTracks().forEach(track => track.stop()); return; }
			this.media = media;
			const track = media.getVideoTracks()[0];
			const captureSettings = track?.getSettings();
			const previewRequired = !!captureSettings && needsCapturePreview(captureSettings, captureMode);
			if (!captureSettings || (!acceptsCapture(captureSettings, captureMode) && !previewRequired)) {
				this.stop(captureMode === 'window'
					? 'Bitte nur das Browserfenster mit Dartcams freigeben. Ganze Bildschirme werden nicht übertragen.'
					: 'Bitte den Dartcams-Browser-Tab auswählen. Ganze Bildschirme und Fenster werden nicht übertragen.');
				return;
			}
			track.addEventListener('ended', () => { if (generation === this.generation) this.stop(); }, { once: true });
			if (previewRequired) {
				const approved = new Promise<boolean>(resolve => { this.approveCapture = resolve; });
				this.update({ phase: 'previewing' });
				if (!(await approved) || generation !== this.generation || this.disposed) return;
			}
			this.update({ phase: 'connecting' });
			preparingOutput = true;
			this.timeout = setTimeout(() => { if (generation === this.generation) this.stop('Sendebilder konnten nicht vorbereitet werden. Bitte erneut starten.'); }, 15_000);
			const output = this.createOutput(media, this.state.scene, () => {
				if (generation === this.generation) this.stop('Die Bildübertragung ist abgebrochen. Bitte den Stream erneut starten.');
			});
			this.output = output;
			const broadcast = await output.start();
			if (generation !== this.generation || this.disposed) { output.dispose(); return; }
			output.setScene(this.state.scene);
			preparingOutput = false;
			clearTimeout(this.timeout);
			const socket = new WebSocket(`${STREAM_HELPER_URL.replace('http:', 'ws:')}/v1/stream`);
			this.socket = socket;
			this.timeout = setTimeout(() => { if (generation === this.generation) this.stop('Stream-Start dauert zu lange. Helfer und Owncast prüfen.'); }, 30_000);
			socket.onopen = () => {
				if (generation === this.generation) socket.send(JSON.stringify({ type: 'start', token: this.token, profileId: STREAM_PROFILE.id }));
			};
			socket.onmessage = event => {
				if (generation !== this.generation) return;
				let data: { type: string; message?: string };
				try { data = JSON.parse(event.data); } catch { this.stop('Ungültige Antwort des Streaming-Helfers.'); return; }
				if (data.type === 'ready') {
					if (this.recorder) return;
					try {
						const recorder = new MediaRecorder(broadcast, { mimeType, videoBitsPerSecond: STREAM_PROFILE.recordingBitsPerSecond });
						this.recorder = recorder;
						recorder.ondataavailable = chunk => {
							if (generation !== this.generation || socket.readyState !== WebSocket.OPEN || !chunk.data.size) return;
							if (socket.bufferedAmount + chunk.data.size > MAX_STREAM_BUFFER) { this.stop('Übertragung zu langsam. Bitte Stream erneut starten.'); return; }
							socket.send(chunk.data);
						};
						recorder.onerror = () => this.stop('Die Bildaufnahme ist abgebrochen. Bitte erneut starten.');
						recorder.start(500);
					} catch { this.stop('Die Bildaufnahme konnte nicht gestartet werden.'); }
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
			this.stop(preparingOutput ? error instanceof Error ? error.message : 'Sendebilder konnten nicht vorbereitet werden.' : error instanceof DOMException && error.name === 'NotAllowedError'
				? 'Bildfreigabe abgebrochen oder nicht erlaubt.' : 'Bildfreigabe fehlgeschlagen. Bitte die Browser- und Betriebssystemberechtigung zur Bildschirmaufnahme prüfen.');
		}
	}

	stop(message = ''): void {
		++this.generation;
		this.approveCapture?.(false);
		this.approveCapture = null;
		clearTimeout(this.timeout);
		const recorder = this.recorder;
		this.recorder = null;
		if (recorder) {
			recorder.ondataavailable = null;
			recorder.onerror = null;
			if (recorder.state !== 'inactive') recorder.stop();
		}
		this.output?.dispose();
		this.output = null;
		this.media?.getTracks().forEach(track => track.stop());
		this.media = null;
		const socket = this.socket;
		this.socket = null;
		if (socket) {
			socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.onopen = null;
			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'stop' }));
			socket.close();
		}
		this.update({ phase: message ? 'error' : 'idle', scene: 'start', message });
	}

	dispose(): void { this.disposed = true; this.stop(); }
}
