import { test, expect } from 'bun:test';
import { CameraDiagnostics } from '../src/lib/cameraDiagnostics.ts';

test('camera history survives reload, keeps ten minutes, and never exports token fields', () => {
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    };
    let now = Date.parse('2026-10-15T12:00:00Z');
    const first = new CameraDiagnostics({ storage, now: () => now });
    first.record('cam1', 'webcam_start_failed', {
        errorName: 'NotReadableError', token: 'private-session-token', url: 'https://example.org/private'
    });
    now += 9 * 60 * 1000;
    const restored = new CameraDiagnostics({ storage, now: () => now });
    expect(restored.exportData().events).toHaveLength(1);
    expect(JSON.stringify(restored.exportData())).not.toContain('private-session-token');
    expect(restored.exportData().events[0].details).toEqual({ errorName: 'NotReadableError' });
    now += 61 * 1000;
    expect(restored.exportData().events).toHaveLength(0);
});

test('camera history stays exportable if browser storage fails', () => {
    const diagnostics = new CameraDiagnostics({
        storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } }
    });
    diagnostics.record('app', 'device_scan_finished', { cameraCount: 2 });
    expect(diagnostics.storageAvailable).toBe(false);
    expect(diagnostics.exportData().events).toHaveLength(1);
});
