export type CaptureMode = 'tab' | 'window';

export function captureModeForBrowser(userAgent: string): CaptureMode {
	return /Firefox\//i.test(userAgent) ? 'window' : 'tab';
}

export function acceptsCapture(settings: MediaTrackSettings & { mediaSource?: string }, mode: CaptureMode): boolean {
	// Firefox exposes mediaSource instead of displaySurface. Unknown sources must
	// not accidentally turn an intended window capture into a desktop broadcast.
	const surface = settings.displaySurface ?? settings.mediaSource;
	return surface === 'browser' || (mode === 'window' && surface === 'window');
}

export function needsCapturePreview(settings: MediaTrackSettings & { mediaSource?: string }, mode: CaptureMode): boolean {
	// Current Firefox on macOS omits both fields, even for a single window.
	// Keep the source local until the operator has checked its preview.
	return mode === 'window' && settings.displaySurface == null && settings.mediaSource == null;
}
