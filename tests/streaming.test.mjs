import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowedOrigin, createStreamingServer, ffmpegArguments } from '../scripts/stream-helper.mjs';
import { validateStreamDestination, validateStreamKey, recordingMimeType, DEFAULT_VIEWER_URL, DEFAULT_RTMP_URL } from '../src/lib/streaming/protocol.ts';
import { LivestreamClient } from '../src/lib/streaming/client.ts';
import { fitStreamFrame, streamSlateUrl } from '../src/lib/streaming/scenes.ts';
import { acceptsCapture, captureModeForBrowser, needsCapturePreview } from '../src/lib/streaming/capture.ts';
import { STREAM_PROFILE } from '../src/lib/streaming/profile.ts';

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
  test('encoding preserves aspect ratio and sends video-only H264 with two-second keyframes', () => {
    const args = ffmpegArguments('rtmp://example.test/live/test');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args[args.indexOf('-g') + 1]).toBe('50');
    expect(args[args.indexOf('-vf') + 1]).toContain('force_original_aspect_ratio=decrease');
    expect(args[args.indexOf('-vf') + 1]).toContain('pad=1920:1080');
    expect(args[args.indexOf('-vf') + 1]).toContain('fps=25');
    expect(args[args.indexOf('-crf') + 1]).toBe('20');
    expect(args[args.indexOf('-maxrate') + 1]).toBe('3000000');
    expect(args[args.indexOf('-bufsize') + 1]).toBe('6000000');
    expect(args).not.toContain('-b:v');
    expect(args).toContain('-an');
    expect(args.at(-1)).toBe('rtmp://example.test/live/test');
    expect(recordingMimeType(mime => mime.includes('vp9'))).toBe('video/webm;codecs=vp9');
    expect(recordingMimeType(() => false)).toBe('');
  });
  test.skipIf(!Bun.which('ffmpeg') || !Bun.which('ffprobe'))('real encoder produces H264 without an audio track', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dartcams-video-only-'));
    try {
      const input = spawnSync(Bun.which('ffmpeg'), [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25',
        '-frames:v', '5', '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-f', 'webm', 'pipe:1',
      ], { timeout: 20_000 });
      expect(input.status, input.stderr?.toString()).toBe(0);
      const output = join(folder, 'stream.flv');
      const encoded = spawnSync(Bun.which('ffmpeg'), ffmpegArguments(output), { input: input.stdout, timeout: 20_000 });
      expect(encoded.status, encoded.stderr?.toString()).toBe(0);
      const probe = spawnSync(Bun.which('ffprobe'), ['-v', 'error', '-show_streams', '-of', 'json', output], { timeout: 10_000 });
      expect(probe.status, probe.stderr?.toString()).toBe(0);
      const { streams } = JSON.parse(probe.stdout.toString());
      expect(streams.map(stream => stream.codec_type)).toEqual(['video']);
      expect(streams[0]).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '25/1' });
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  test('a WebSocket cannot start without the helper token; encoder failures release the publisher', async () => {
    const base = helper({ ffmpeg: '/nonexistent/dartcams-ffmpeg', initialConfig: { ...destination, streamKey: 'test-only-secret' } });
    const { token } = await discover(base);
    const attempt = (value, profileId = STREAM_PROFILE.id) => new Promise((resolve, reject) => {
      const ws = new WebSocket(`${base.replace('http:', 'ws:')}/v1/stream`, { headers: { origin } });
      const messages = [];
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start', token: value, profileId }));
      ws.onmessage = event => messages.push(JSON.parse(event.data));
      ws.onclose = () => resolve(messages);
      ws.onerror = reject;
    });
    expect(await attempt('invalid')).toContainEqual({ type: 'error', message: 'Helfer erneut verbinden.' });
    const outdated = await attempt(token, 'old-profile');
    expect(outdated.some(message => message.type === 'error' && message.message.includes('aktualisieren'))).toBe(true);
    expect((await discover(base)).active).toBe(false);
    const failed = await attempt(token);
    expect(failed.some(message => message.type === 'error')).toBe(true);
    expect(JSON.stringify(failed)).not.toContain('test-only-secret');
    // Child-process close is dispatched on the following event-loop tick.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((await discover(base)).active).toBe(false);
  });
  test('a stale 720p helper cannot silently start a stream advertised as 1080p', async () => {
    const savedFetch = globalThis.fetch;
    const client = new LivestreamClient(() => {});
    let profileId;
    globalThis.fetch = async () => Response.json({ service: 'dartcams-stream', version: 1, token: 'a'.repeat(64),
      configured: true, ffmpegAvailable: true, ...destination, profileId });
    try {
      await client.connect();
      expect(client.state.helperConnected).toBe(true);
      expect(client.state.configured).toBe(false);
      expect(client.state.message).toContain('neu starten');
      profileId = STREAM_PROFILE.id;
      await client.connect();
      expect(client.state.configured).toBe(true);
      expect(client.state.message).toBe('');
    } finally { client.dispose(); globalThis.fetch = savedFetch; }
  });
});

