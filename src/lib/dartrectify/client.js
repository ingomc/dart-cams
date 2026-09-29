// @ts-nocheck
// Vendored from ingomc/DartRectify web/client.js; see docs/DARTRECTIFY.md.
/** DartRectify read-only browser client. No framework or build step required.
 * Keep this module on YOUR origin for cross-origin integration.
 * Call start() from an explicit user action on remote HTTPS sites (LNA permission).
 * Images are withheld on stale capture, lost server, or unconfirmed orientation.
 */
export class DartRectifyClient {
  constructor({baseUrl = 'http://127.0.0.1:8731', token, home, guest,
    onStatus = () => {}, onError = () => {}}) {
    const base = new URL(baseUrl);
    if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname))
      throw new Error('Nur HTTP-Loopback-Adressen sind erlaubt.');
    if (!/^[a-f\d]{32,128}$/i.test(token || '')) throw new Error('Ungültiges Sitzungstoken.');
    if ((!home && !guest) || (home && !(home instanceof HTMLImageElement)) || (guest && !(guest instanceof HTMLImageElement)))
      throw new TypeError('Mindestens ein HTMLImageElement für home oder guest ist erforderlich.');
    this.baseUrl = base.origin; this.token = token;
    this.onStatus = onStatus; this.onError = onError;
    this.running = false; this.epoch = 0; this.timer = null; this.controller = null;
    this.boards = [home, guest].map((image, i) => {
      if (!image) return null;
      const board = {image, id: i ? 'guest' : 'home', generation: null, session: null, retryAt: 0, loadingAt: 0};
      image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer'; image.hidden = true;
      board.load = () => { if (board.generation !== null) image.hidden = false; };
      board.error = () => { this.clear(board); board.retryAt = Date.now() + 1500; };
      image.addEventListener('load', board.load);
      image.addEventListener('error', board.error);
      return board;
    }).filter(Boolean);
    this.visibility = () => {
      if (!this.running) return;
      clearTimeout(this.timer); this.controller?.abort(); ++this.epoch;
      this.boards.forEach(b => this.clear(b));
      if (!document.hidden) this.poll(this.epoch);
    };
    document.addEventListener('visibilitychange', this.visibility);
  }
  clear(board) {
    board.generation = null; board.session = null; board.loadingAt = 0;
    board.image.hidden = true; board.image.removeAttribute('src');
  }
  start() {
    if (this.running) return;
    this.running = true; ++this.epoch;
    if (!document.hidden) this.poll(this.epoch);
  }
  stop() {
    this.running = false; ++this.epoch; clearTimeout(this.timer); this.controller?.abort();
    this.boards.forEach(b => this.clear(b));
  }
  destroy() {
    this.stop(); document.removeEventListener('visibilitychange', this.visibility);
    this.boards.forEach(b => { b.image.removeEventListener('load', b.load); b.image.removeEventListener('error', b.error); });
  }
  async poll(epoch) {
    if (!this.running || epoch !== this.epoch || document.hidden) return;
    const controller = new AbortController(); this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/status`, {
        headers: {Authorization: `Bearer ${this.token}`}, cache: 'no-store',
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
      });
      if (!response.ok) throw new Error(`DartRectify HTTP ${response.status}`);
      const status = await response.json();
      if (!this.running || epoch !== this.epoch) return;
      if (!Array.isArray(status.boards) || status.boards.length !== 2) throw new Error('Ungültige Serverantwort.');
      this.pollInterval = status.boards.some(board => board.darts) ? 100 : 500;
      for (const board of this.boards) {
        const current = status.boards.find(s => s.id === board.id);
        if (current?.ready !== true || current.source_age_ms < 0 || current.source_age_ms > status.stale_after_ms) {
          this.clear(board); continue;
        }
        // A disconnected MJPEG element may keep its last frame. Status freshness
        // and server-side generation are authoritative, not img.complete.
        if (board.image.hidden && board.loadingAt && Date.now() - board.loadingAt > 4000) this.clear(board);
        // Watch the actual connection, not just the camera. An MJPEG <img> can
        // retain a still image after clean EOF without firing a useful error.
        if (board.session && Date.now() - board.loadingAt > 2500) {
          const connection = current.streams?.find(s => s.id === board.session);
          if (!connection || connection.send_age_ms > 1800) this.clear(board);
        }
        if (board.generation !== current.generation && Date.now() >= board.retryAt) {
          this.clear(board); board.generation = current.generation; board.loadingAt = Date.now();
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          board.session = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
          board.image.src = `${this.baseUrl}/api/v1/boards/${board.id}/stream.mjpg?token=${encodeURIComponent(this.token)}&client=${board.session}&r=${Date.now()}`;
        }
      }
      this.onStatus(status);
    } catch (error) {
      if (!this.running || epoch !== this.epoch) return;
      this.boards.forEach(b => this.clear(b)); this.onError(error);
    } finally {
      clearTimeout(timeout);
      if (this.running && epoch === this.epoch && !document.hidden)
        this.timer = setTimeout(() => this.poll(epoch), this.pollInterval || 500);
    }
  }
}
