import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DEFAULT_VIEWER_URL, DEFAULT_RTMP_URL, MAX_STREAM_BUFFER, validateStreamDestination, validateStreamKey } from '../src/lib/streaming/protocol.ts';

export function allowedOrigin(origin, extraOrigins = []) {
  if (['https://cams.ingomc.de', 'https://ingomc.github.io', ...extraOrigins].includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export function ffmpegArguments(target) {
  return ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:1',
    '-fflags', '+genpts', '-thread_queue_size', '256', '-f', 'webm', '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p',
    '-b:v', '3000k', '-maxrate', '3000k', '-bufsize', '6000k', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-shortest',
    '-rw_timeout', '15000000', '-f', 'flv', '-flvflags', 'no_duration_filesize', target];
}

export function createStreamingServer({ port = 8732, ffmpeg = Bun.which('ffmpeg'), extraOrigins = [], initialConfig = null } = {}) {
  const token = randomBytes(32).toString('hex');
  let config = { viewerUrl: DEFAULT_VIEWER_URL, rtmpUrl: DEFAULT_RTMP_URL, streamKey: '' };
  if (initialConfig) config = { ...validateStreamDestination(initialConfig.viewerUrl, initialConfig.rtmpUrl), streamKey: validateStreamKey(initialConfig.streamKey) };
  let publisher = null;
  const sockets = new Set();
  const authenticated = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
  const metadata = () => ({ service: 'dartcams-stream', version: 1, token, configured: !!config.streamKey,
    ffmpegAvailable: !!ffmpeg, active: !!publisher, viewerUrl: config.viewerUrl, rtmpUrl: config.rtmpUrl });
  const send = (ws, message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };

  function stop(ws, error = '') {
    if (ws.data.stopped) return;
    ws.data.stopped = true;
    clearTimeout(ws.data.authTimer);
    clearInterval(ws.data.watchdog);
    const child = ws.data.child;
    if (child) {
      child.stdin.destroy();
      child.kill('SIGINT');
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
      killTimer.unref();
      child.once('close', () => {
        clearTimeout(killTimer);
        if (publisher === ws) publisher = null;
      });
    }
    if (!child && publisher === ws) publisher = null;
    send(ws, error ? { type: 'error', message: error } : { type: 'stopped' });
    ws.close(error ? 1011 : 1000, error ? 'stream failed' : 'stream stopped');
  }

  function start(ws) {
    if (publisher) return stop(ws, 'Es läuft bereits ein Stream. Bitte zuerst im anderen Tab stoppen.');
    if (!config.streamKey) return stop(ws, 'Bitte zuerst den Stream-Key hinterlegen.');
    if (!ffmpeg) return stop(ws, 'FFmpeg fehlt auf diesem Computer.');
    publisher = ws;
    ws.data.lastData = Date.now();
    ws.data.startedAt = Date.now();
    ws.data.pendingBytes = 0;
    // No shell, no raw encoder output in logs: FFmpeg errors can include the publish key.
    let child;
    try { child = spawn(ffmpeg, ffmpegArguments(`${config.rtmpUrl}/${config.streamKey}`), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
    catch { return stop(ws, 'FFmpeg konnte nicht gestartet werden.'); }
    ws.data.child = child;
    ws.data.failure = 'Owncast-Verbindung beendet. RTMP-Adresse, Port und Stream-Key prüfen.';
    child.stderr.on('data', (data) => {
      const text = data.toString();
      if (/Connection refused|Connection timed out|No route to host|Network is unreachable/i.test(text)) ws.data.failure = 'Owncast nicht erreichbar. RTMP-Port und Serveradresse prüfen.';
    });
    let progress = '';
    child.stdout.on('data', (data) => {
      progress = (progress + data.toString()).slice(-8192);
      if (!ws.data.live && /(?:^|\n)frame=[1-9]\d*\s*\n/.test(progress) && !ws.data.stopped) {
        ws.data.live = true;
        send(ws, { type: 'live' });
      }
    });
    child.stdin.on('error', () => stop(ws, ws.data.failure));
    child.on('error', () => stop(ws, 'FFmpeg konnte nicht gestartet werden. Installation prüfen.'));
    child.on('exit', () => { if (!ws.data.stopped) stop(ws, ws.data.failure); });
    ws.data.watchdog = setInterval(() => {
      if (!ws.data.live && Date.now() - ws.data.startedAt > 25_000) stop(ws, 'Owncast antwortet nicht. RTMP-Port und Stream-Key prüfen.');
      else if (Date.now() - ws.data.lastData > 30_000) stop(ws, 'Keine Bilddaten mehr empfangen. Tab-Freigabe erneut starten.');
    }, 1000);
    send(ws, { type: 'ready' });
  }

  const server = Bun.serve({
    hostname: '127.0.0.1', port, maxRequestBodySize: 16_384,
    async fetch(request, server) {
      const url = new URL(request.url);
      const origin = request.headers.get('origin');
      if (url.hostname !== '127.0.0.1' || Number(url.port) !== server.port || !allowedOrigin(origin, extraOrigins)) return new Response('Forbidden', { status: 403 });
      const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Private-Network': 'true' };
      const json = (value, status = 200) => Response.json(value, { status, headers });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (url.pathname === '/v1/discovery' && request.method === 'GET') return json(metadata());
      if (url.pathname === '/v1/config' && request.method === 'POST') {
        if (!authenticated(request.headers.get('authorization')?.replace(/^Bearer /, ''))) return json({ error: 'Helfer erneut verbinden.' }, 401);
        if (publisher) return json({ error: 'Konfiguration erst nach dem Stoppen ändern.' }, 409);
        try {
          const body = await request.json();
          const destination = validateStreamDestination(body.viewerUrl, body.rtmpUrl);
          // A retained key is only reused for the exact same destination.
          const key = body.streamKey || (destination.rtmpUrl === config.rtmpUrl ? config.streamKey : '');
          config = { ...destination, streamKey: validateStreamKey(key) };
          return json(metadata());
        } catch (error) { return json({ error: error instanceof Error ? error.message : 'Ungültige Konfiguration.' }, 400); }
      }
      if (url.pathname === '/v1/stream' && request.method === 'GET') {
        if (sockets.size >= 4) return json({ error: 'Zu viele Verbindungen.' }, 429);
        if (server.upgrade(request, { data: { authenticated: false, stopped: false } })) return;
      }
      return json({ error: 'Not found' }, 404);
    },
    websocket: {
      maxPayloadLength: 4 * 1024 * 1024,
      open(ws) {
        sockets.add(ws);
        ws.data.authTimer = setTimeout(() => stop(ws, 'Verbindungsfreigabe abgelaufen.'), 5000);
      },
      message(ws, data) {
        if (ws.data.stopped) return;
        if (typeof data === 'string') {
          let message;
          try { message = JSON.parse(data); } catch { return stop(ws, 'Ungültige Nachricht.'); }
          if (!ws.data.authenticated) {
            if (message.type !== 'start' || !authenticated(message.token)) return stop(ws, 'Helfer erneut verbinden.');
            ws.data.authenticated = true;
            clearTimeout(ws.data.authTimer);
            start(ws);
          } else if (message.type === 'stop') stop(ws);
          return;
        }
        if (!ws.data.authenticated || publisher !== ws || !ws.data.child) return stop(ws, 'Stream nicht freigegeben.');
        ws.data.lastData = Date.now();
        ws.data.pendingBytes += data.byteLength;
        if (ws.data.pendingBytes > MAX_STREAM_BUFFER) return stop(ws, 'Übertragung zu langsam. Stream gestoppt; bitte erneut versuchen.');
        const length = data.byteLength;
        ws.data.child.stdin.write(Buffer.from(data), () => { ws.data.pendingBytes -= length; });
      },
      close(ws) { stop(ws); sockets.delete(ws); },
    },
  });
  return { server, close() { for (const ws of sockets) stop(ws); server.stop(true); } };
}

if (import.meta.main) {
  const helper = createStreamingServer({ extraOrigins: (process.env.DARTCAMS_STREAM_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean) });
  console.log(`Dartcams Streaming-Helfer: http://127.0.0.1:${helper.server.port} · ${Bun.which('ffmpeg') ? 'FFmpeg bereit' : 'FFmpeg fehlt'}`);
  console.log('In Dartcams: Einstellungen → Livestream → Helfer verbinden. Stream-Key bleibt nur bis zum Neustart im Arbeitsspeicher.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { helper.close(); process.exit(0); });
}
