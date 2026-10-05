import { test, expect } from 'bun:test';
import { defaultOverlaySizes, restoreOverlaySizes } from '../src/lib/overlaySizes';

test('missing or malformed overlay settings retain the existing sizes', () => {
    for (const raw of [null, '{', 'null', '42', '[]']) {
        expect(restoreOverlaySizes(raw)).toEqual(defaultOverlaySizes);
    }
    const restored = restoreOverlaySizes(null);
    restored.score = 150;
    expect(defaultOverlaySizes.score).toBe(100);
});

test('global label and score sizes survive a storage round trip and partial settings', () => {
    const original = restoreOverlaySizes(JSON.stringify({ label: 125, score: 150 }));
    const restored = restoreOverlaySizes(JSON.stringify(original));
    expect(restored).toEqual({ label: 125, score: 150 });
    expect(restoreOverlaySizes(JSON.stringify({ score: 75 }))).toEqual({ label: 100, score: 75 });
});

test('invalid saved values fall back or stay within the slider limits', () => {
    expect(restoreOverlaySizes(JSON.stringify({ label: -100, score: 1000 }))).toEqual({ label: 50, score: 200 });
    expect(restoreOverlaySizes(JSON.stringify({ score: 147, label: false }))).toEqual({ label: 100, score: 145 });
});
