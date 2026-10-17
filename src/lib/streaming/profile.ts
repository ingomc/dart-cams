/** Shared by capture, compositor and local encoder so no stage silently downsizes. */
export const STREAM_PROFILE = {
	id: '1080p25-v1',
	width: 1920,
	height: 1080,
	fps: 25,
	// Browser → helper stays on loopback; allow headroom before the H.264 encode.
	recordingBitsPerSecond: 8_000_000,
	videoMaxBitsPerSecond: 3_000_000,
	videoBufferBits: 6_000_000,
	crf: 20,
	keyframeSeconds: 2,
} as const;
