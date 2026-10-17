import { fitStreamFrame, streamSlateUrl, type StreamScene } from './scenes';

export interface StreamOutput {
	start(): Promise<MediaStream>;
	setScene(scene: StreamScene): void;
	dispose(): void;
}

export type StreamOutputFactory = (source: MediaStream, scene: StreamScene, onError: () => void) => StreamOutput;

function loadSlate(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const clean = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
		const abort = () => { clean(); image.removeAttribute('src'); reject(new DOMException('Aborted', 'AbortError')); };
		image.onload = () => { clean(); resolve(image); };
		image.onerror = () => { clean(); reject(new Error('Sendebilder konnten nicht geladen werden. Bitte die Seite neu laden und erneut starten.')); };
		if (signal.aborted) { abort(); return; }
		signal.addEventListener('abort', abort, { once: true });
		image.src = url;
	});
}

/** Only this offscreen canvas is recorded. The operator's page keeps showing cameras. */
export class StreamCompositor implements StreamOutput {
	private readonly canvas = document.createElement('canvas');
	private readonly video = document.createElement('video');
	private readonly abort = new AbortController();
	private context: CanvasRenderingContext2D | null = null;
	private slates: { start: HTMLImageElement; pause: HTMLImageElement } | null = null;
	private output: MediaStream | null = null;
	private clock: Worker | null = null;
	private disposed = false;

	constructor(source: MediaStream, private scene: StreamScene, private readonly onError: () => void, private readonly base = '') {
		this.canvas.width = 1280;
		this.canvas.height = 720;
		this.video.muted = true;
		this.video.playsInline = true;
		this.video.srcObject = source;
	}

	async start(): Promise<MediaStream> {
		try {
			this.context = this.canvas.getContext('2d', { alpha: false });
			if (!this.context || !this.canvas.captureStream) throw new Error('Sendebilder werden hier nicht unterstützt. Bitte Chrome oder Edge verwenden.');
			// Preload both cards before opening the publisher. A missing card must never
			// silently expose the live view when the operator selected a holding screen.
			const [start, pause] = await Promise.all([
				loadSlate(streamSlateUrl('start', this.base), this.abort.signal),
				loadSlate(streamSlateUrl('pause', this.base), this.abort.signal),
				this.video.play(),
			]);
			if (this.disposed) throw new DOMException('Aborted', 'AbortError');
			this.slates = { start, pause };
			this.output = this.canvas.captureStream(30);
			this.render();
			this.clock = new Worker(new URL('./frameClock.worker.ts', import.meta.url), { type: 'module' });
			this.clock.onmessage = () => {
				if (this.disposed) return;
				try { this.render(); } catch { this.onError(); }
			};
			this.clock.onerror = () => { if (!this.disposed) this.onError(); };
			return this.output;
		} catch (error) { this.dispose(); throw error; }
	}

	setScene(scene: StreamScene): void {
		if (this.disposed) return;
		this.scene = scene;
		this.render();
	}

	private render(): void {
		if (!this.context || !this.slates) return;
		const image = this.scene === 'live' ? this.video : this.slates[this.scene];
		const width = image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth;
		const height = image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight;
		const frame = fitStreamFrame(width, height);
		// Keep a complete previous frame if the selected tab is temporarily resizing.
		if (!frame || (image === this.video && this.video.readyState < 2)) return;
		this.context.fillStyle = '#151719';
		this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.abort.abort();
		this.clock?.terminate();
		this.clock = null;
		this.output?.getTracks().forEach(track => track.stop());
		this.output = null;
		this.video.pause();
		this.video.srcObject = null;
		this.slates = null;
		this.context = null;
		this.canvas.width = this.canvas.height = 0;
	}
}
