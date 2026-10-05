export const overlaySizeControls = [
    { key: 'label', label: 'Kamera-Labels', default: 100, min: 50, max: 200, step: 5 },
    { key: 'score', label: 'Live-Scoring', default: 100, min: 50, max: 200, step: 5 },
] as const;

export type OverlaySizes = Record<(typeof overlaySizeControls)[number]['key'], number>;

export const defaultOverlaySizes: Readonly<OverlaySizes> = Object.fromEntries(
    overlaySizeControls.map(control => [control.key, control.default]),
) as OverlaySizes;

function normalizeSizes(value: unknown): OverlaySizes {
    const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return Object.fromEntries(overlaySizeControls.map(control => {
        const size = stored[control.key];
        return [control.key, typeof size === 'number' && Number.isFinite(size)
            ? Math.max(control.min, Math.min(control.max, Math.round(size / control.step) * control.step))
            : control.default];
    })) as OverlaySizes;
}

export function restoreOverlaySizes(raw: string | null): OverlaySizes {
    let stored: unknown = null;
    try { stored = raw ? JSON.parse(raw) : null; } catch { /* Use the existing visual sizes. */ }
    return normalizeSizes(stored);
}
