import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { sourceKey, sourceFromKey, restoreSources, rectifiedSettings } from "../src/lib/cameraSources";
import { defaultCamSettings } from "../src/lib/constants";
import { DartRectifyDiscovery } from "../src/lib/dartrectify/connection";
test("legacy selections migrate without replacing missing cameras or empty slots", () => {
  const sources = restoreSources(null, JSON.stringify({ cam1: "camera-123", cam2: "" }));
  expect(sources.cam1).toEqual({ kind: "webcam", deviceId: "camera-123" });
  expect(sources.cam2).toEqual({ kind: "none" });
  expect(sourceKey(sources.cam1)).toBe("webcam:camera-123");
  expect(restoreSources("{", JSON.stringify({ cam1: "old" })).cam1).toEqual({ kind: "webcam", deviceId: "old" });
});
test("rectified source selections survive offline reload and use independent settings keys", () => {
  const source = sourceFromKey("dartrectify:guest");
  expect(source).toEqual({ kind: "dartrectify", board: "guest" });
  expect(sourceKey(source)).toBe("dartrectify:guest");
  expect(restoreSources(JSON.stringify({ cam1: source, cam2: { kind: "none" } }), JSON.stringify({ cam1: "old", cam2: "old2" }))).toEqual({ cam1: source, cam2: { kind: "none" } });
  expect(sourceFromKey("dartrectify:unknown")).toEqual({ kind: "none" });
});
test("rectified display adjustments retain crop and filters without applying perspective twice", () => {
  const settings = rectifiedSettings({ ...defaultCamSettings, scale: 1.8, panX: 0.2, brightness: 110, rotateX: 20, skewX: 9, maskVisible: true });
  expect(settings.scale).toBe(1.8);
  expect(settings.panX).toBe(0.2);
  expect(settings.brightness).toBe(110);
  expect(settings.maskVisible).toBe(true);
  expect(settings.rotateX).toBe(0);
  expect(settings.skewX).toBe(0);
  expect(settings.perspective).toBe(0);
});
test("discovery rotates sessions on app restart, does not notify unchanged sessions and ignores late responses after stop", async () => {
  const savedFetch = globalThis.fetch;
  const savedDocument = globalThis.document;
  const events = [];
  const doc = new EventTarget;
  Object.assign(doc, { hidden: false });
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
  let token = "a".repeat(64);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ service: "dartrectify", protocol_version: 1, token, boards: ["home", "guest"] }) });
  const connection = new DartRectifyDiscovery((value) => events.push(value.token));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  try {
    connection.start();
    await settle();
    connection.retry();
    await settle();
    expect(events).toEqual(["a".repeat(64)]);
    token = "b".repeat(64);
    connection.retry();
    await settle();
    expect(events).toEqual(["a".repeat(64), "b".repeat(64)]);
    let finish = () => {};
    globalThis.fetch = () => new Promise((resolve) => finish = resolve);
    connection.retry();
    connection.stop();
    finish({ ok: true, json: async () => ({ service: "dartrectify", protocol_version: 1, token: "c".repeat(64), boards: ["home", "guest"] }) });
    await settle();
    expect(events).toHaveLength(2);
  } finally {
    connection.stop();
    globalThis.fetch = savedFetch;
    Object.defineProperty(globalThis, "document", { value: savedDocument, configurable: true });
  }
});
test("service worker leaves local sessions, frames and MJPEG requests entirely to the browser", () => {
  const handlers = {};
  const code = readFileSync(new URL("../src/service-worker.js", import.meta.url), "utf8").replace("import { build, files, version } from '$service-worker';", "const build=[], files=[], version='test';");
  let intercepted = false;
  runInNewContext(code, { URL, self: { location: { origin: "https://cams.ingomc.de" }, addEventListener: (name, handler) => handlers[name] = handler } });
  for (const path of ["/api/v1/discovery", "/api/v1/status", "/api/v1/boards/home/stream.mjpg?token=secret"])
    handlers.fetch({ request: { method: "GET", url: "http://127.0.0.1:8731" + path }, respondWith: () => intercepted = true });
  expect(intercepted).toBe(false);
});

test("service worker activation removes previously cached local sessions and images", async () => {
  const handlers = {};
  const code = readFileSync(new URL("../src/service-worker.js", import.meta.url), "utf8").replace("import { build, files, version } from '$service-worker';", "const build=[], files=[], version='test';");
  const cached = new Map([
    ["http://127.0.0.1:8731/api/v1/discovery", { token: "previous-session" }],
    ["http://localhost:8731/api/v1/boards/home/frame.jpg", "old-image"],
    ["http://[::1]:8731/api/v1/status", "old-status"],
    ["https://cams.ingomc.de/index.html", "website"]
  ]);
  const removedCaches = [];
  const cache = {
    keys: async () => [...cached.keys()].map(url => ({ url })),
    delete: async request => cached.delete(request.url)
  };
  runInNewContext(code, { URL,
    self: { location: { origin: "https://cams.ingomc.de" }, addEventListener: (name, handler) => handlers[name] = handler },
    caches: { keys: async () => ["cache-old", "cache-test"], delete: async name => removedCaches.push(name), open: async () => cache }
  });
  let activation;
  handlers.activate({ waitUntil: promise => activation = promise });
  await activation;
  expect(removedCaches).toEqual(["cache-old"]);
  expect([...cached.keys()]).toEqual(["https://cams.ingomc.de/index.html"]);
});
