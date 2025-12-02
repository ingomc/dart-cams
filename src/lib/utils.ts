import type { CamSetting } from './types';

export function getSharpenKernel(amount: number) {
    const s = amount / 100;
    return `0 ${-s} 0 ${-s} ${1 + 4 * s} ${-s} 0 ${-s} 0`;
}

export function getTransformStyle(settings: CamSetting, camId: string) {
    const persp =
        settings.perspective > 0
            ? `perspective(${settings.perspective}px)`
            : "";
    // Wir kombinieren den Master-Scale mit den individuellen Achsen-Scales
    const sx = settings.scale * (settings.scaleX || 1);
    const sy = settings.scale * (settings.scaleY || 1);

    // WICHTIG: Reihenfolge der Transformationen!
    // 1. Translate (Verschieben im Screen-Koordinatensystem)
    // 2. Rotate (Drehen um den neuen Mittelpunkt)
    // 3. Scale (Skalieren der Achsen)
    // 4. 3D Rotations (Tilt)

    let filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturate}%)`;
    if (settings.sharpness > 0) {
        filter += ` url(#sharpen-${camId})`;
    }

    return `transform: 
        ${persp}
        translate(${settings.x}px, ${settings.y}px)
        rotate(${settings.rotate}deg) 
        scale(${sx}, ${sy}) 
        rotateX(${settings.rotateX}deg)
        rotateY(${settings.rotateY}deg)
        skew(${settings.skewX}deg, ${settings.skewY}deg);
        filter: ${filter};`;
}

export function getMaskStyle(settings: CamSetting) {
    if (!settings.maskVisible) return "";
    const r = settings.maskRadius;
    const f = settings.maskFeather;
    const gradient = `radial-gradient(circle at center, black ${r}%, transparent ${r + f}%)`;
    return `-webkit-mask-image: ${gradient}; mask-image: ${gradient};`;
}

export function srcObject(node: HTMLVideoElement, stream: MediaProvider | null) {
    node.srcObject = stream;
    return {
        update(newStream: MediaProvider | null) {
            node.srcObject = newStream;
        },
    };
}
