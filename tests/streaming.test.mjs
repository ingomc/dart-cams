import { afterEach, describe, expect, test } from 'bun:test';
import { allowedOrigin, createStreamingServer, ffmpegArguments } from '../scripts/stream-helper.mjs';
import { validateStreamDestination, validateStreamKey, recordingMimeType, DEFAULT_VIEWER_URL, DEFAULT_RTMP_URL } from '../src/lib/streaming/protocol.ts';
import { LivestreamClient } from '../src/lib/streaming/client.ts';

const destination = { viewerUrl: DEFAULT_VIEWER_URL, rtmpUrl: DEFAULT_RTMP_URL };
const origin = 'https://cams.ingomc.de';
const helpers = [];
afterEach(() => { for (const helper of helpers.splice(0)) helper.close(); });
function helper(options = {}) {
  const value = createStreamingServer({ port: 0, ...options });
  helpers.push(value);
  return `http://127.0.0.1:${value.server.port}`;
}
async function discover(base) { return (await fetch(`${base}/v1/discovery`, { headers: { origin } })).json(); }
async function configure(base, token, body) {
  return fetch(`${base}/v1/config`, { method: 'POST', headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('stream destination and local authentication', () => {
  test('only Owncast publish URLs, never a key in the destination', () => {
    expect(validateStreamDestination(DEFAULT_VIEWER_URL, `${DEFAULT_RTMP_URL}/`)).toEqual(destination);
    for (const url of ['file:///tmp/stream', 'https://example.com/live', 'rtmp://user:password@example.com/live', `${DEFAULT_RTMP_URL}/secret`, `${DEFAULT_RTMP_URL}?key=secret`]) {
      expect(() => validateStreamDestination(DEFAULT_VIEWER_URL, url)).toThrow();
    }
    expect(() => validateStreamKey('key\nother')).toThrow();
    expect(() => validateStreamKey('')).toThrow();
  });
  test('origins are exact; local development is allowed', () => {
    expect(allowedOrigin(origin)).toBe(true);
    expect(allowedOrigin('http://127.0.0.1:5195')).toBe(true);
    expect(allowedOrigin('https://ingomc.github.io')).toBe(true);
    for (const value of [null, 'null', 'https://cams.ingomc.de.attacker.test', 'http://127.0.0.1.attacker.test', 'https://attacker.test']) expect(allowedOrigin(value)).toBe(false);
  });
  test('unauthorized origins and tokens cannot configure or discover', async () => {
    const base = helper();
    const blocked = await fetch(`${base}/v1/discovery`, { headers: { origin: 'https://attacker.test' } });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.has('access-control-allow-origin')).toBe(false);
    const forged = await fetch(`${base}/v1/discovery`, { headers: { origin, host: 'attacker.test' } });
    expect(forged.status).toBe(403);
    for (const token of ['bad', 'é'.repeat(64)]) {
      expect((await configure(base, token, { ...destination, streamKey: 'test-key' })).status).toBe(401);
    }
  });
  test('keys stay in helper memory, cannot leak in responses or move to another server implicitly', async () => {
    const base = helper();
    const { token } = await discover(base);
    const saved = await configure(base, token, { ...destination, streamKey: 'test-only-secret' });
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain('test-only-secret');
    expect((await discover(base)).configured).toBe(true);
    const moved = await configure(base, token, { ...destination, rtmpUrl: 'rtmp://other.test/live', streamKey: '' });
    expect(moved.status).toBe(400);
    expect((await discover(base)).rtmpUrl).toBe(destination.rtmpUrl);
    expect((await configure(base, token, { ...destination, streamKey: '' })).status).toBe(200);
    expect((await discover(helper())).configured).toBe(false);
  });
  test('encoding preserves aspect ratio and sends silent AAC with H264 and two-second keyframes', () => {
    const args = ffmpegArguments('rtmp://example.test/live/test');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args[args.indexOf('-g') + 1]).toBe('60');
    expect(args[args.indexOf('-vf') + 1]).toContain('force_original_aspect_ratio=decrease');
    expect(args).toContain('anullsrc=r=44100:cl=stereo');
    expect(args.at(-1)).toBe('rtmp://example.test/live/test');
    expect(recordingMimeType(mime => mime.includes('vp9'))).toBe('video/webm;codecs=vp9');
    expect(recordingMimeType(() => false)).toBe('');
  });
  test('a WebSocket cannot start without the helper token; encoder failures release the publisher', async () => {
    const base = helper({ ffmpeg: '/nonexistent/dartcams-ffmpeg', initialConfig: { ...destination, streamKey: 'test-only-secret' } });
    const { token } = await discover(base);
    const attempt = (value) => new Promise((resolve, reject) => {
      const ws = new WebSocket(`${base.replace('http:', 'ws:')}/v1/stream`, { headers: { origin } });
      const messages = [];
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start', token: value }));
      ws.onmessage = event => messages.push(JSON.parse(event.data));
      ws.onclose = () => resolve(messages);
      ws.onerror = reject;
    });
    expect(await attempt('invalid')).toContainEqual({ type: 'error', message: 'Helfer erneut verbinden.' });
    const failed = await attempt(token);
    expect(failed.some(message => message.type === 'error')).toBe(true);
    expect(JSON.stringify(failed)).not.toContain('test-only-secret');
    // Child-process close is dispatched on the following event-loop tick.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((await discover(base)).active).toBe(false);
  });
});

describe('capture lifecycle', () => {
  test('stop during the browser chooser discards late capture and stops all tracks', async () => {
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const previousRecorder = globalThis.MediaRecorder;
    let resolveCapture;
    let stopped = 0;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
      getDisplayMedia: () => new Promise(resolve => { resolveCapture = resolve; }),
    } } });
    globalThis.MediaRecorder = class { static isTypeSupported() { return true; } };
    const client = new LivestreamClient(() => {});
    client.state.configured = true;
    try {
      const starting = client.start();
      expect(client.state.phase).toBe('selecting');
      client.stop();
      resolveCapture({ getTracks: () => [{ stop: () => stopped++ }] });
      await starting;
      expect(stopped).toBe(1);
      expect(client.state.phase).toBe('idle');
    } finally {
      client.dispose();
      if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
      else delete globalThis.navigator;
      globalThis.MediaRecorder = previousRecorder;
    }
  });
  test('full-screen captures are rejected before connecting or recording', async () => {
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const previousRecorder = globalThis.MediaRecorder;
    let stopped = 0;
    const track = { getSettings: () => ({ displaySurface: 'monitor' }), stop: () => stopped++ };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
      getDisplayMedia: async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }),
    } } });
    globalThis.MediaRecorder = class { static isTypeSupported() { return true; } };
    const client = new LivestreamClient(() => {});
    client.state.configured = true;
    try {
      await client.start();
      expect(client.state.phase).toBe('error');
      expect(client.state.message).toContain('Dartcams-Browser-Tab');
      expect(stopped).toBe(1);
    } finally {
      client.dispose();
      if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
      else delete globalThis.navigator;
      globalThis.MediaRecorder = previousRecorder;
    }
  });
});
