import { STREAM_PROFILE } from './profile';

// A separate clock keeps holding cards producing frames even when the tab has no
// visual changes. requestAnimationFrame alone pauses in background tabs.
setInterval(() => postMessage('frame'), 1000 / STREAM_PROFILE.fps);
