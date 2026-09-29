/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

function isLocalBridge(url) {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.origin !== self.location.origin;
}

const ASSETS = [
	...build, // the app itself
	...files  // everything in `static`
];

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
		// Replace legacy workers that still intercept loopback requests, even
		// while Dartcams is open in another tab or installed as a PWA.
		await self.skipWaiting();
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	// Remove previous cached data from disk
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil((async () => {
        await deleteOldCaches();
        const cache = await caches.open(CACHE);
        for (const request of await cache.keys()) if (isLocalBridge(new URL(request.url))) await cache.delete(request);
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
	// ignore POST requests etc
	if (event.request.method !== 'GET' || isLocalBridge(new URL(event.request.url))) return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// `build`/`files` can always be served from the cache
		if (ASSETS.includes(url.pathname)) {
			return cache.match(url.pathname);
		}

		// for everything else, try the network first, but
		// fall back to the cache if we're offline
		try {
			const response = await fetch(event.request);

			if (response.status === 200) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch {
			return (await cache.match(event.request)) ?? Response.error();
		}
	}

	event.respondWith(respond());
});
