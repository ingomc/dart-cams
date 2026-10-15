import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { defaultCamSettings } from '../src/lib/constants.ts';
import { applyCameraSettings, cameraSettingsFor, ensureCameraProfiles, restoreCameraSettings } from '../src/lib/cameraLayoutSettings.ts';

const sourceKey = 'webcam:board-camera';
const alignment = {
    sourceWidth: 1280, sourceHeight: 720, centerX: 600, centerY: 360,
    majorRadius: 300, minorRadius: 250, majorAngle: 0, topAngle: 0,
};
const original = {
    ...defaultCamSettings, autoAlignment: alignment,
    maskVisible: true, maskRadius: 38, maskFeather: 9,
    scale: 1.4, scaleX: 1.1, scaleY: 0.9, rotate: 12, x: 20, y: -10,
    perspective: 900, rotateX: 8, rotateY: -3, skewX: 4, skewY: 2,
    brightness: 110, contrast: 105, saturate: 90, sharpness: 12,
};
const load = (store, layout = 'split', slot = 'cam1', key = sourceKey) => cameraSettingsFor(store, layout, slot, key);
const restoreLegacy = () => restoreCameraSettings(JSON.stringify({ 'board-camera': original }), null);

test('legacy source values seed all layouts and slots without sharing their image edits', () => {
    const store = restoreLegacy();
    for (const layout of ['split', 'cam1', 'cam2']) {
        for (const slot of ['cam1', 'cam2']) assert.deepEqual(load(store, layout, slot), original);
    }
    const edited = { ...original, maskVisible: false, maskRadius: 25, maskFeather: 3,
        scale: 2, scaleX: 0.8, scaleY: 1.2, rotate: 90, x: 0, y: 0, panX: 0.2, panY: -0.1,
        perspective: 800, rotateX: 2, rotateY: 3, skewX: 1, skewY: -2 };
    applyCameraSettings(store, 'split', 'cam1', { sourceKey, settings: edited });
    assert.deepEqual(load(store), edited);
    // Neither single-board preset has been visited since migration.
    assert.deepEqual(load(store, 'cam1'), original);
    assert.deepEqual(load(store, 'cam2'), original);
    assert.deepEqual(load(store, 'split', 'cam2'), original);
});

test('colors, sharpness and physical calibration follow the source across layouts and slots', () => {
    const store = restoreLegacy();
    const shared = { brightness: 130, contrast: 120, saturate: 75, sharpness: 24,
        autoAlignment: { ...alignment, centerX: 620 } };
    applyCameraSettings(store, 'cam1', 'cam1', { sourceKey,
        settings: { ...load(store, 'cam1'), ...shared, maskRadius: 22, scale: 2.5 } });
    assert.deepEqual(load(store), { ...original, ...shared });
    assert.deepEqual(load(store, 'cam2', 'cam2'), { ...original, ...shared });
    assert.equal(load(store, 'cam1').maskRadius, 22);
    assert.equal(load(store, 'cam1').scale, 2.5);
});

test('switching sources and reloading restores each layout and camera slot', () => {
    let store = restoreLegacy();
    const otherSource = 'webcam:other-camera';
    ensureCameraProfiles(store, 'cam1', otherSource);
    applyCameraSettings(store, 'cam1', 'cam1', { sourceKey,
        settings: { ...load(store, 'cam1'), maskRadius: 27, panX: 0.3, panY: 0.1 } });
    applyCameraSettings(store, 'cam2', 'cam2', { sourceKey,
        settings: { ...load(store, 'cam2', 'cam2'), maskRadius: 31, scale: 1.8 } });
    applyCameraSettings(store, 'split', 'cam1', { sourceKey: otherSource,
        settings: { ...load(store, 'split', 'cam1', otherSource), maskRadius: 18, brightness: 80 } });
    store = restoreCameraSettings(JSON.stringify(store.sources), JSON.stringify(store.layouts));
    assert.equal(load(store, 'cam1').maskRadius, 27);
    assert.equal(load(store, 'cam1').panX, 0.3);
    assert.equal(load(store, 'cam1').panY, 0.1);
    assert.equal(load(store, 'cam2', 'cam2').maskRadius, 31);
    assert.equal(load(store, 'cam2', 'cam2').scale, 1.8);
    assert.deepEqual(load(store), original);
    assert.equal(load(store, 'split', 'cam1', otherSource).maskRadius, 18);
    assert.equal(load(store, 'split', 'cam1', otherSource).brightness, 80);
    assert.equal(load(store, 'cam1', 'cam1', otherSource).maskRadius, defaultCamSettings.maskRadius);
});

test('draft edits and canceled edits leave saved values unchanged', () => {
    const store = restoreLegacy();
    const before = JSON.stringify(store);
    const draft = load(store);
    draft.maskRadius = 10;
    draft.brightness = 180;
    draft.autoAlignment.centerX = 999;
    assert.equal(JSON.stringify(store), before);
    assert.deepEqual(load(store), original);
});

test('a new source retains the default framing in unvisited layouts and slots', () => {
    const store = restoreCameraSettings(null, null);
    applyCameraSettings(store, 'split', 'cam1', { sourceKey,
        settings: { ...defaultCamSettings, maskRadius: 20, scale: 2, brightness: 125 } });
    ensureCameraProfiles(store, 'cam2', sourceKey);
    assert.deepEqual(load(store, 'cam1'), { ...defaultCamSettings, brightness: 125, autoAlignment: undefined });
    assert.deepEqual(load(store, 'split', 'cam2'), { ...defaultCamSettings, brightness: 125, autoAlignment: undefined });
});

test('DartRectify keeps its geometry restrictions while mask and framing follow the layout', () => {
    const key = 'dartrectify:home';
    const store = restoreCameraSettings(JSON.stringify({ [key]: original }), null);
    applyCameraSettings(store, 'cam1', 'cam1', { sourceKey: key,
        settings: { ...load(store, 'cam1', 'cam1', key), maskRadius: 24, scale: 1.9, panX: -0.2 } });
    const settings = load(store, 'cam1', 'cam1', key);
    assert.equal(settings.autoAlignment, undefined);
    for (const field of ['scaleX', 'scaleY']) assert.equal(settings[field], 1);
    for (const field of ['perspective', 'rotateX', 'rotateY', 'skewX', 'skewY']) assert.equal(settings[field], 0);
    assert.equal(settings.maskRadius, 24);
    assert.equal(settings.scale, 1.9);
    assert.equal(settings.panX, -0.2);
    assert.equal(load(store, 'split', 'cam1', key).maskRadius, 38);
});

test('prefixed source records take precedence and invalid profile data falls back to migration', () => {
    const sources = JSON.stringify({ 'board-camera': original, [sourceKey]: { ...original, maskRadius: 32 } });
    for (const saved of ['invalid JSON', 'null', '{"version":2}', '{"version":1,"profiles":[]}']) {
        const store = restoreCameraSettings(sources, saved);
        assert.equal(load(store).maskRadius, 32);
        assert.equal(store.layouts.version, 1);
    }
});
