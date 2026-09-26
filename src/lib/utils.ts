import type { CamSetting } from './types';
import { boardAlignmentMatrix, type ViewportSize } from './boardAlignmentGeometry';

export function getSharpenKernel(amount: number) {
    const s = amount / 100;
    return `0 ${-s} 0 ${-s} ${1 + 4 * s} ${-s} 0 ${-s} 0`;
}

export function getTransformStyle(settings: CamSetting, camId: string, view?: ViewportSize) {
    const persp =
        settings.perspective > 0
            ? `perspective(${settings.perspective}px)`
            : "";
    // Wir kombinieren den Master-Scale mit den individuellen Achsen-Scales
    const sx = settings.scale * (settings.scaleX || 1);
    const sy = settings.scale * (settings.scaleY || 1);
    const moveX = settings.panX !== undefined && view?.width ? settings.panX * view.width : settings.x;
    const moveY = settings.panY !== undefined && view?.height ? settings.panY * view.height : settings.y;

    // WICHTIG: Reihenfolge der Transformationen!
    // 1. Translate (Verschieben im Screen-Koordinatensystem)
    // 2. Rotate (Drehen um den neuen Mittelpunkt)
    // 3. Scale (Skalieren der Achsen)
    // 4. 3D Rotations (Tilt)

    let filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturate}%)`;
    if (settings.sharpness > 0) {
        filter += ` url(#sharpen-${camId})`;
    }

    const alignment = settings.autoAlignment && view
        ? boardAlignmentMatrix(settings.autoAlignment, view)
        : null;
    const autoMatrix = alignment
        ? `matrix3d(${alignment[0]}, ${alignment[3]}, 0, ${alignment[6]},
                    ${alignment[1]}, ${alignment[4]}, 0, ${alignment[7]},
                    0, 0, 1, 0,
                    ${alignment[2]}, ${alignment[5]}, 0, ${alignment[8]})`
        : '';
    const centeredManual = alignment && view
        ? `translate(${view.width / 2}px, ${view.height / 2}px)
           rotate(${settings.rotate}deg)
           scale(${sx}, ${sy})
           rotateX(${settings.rotateX}deg)
           rotateY(${settings.rotateY}deg)
           skew(${settings.skewX}deg, ${settings.skewY}deg)
           translate(${-view.width / 2}px, ${-view.height / 2}px)
           ${autoMatrix}`
        : null;

    return `transform-origin: ${alignment ? '0 0' : 'center center'};
        transform: ${centeredManual ? `translate(${moveX}px, ${moveY}px) ${persp} ${centeredManual}` : `
        ${persp}
        translate(${moveX}px, ${moveY}px)
        rotate(${settings.rotate}deg) 
        scale(${sx}, ${sy}) 
        rotateX(${settings.rotateX}deg)
        rotateY(${settings.rotateY}deg)
        skew(${settings.skewX}deg, ${settings.skewY}deg)`};
        filter: ${filter};`;
}

export function getMaskStyle(settings: CamSetting) {
    if (!settings.maskVisible) return "";
    const r = settings.maskRadius;
    const f = settings.maskFeather;
    const gradient = `radial-gradient(circle at center, black ${r}%, transparent ${r + f}%)`;
    return `-webkit-mask-image: ${gradient}; mask-image: ${gradient};`;
}