describe('capture lifecycle', () => {
  test('Firefox window capture uses standard or Mozilla settings without allowing a desktop or unknown source', () => {
    expect(captureModeForBrowser('Mozilla/5.0 Gecko/20100101 Firefox/144.0')).toBe('window');
    expect(captureModeForBrowser('Mozilla/5.0 Chrome/141.0 Safari/537.36')).toBe('tab');
    expect(captureModeForBrowser('Mozilla/5.0 Chrome/141.0 Edg/141.0')).toBe('tab');
    expect(acceptsCapture({ displaySurface: 'browser' }, 'tab')).toBe(true);
    expect(acceptsCapture({ displaySurface: 'window' }, 'tab')).toBe(false);
    expect(acceptsCapture({ displaySurface: 'window' }, 'window')).toBe(true);
    expect(acceptsCapture({ mediaSource: 'window' }, 'window')).toBe(true);
    for (const settings of [{ displaySurface: 'monitor' }, { mediaSource: 'screen' }, {}, { mediaSource: 'camera' }, { displaySurface: 'monitor', mediaSource: 'window' }]) {
      expect(acceptsCapture(settings, 'window')).toBe(false);
    }
    expect(needsCapturePreview({}, 'window')).toBe(true);
    for (const settings of [{ displaySurface: 'monitor' }, { mediaSource: 'screen' }, { mediaSource: 'camera' }, { displaySurface: 'unexpected' }]) {
      expect(needsCapturePreview(settings, 'window')).toBe(false);
    }
    expect(needsCapturePreview({}, 'tab')).toBe(false);
  });

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

describe('continuous broadcast scenes', () => {
  function captureFixture(settings = { displaySurface: 'browser' }, userAgent = '') {
    const saved = new Map(['navigator', 'MediaRecorder', 'WebSocket'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const recorders = [];
    const sockets = [];
    let stopped = 0;
    let onEnded;
    const track = { getSettings: () => settings, stop: () => stopped++, addEventListener(event, callback) { if (event === 'ended') onEnded = callback; } };
    const source = { getTracks: () => [track], getVideoTracks: () => [track] };
    let captureOptions;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent, mediaDevices: {
      getDisplayMedia: async options => { captureOptions = options; return source; },
    } } });
    globalThis.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor(media, options) { this.media = media; this.options = options; this.state = 'inactive'; this.stops = 0; recorders.push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.stops++; }
    };
    globalThis.WebSocket = class {
      static OPEN = 1;
      constructor() { this.readyState = 1; this.bufferedAmount = 0; this.messages = []; sockets.push(this); }
      send(data) { this.messages.push(data); }
      close() { this.readyState = 3; }
      receive(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    };
    return { source, recorders, sockets, endCapture() { onEnded?.(); }, get captureOptions() { return captureOptions; }, get stopped() { return stopped; }, restore() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    } };
  }

  test('Firefox without source metadata stays local until its preview is confirmed', async () => {
    const fixture = captureFixture({ width: 1920, height: 1080 }, 'Firefox/144.0');
    let outputs = 0;
    const client = new LivestreamClient(() => {}, source => {
      outputs++;
      return { start: async () => source, setScene() {}, dispose() {} };
    });
    client.state.configured = true;
    try {
      const starting = client.start();
      await Promise.resolve();
      expect(client.state.phase).toBe('previewing');
      expect(client.capturePreview).toBe(fixture.source);
      expect(outputs).toBe(0);
      expect(fixture.sockets).toHaveLength(0);
      expect(fixture.recorders).toHaveLength(0);
      await client.start();
      client.confirmCapture();
      await starting;
      expect(outputs).toBe(1);
      expect(fixture.sockets).toHaveLength(1);
      expect(client.capturePreview).toBeNull();
      fixture.sockets[0].receive({ type: 'ready' });
      fixture.sockets[0].receive({ type: 'live' });
      expect(client.state.phase).toBe('live');
      client.confirmCapture();
      expect(fixture.recorders).toHaveLength(1);
    } finally { client.dispose(); fixture.restore(); }
  });

  test.each(['stop', 'ended', 'dispose'])('Firefox preview %s releases capture and cannot publish after a late confirmation', async action => {
    const fixture = captureFixture({}, 'Firefox/144.0');
    const client = new LivestreamClient(() => {}, () => { throw new Error('Unconfirmed capture must remain local'); });
    client.state.configured = true;
    try {
      const starting = client.start();
      await Promise.resolve();
      expect(client.state.phase).toBe('previewing');
      if (action === 'ended') fixture.endCapture();
      else client[action]();
      client.confirmCapture();
      await starting;
      expect(fixture.stopped).toBe(1);
      expect(fixture.sockets).toHaveLength(0);
      expect(fixture.recorders).toHaveLength(0);
      expect(client.capturePreview).toBeNull();
      expect(client.state.phase).toBe('idle');
    } finally { client.dispose(); fixture.restore(); }
  });

  test('Firefox window source reaches the recorder and stops cleanly', async () => {
    const fixture = captureFixture({ mediaSource: 'window' }, 'Mozilla/5.0 Gecko/20100101 Firefox/144.0');
    const client = new LivestreamClient(() => {}, source => ({
      start: async () => source, setScene() {}, dispose() {},
    }));
    client.state.configured = true;
    try {
      await client.start();
      expect(fixture.captureOptions.audio).toBe(false);
      expect(fixture.captureOptions.video.displaySurface).toBeUndefined();
      expect(fixture.captureOptions.video).toMatchObject({ width: 1920, height: 1080, frameRate: { ideal: 25, max: 25 } });
      expect(fixture.sockets).toHaveLength(1);
      fixture.sockets[0].receive({ type: 'ready' });
      fixture.sockets[0].receive({ type: 'live' });
      expect(client.state.phase).toBe('live');
      expect(fixture.recorders[0].state).toBe('recording');
      expect(fixture.recorders[0].options.videoBitsPerSecond).toBe(8_000_000);
      client.stop();
      expect(fixture.stopped).toBe(1);
      expect(fixture.recorders[0].state).toBe('inactive');
    } finally { client.dispose(); fixture.restore(); }
  });

  test('Firefox desktop selection is stopped before the compositor, socket or recorder starts', async () => {
    const fixture = captureFixture({ mediaSource: 'screen' }, 'Firefox/144.0');
    const client = new LivestreamClient(() => {}, () => { throw new Error('Desktop must never reach the compositor'); });
    client.state.configured = true;
    try {
      await client.start();
      expect(client.state.phase).toBe('error');
      expect(client.state.message).toContain('Browserfenster mit Dartcams');
      expect(fixture.stopped).toBe(1);
      expect(fixture.sockets).toHaveLength(0);
      expect(fixture.recorders).toHaveLength(0);
    } finally { client.dispose(); fixture.restore(); }
  });

  test('start, live and pause share one output, recorder and connection; stop releases capture', async () => {
    const fixture = captureFixture();
    const broadcast = { id: 'composited-output' };
    let selected;
    let disposed = 0;
    const client = new LivestreamClient(() => {}, (source, scene) => {
      expect(source).toBe(fixture.source);
      selected = scene;
      return { start: async () => broadcast, setScene: scene => { selected = scene; }, dispose: () => disposed++ };
    });
    client.state.configured = true;
    try {
      await client.start();
      expect(selected).toBe('start');
      const socket = fixture.sockets[0];
      socket.onopen();
      socket.receive({ type: 'ready' });
      socket.receive({ type: 'live' });
      for (const scene of ['live', 'pause', 'start', 'live']) {
        client.setScene(scene);
        expect(selected).toBe(scene);
        expect(client.state.scene).toBe(scene);
        expect(client.state.phase).toBe('live');
      }
      expect(fixture.sockets).toHaveLength(1);
      expect(fixture.recorders).toHaveLength(1);
      expect(fixture.recorders[0].media).toBe(broadcast);
      expect(fixture.recorders[0].stops).toBe(0);
      expect(socket.messages).toHaveLength(1);
      expect(JSON.parse(socket.messages[0]).profileId).toBe(STREAM_PROFILE.id);
      expect(fixture.stopped).toBe(0);
      client.stop();
      expect(fixture.stopped).toBe(1);
      expect(disposed).toBe(1);
      expect(fixture.recorders[0].stops).toBe(1);
      expect(client.state.scene).toBe('start');
    } finally { client.dispose(); fixture.restore(); }
  });

  test('missing holding cards abort before any publisher or recorder can expose the tab', async () => {
    const fixture = captureFixture();
    const client = new LivestreamClient(() => {}, () => ({
      start: async () => { throw new Error('Sendebilder konnten nicht geladen werden.'); }, setScene() {}, dispose() {},
    }));
    client.state.configured = true;
    client.setScene('pause');
    try {
      await client.start();
      expect(client.state.phase).toBe('error');
      expect(client.state.message).toContain('Sendebilder');
      expect(fixture.stopped).toBe(1);
      expect(fixture.sockets).toHaveLength(0);
      expect(fixture.recorders).toHaveLength(0);
    } finally { client.dispose(); fixture.restore(); }
  });

  test('cancel during image preparation cannot start a late stream', async () => {
    const fixture = captureFixture();
    let ready;
    let preparing;
    const prepared = new Promise(resolve => { preparing = resolve; });
    const client = new LivestreamClient(() => {}, () => ({
      start: () => { preparing(); return new Promise(resolve => { ready = resolve; }); }, setScene() {}, dispose() {},
    }));
    client.state.configured = true;
    try {
      const starting = client.start();
      await prepared;
      client.stop();
      ready({ id: 'late-output' });
      await starting;
      expect(fixture.stopped).toBe(1);
      expect(fixture.sockets).toHaveLength(0);
      expect(client.state.phase).toBe('idle');
    } finally { client.dispose(); fixture.restore(); }
  });

  test('holding assets respect a deployment base path and frames retain their full aspect ratio', () => {
    expect(streamSlateUrl('pause', '/dart-cams')).toBe('/dart-cams/stream-slates/pause-v1.png');
    expect(fitStreamFrame(1920, 1080)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(fitStreamFrame(3840, 2160)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(fitStreamFrame(720, 1280)).toEqual({ x: 656.25, y: 0, width: 607.5, height: 1080 });
    expect(fitStreamFrame(0, 0)).toBeNull();
  });
});
