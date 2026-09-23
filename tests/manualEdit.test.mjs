import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { defaultCamSettings } from '../src/lib/constants.ts';
import { dragPan, editDraft, pinchTransform } from '../src/lib/manualEdit.ts';

test('legacy pixel pan migrates without a visual jump and then follows frame size', () => {
    const draft = editDraft({ ...defaultCamSettings, x: 80, y: -40 }, 400, 200);
    assert.equal(draft.x, 0);
    assert.equal(draft.y, 0);
    assert.equal(draft.panX * 400, 80);
    assert.equal(draft.panY * 200, -40);
    const moved = dragPan(draft, { x: 40, y: 20 }, 400, 200);
    assert.ok(Math.abs(moved.panX * 400 - 120) < 1e-9);
    assert.ok(Math.abs(moved.panY * 200 + 20) < 1e-9);
    assert.ok(Math.abs(moved.panX * 800 - 240) < 1e-9);
    assert.ok(Math.abs(moved.panY * 400 + 40) < 1e-9);
});

test('pinch zooms and rotates while keeping the touched point under the fingers', () => {
    const base = editDraft({ ...defaultCamSettings, panX: 0.1, panY: -0.05 }, 500, 400);
    const result = pinchTransform(base,
        { x: 300, y: 180 }, { x: 400, y: 180 },
        { x: 360, y: 140 }, { x: 360, y: 340 }, 500, 400);
    assert.equal(result.scale, 2);
    assert.ok(Math.abs(result.rotate - 90) < 1e-9);
    // The midpoint shifts from (350,180) to (360,240), with its anchor preserved.
    const oldVector = { x: 350 - 250 - 50, y: 180 - 200 + 20 };
    const mapped = {
        x: 250 + result.panX * 500 - 2 * oldVector.y,
        y: 200 + result.panY * 400 + 2 * oldVector.x,
    };
    assert.ok(Math.abs(mapped.x - 360) < 1e-9);
    assert.ok(Math.abs(mapped.y - 240) < 1e-9);
});

test('pinch rotation stays continuous across the angle boundary', () => {
    const base = editDraft(defaultCamSettings, 400, 400);
    const degrees = Math.PI / 180;
    const start = { x: 200 + 100 * Math.cos(179 * degrees), y: 200 + 100 * Math.sin(179 * degrees) };
    const end = { x: 200 + 100 * Math.cos(-179 * degrees), y: 200 + 100 * Math.sin(-179 * degrees) };
    const result = pinchTransform(base, { x: 200, y: 200 }, start, { x: 200, y: 200 }, end, 400, 400);
    assert.ok(Math.abs(result.rotate - 2) < 1e-9);
});
