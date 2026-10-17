import type { StreamScene } from './scenes';

export const STREAM_HELPER_URL = 'http://127.0.0.1:8732';
export const DEFAULT_VIEWER_URL = 'http://darts-owncast-5e7884-202-61-206-24.sslip.io/';
export const DEFAULT_RTMP_URL = 'rtmp://darts-owncast-5e7884-202-61-206-24.sslip.io:1935/live';
export const MAX_STREAM_BUFFER = 8 * 1024 * 1024;

export type StreamPhase = 'idle' | 'selecting' | 'previewing' | 'connecting' | 'live' | 'error';
export type StreamState = {
	phase: StreamPhase;
	scene: StreamScene;
	helperConnected: boolean;
	configured: boolean;
	busy: boolean;
	message: string;
	viewerUrl: string;
	rtmpUrl: string;
};
export const initialStreamState: StreamState = {
	phase: 'idle', scene: 'start', helperConnected: false, configured: false, busy: false, message: '',
	viewerUrl: DEFAULT_VIEWER_URL, rtmpUrl: DEFAULT_RTMP_URL,
};

export function validateStreamDestination(viewerUrl: string, rtmpUrl: string) {
	let viewer: URL, rtmp: URL;
	try { viewer = new URL(viewerUrl); rtmp = new URL(rtmpUrl); }
	catch { throw new Error('Bitte gültige Zuschauer- und RTMP-Adressen eingeben.'); }
	if (!['http:', 'https:'].includes(viewer.protocol) || viewer.username || viewer.password || viewer.hash || viewer.search) {
		throw new Error('Der Zuschauer-Link muss eine HTTP- oder HTTPS-Adresse ohne Zugangsdaten sein.');
	}
	if (!['rtmp:', 'rtmps:'].includes(rtmp.protocol) || rtmp.username || rtmp.password || rtmp.search || rtmp.hash || rtmp.pathname.replace(/\/$/, '') !== '/live') {
		throw new Error('RTMP-Adresse im Format rtmp://server:1935/live eingeben, ohne Stream-Key.');
	}
	return { viewerUrl: viewer.href, rtmpUrl: rtmp.href.replace(/\/$/, '') };
}

export function validateStreamKey(key: unknown): string {
	if (typeof key !== 'string' || !/^[A-Za-z0-9_.~-]{1,256}$/.test(key)) {
		throw new Error('Bitte einen gültigen Owncast-Stream-Key eingeben (Buchstaben, Zahlen, -, _, . oder ~).');
	}
	return key;
}

export function recordingMimeType(supported: (mime: string) => boolean): string {
	return ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(supported) ?? '';
}

export function isStreamActive(phase: StreamPhase): boolean {
	return phase === 'selecting' || phase === 'previewing' || phase === 'connecting' || phase === 'live';
}
