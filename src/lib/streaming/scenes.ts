export type StreamScene = 'start' | 'live' | 'pause';

export const streamScenes = [
	{ value: 'start', label: 'Startbild', icon: 'M4 4h16v16H4zM9 8l6 4-6 4V8Z' },
	{ value: 'live', label: 'Live', icon: 'M15 8l6-3v14l-6-3M3 6h12v12H3z' },
	{ value: 'pause', label: 'Pause', icon: 'M7 5v14M17 5v14' },
] as const;

export function streamSlateUrl(scene: Exclude<StreamScene, 'live'>, base = ''): string {
	return `${base}/stream-slates/${scene}-v1.png`;
}

/** Fit both portrait tab captures and holding cards without cropping names or scores. */
export function fitStreamFrame(width: number, height: number, outputWidth = 1280, outputHeight = 720) {
	if (width <= 0 || height <= 0) return null;
	const scale = Math.min(outputWidth / width, outputHeight / height);
	return { x: (outputWidth - width * scale) / 2, y: (outputHeight - height * scale) / 2,
		width: width * scale, height: height * scale };
}
