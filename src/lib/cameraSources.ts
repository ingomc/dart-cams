import type { CamSetting } from './types';

export type CameraSource = { kind: 'none' } | { kind: 'webcam'; deviceId: string } | { kind: 'dartrectify'; board: 'home' | 'guest' };
export function cameraSource(value: unknown): CameraSource {
    if (typeof value === 'string') return value ? { kind: 'webcam', deviceId: value } : { kind: 'none' };
    if (!value || typeof value !== 'object') return { kind: 'none' };
    const source = value as Record<string, unknown>;
    if (source.kind === 'webcam' && typeof source.deviceId === 'string' && source.deviceId) return { kind: 'webcam', deviceId: source.deviceId };
    if (source.kind === 'dartrectify' && (source.board === 'home' || source.board === 'guest')) return { kind: 'dartrectify', board: source.board };
    return { kind: 'none' };
}
export function sourceKey(source: CameraSource): string {
    return source.kind === 'none' ? '' : source.kind === 'webcam' ? `webcam:${source.deviceId}` : `dartrectify:${source.board}`;
}
export function sourceFromKey(value: string): CameraSource {
    if (value.startsWith('webcam:')) return cameraSource({ kind: 'webcam', deviceId: value.slice(7) });
    if (value.startsWith('dartrectify:')) return cameraSource({ kind: 'dartrectify', board: value.slice(12) });
    return { kind: 'none' };
}
export function restoreSources(current: string | null, legacy: string | null): { cam1: CameraSource; cam2: CameraSource } {
    for (const raw of [current, legacy]) {
        if (!raw) continue;
        try { const value = JSON.parse(raw); if (value && typeof value === 'object') return { cam1: cameraSource(value.cam1), cam2: cameraSource(value.cam2) }; } catch { /* fall back to legacy selections */ }
    }
    return { cam1: { kind: 'none' }, cam2: { kind: 'none' } };
}
export function rectifiedSettings(settings: CamSetting): CamSetting {
    return { ...settings, autoAlignment: undefined, scaleX: 1, scaleY: 1, perspective: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0 };
}
