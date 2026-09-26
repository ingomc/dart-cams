import type { CamSetting } from './types';

export interface Point { x: number; y: number }

export function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

/** Copy persisted settings into a draft, migrating old pixel offsets at the current frame size. */
export function editDraft(settings: CamSetting, width: number, height: number): CamSetting {
    return {
        ...settings,
        autoAlignment: settings.autoAlignment ? { ...settings.autoAlignment } : undefined,
        panX: settings.panX ?? (width ? settings.x / width : 0),
        panY: settings.panY ?? (height ? settings.y / height : 0),
        x: 0,
        y: 0,
    };
}

export function dragPan(base: CamSetting, delta: Point, width: number, height: number): CamSetting {
    return {
        ...base,
        panX: (base.panX ?? 0) + delta.x / Math.max(width, 1),
        panY: (base.panY ?? 0) + delta.y / Math.max(height, 1),
    };
}

/** Keep the image point under the initial two-finger midpoint under the new midpoint. */
export function pinchTransform(base: CamSetting, startA: Point, startB: Point,
    currentA: Point, currentB: Point, width: number, height: number): CamSetting {
    const startMid = { x: (startA.x + startB.x) / 2, y: (startA.y + startB.y) / 2 };
    const currentMid = { x: (currentA.x + currentB.x) / 2, y: (currentA.y + currentB.y) / 2 };
    const startDx = startB.x - startA.x;
    const startDy = startB.y - startA.y;
    const currentDx = currentB.x - currentA.x;
    const currentDy = currentB.y - currentA.y;
    const ratio = Math.hypot(currentDx, currentDy) / Math.max(1, Math.hypot(startDx, startDy));
    const scale = clamp(base.scale * ratio, 0.3, 4);
    const actualRatio = scale / base.scale;
    const rawAngle = Math.atan2(currentDy, currentDx) - Math.atan2(startDy, startDx);
    const deltaAngle = Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
    const cosine = Math.cos(deltaAngle) * actualRatio;
    const sine = Math.sin(deltaAngle) * actualRatio;
    const center = { x: width / 2, y: height / 2 };
    const from = {
        x: startMid.x - center.x - (base.panX ?? 0) * width,
        y: startMid.y - center.y - (base.panY ?? 0) * height,
    };
    return {
        ...base,
        scale,
        rotate: base.rotate + deltaAngle * 180 / Math.PI,
        panX: (currentMid.x - center.x - cosine * from.x + sine * from.y) / Math.max(width, 1),
        panY: (currentMid.y - center.y - sine * from.x - cosine * from.y) / Math.max(height, 1),
    };
}
