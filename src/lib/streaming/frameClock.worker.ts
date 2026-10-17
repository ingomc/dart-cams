// A separate clock keeps holding cards producing frames even when the tab has no
// visual changes. requestAnimationFrame alone pauses in background tabs.
setInterval(() => postMessage('frame'), 1000 / 30);

export {};
