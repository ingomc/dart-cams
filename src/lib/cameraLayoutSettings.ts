import { defaultCamSettings } from './constants';
import { rectifiedSettings } from './cameraSources';
import type { CamSetting } from './types';

export type CameraLayout = 'split' | 'cam1' | 'cam2';
export type CameraSlot = 'cam1' | 'cam2';
export interface CameraSettingsApply {
    sourceKey: string;
    settings: CamSetting;
}

const layouts: CameraLayout[] = ['split', 'cam1', 'cam2'];
const slots: CameraSlot[] = ['cam1', 'cam2'];
const imageKeys = [
    'scale', 'scaleX', 'scaleY', 'rotate', 'x', 'y', 'panX', 'panY',
    'perspective', 'rotateX', 'rotateY', 'skewX', 'skewY',
    'maskVisible', 'maskRadius', 'maskFeather',
] as const;
type CameraImageSettings = Pick<CamSetting, typeof imageKeys[number]>;
type SlotProfiles = Record<CameraSlot, Record<string, CameraImageSettings>>;
export interface CameraLayoutSettings {
    version: 1;
    profiles: Record<CameraLayout, SlotProfiles>;
}
export interface CameraSettingsStore {
    sources: Record<string, CamSetting>;
    layouts: CameraLayoutSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseRecord(raw: string | null): Record<string, unknown> {
    try {
        const value: unknown = JSON.parse(raw ?? '{}');
        return isRecord(value) ? value : {};
    } catch {
        return {};
    }
}

function imageSettings(settings: Partial<CamSetting>): CameraImageSettings {
    const result = {} as CameraImageSettings;
    for (const key of imageKeys) {
        const value = settings[key];
        const valid = key === 'maskVisible' ? typeof value === 'boolean' : typeof value === 'number' && Number.isFinite(value);
        const field = valid ? value : defaultCamSettings[key];
        if (field !== undefined) Object.assign(result, { [key]: field });
    }
    return result;
}

function sourceSettings(store: CameraSettingsStore, sourceKey: string): CamSetting {
    const legacyKey = sourceKey.startsWith('webcam:') ? sourceKey.slice(7) : sourceKey;
    const saved = store.sources[sourceKey] ?? store.sources[legacyKey];
    return { ...defaultCamSettings, ...saved };
}

/** Seed every layout before editing, including presets that have never been opened. */
export function ensureCameraProfiles(store: CameraSettingsStore, slot: CameraSlot, sourceKey: string): boolean {
    if (!sourceKey) return false;
    const baseline = sourceSettings(store, sourceKey);
    let changed = false;
    for (const layout of layouts) {
        if (!store.layouts.profiles[layout][slot][sourceKey]) {
            store.layouts.profiles[layout][slot][sourceKey] = imageSettings(baseline);
            changed = true;
        }
    }
    return changed;
}

export function restoreCameraSettings(sourceJson: string | null, layoutJson: string | null): CameraSettingsStore {
    const store: CameraSettingsStore = {
        sources: Object.fromEntries(Object.entries(parseRecord(sourceJson))
            .filter(([, value]) => isRecord(value))
            .map(([key, value]) => [key, { ...defaultCamSettings, ...value as Partial<CamSetting> }])),
        layouts: { version: 1, profiles: {
            split: { cam1: {}, cam2: {} },
            cam1: { cam1: {}, cam2: {} },
            cam2: { cam1: {}, cam2: {} },
        } },
    };
    const saved = parseRecord(layoutJson);
    if (saved.version === 1 && isRecord(saved.profiles)) {
        for (const layout of layouts) {
            const profile = saved.profiles[layout];
            if (!isRecord(profile)) continue;
            for (const slot of slots) {
                const sources = profile[slot];
                if (!isRecord(sources)) continue;
                for (const [key, values] of Object.entries(sources)) {
                    if (isRecord(values)) {
                        store.layouts.profiles[layout][slot][key] = imageSettings({ ...sourceSettings(store, key), ...values });
                    }
                }
            }
        }
    }
    for (const key of Object.keys(store.sources)) {
        const sourceKey = key.startsWith('webcam:') || key.startsWith('dartrectify:') ? key : `webcam:${key}`;
        for (const slot of slots) ensureCameraProfiles(store, slot, sourceKey);
    }
    return store;
}

export function cameraSettingsFor(store: CameraSettingsStore, layout: CameraLayout, slot: CameraSlot, sourceKey: string): CamSetting {
    if (!sourceKey) return { ...defaultCamSettings };
    const combined = { ...sourceSettings(store, sourceKey), ...store.layouts.profiles[layout][slot][sourceKey] };
    // Editing a draft must not mutate the source's physical calibration.
    if (combined.autoAlignment) combined.autoAlignment = { ...combined.autoAlignment };
    return sourceKey.startsWith('dartrectify:') ? rectifiedSettings(combined) : combined;
}

/** Called only by the editor's Apply action; cancellation never touches this store. */
export function applyCameraSettings(store: CameraSettingsStore, layout: CameraLayout, slot: CameraSlot, change: CameraSettingsApply): void {
    if (!change.sourceKey) return;
    ensureCameraProfiles(store, slot, change.sourceKey);
    store.layouts.profiles[layout][slot][change.sourceKey] = imageSettings(change.settings);
    const { brightness, contrast, saturate, sharpness, autoAlignment } = change.settings;
    store.sources[change.sourceKey] = {
        // Keep legacy geometry as the migration baseline for other camera slots.
        ...sourceSettings(store, change.sourceKey),
        brightness, contrast, saturate, sharpness,
        autoAlignment: autoAlignment ? { ...autoAlignment } : undefined,
    };
}
