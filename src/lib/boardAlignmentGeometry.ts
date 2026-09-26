import type { BoardAlignment } from './types';

export const BOARD_DIAMETER_FRACTION = 0.7;

export interface ViewportSize {
    width: number;
    height: number;
    videoWidth: number;
    videoHeight: number;
}

/** Row-major 3×3 matrix for points (x, y, 1). */
export type Matrix3 = [number, number, number, number, number, number, number, number, number];

export function multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
    const out = new Array<number>(9);
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[col + 3] + a[row * 3 + 2] * b[col + 6];
        }
    }
    return out as Matrix3;
}

export function invertMatrix(matrix: Matrix3): Matrix3 | null {
    const [a, b, c, d, e, f, g, h, i] = matrix;
    const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
    return [
        (e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant,
        (f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant,
        (d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant,
    ];
}

export function transformPoint(matrix: Matrix3, x: number, y: number) {
    const divisor = matrix[6] * x + matrix[7] * y + matrix[8];
    return {
        x: (matrix[0] * x + matrix[1] * y + matrix[2]) / divisor,
        y: (matrix[3] * x + matrix[4] * y + matrix[5]) / divisor,
    };
}

/** Rectify the ring ellipse, then map the projected bull to the circle center. */
export function alignmentToUnitMatrix(alignment: BoardAlignment): Matrix3 | null {
    const { sourceWidth, sourceHeight, centerX, centerY, majorRadius, minorRadius, majorAngle } = alignment;
    if (![sourceWidth, sourceHeight, centerX, centerY, majorRadius, minorRadius, majorAngle].every(Number.isFinite) ||
        sourceWidth <= 0 || sourceHeight <= 0 || majorRadius <= 0 || minorRadius <= 0) return null;
    const cx = centerX * sourceWidth;
    const cy = centerY * sourceHeight;
    const a = majorRadius * sourceHeight;
    const b = minorRadius * sourceHeight;
    const cosine = Math.cos(majorAngle);
    const sine = Math.sin(majorAngle);
    const ellipse: Matrix3 = [
        cosine / a, sine / a, -(cosine * cx + sine * cy) / a,
        -sine / b, cosine / b, (sine * cx - cosine * cy) / b,
        0, 0, 1,
    ];
    if (alignment.bullX === undefined || alignment.bullY === undefined) return ellipse;
    const bull = transformPoint(ellipse, alignment.bullX * sourceWidth, alignment.bullY * sourceHeight);
    const distance = Math.hypot(bull.x, bull.y);
    if (!Number.isFinite(distance) || distance >= 0.8) return null;
    if (distance < 1e-5) return ellipse;
    const c = bull.x / distance;
    const s = bull.y / distance;
    const rotate: Matrix3 = [c, s, 0, -s, c, 0, 0, 0, 1];
    const unrotate: Matrix3 = [c, -s, 0, s, c, 0, 0, 0, 1];
    const boost: Matrix3 = [1, 0, -distance, 0, Math.sqrt(1 - distance * distance), 0, -distance, 0, 1];
    return multiplyMatrices(unrotate, multiplyMatrices(boost, multiplyMatrices(rotate, ellipse)));
}

function outputMatrix(centerX: number, centerY: number, radius: number, rotation: number): Matrix3 {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return [radius * c, -radius * s, centerX, radius * s, radius * c, centerY, 0, 0, 1];
}

export function imageToBoardMatrix(alignment: BoardAlignment, size: number, ringRadius: number): Matrix3 | null {
    const rectification = alignmentToUnitMatrix(alignment);
    return rectification ? multiplyMatrices(outputMatrix(size / 2, size / 2, ringRadius, 0), rectification) : null;
}

/** Map the camera's contained image to a centered board with a 70% scoring-ring diameter. */
export function boardAlignmentMatrix(alignment: BoardAlignment, view: ViewportSize): Matrix3 | null {
    const { width, height, videoWidth, videoHeight } = view;
    if (![width, height, videoWidth, videoHeight].every(Number.isFinite) ||
        width <= 0 || height <= 0 || videoWidth <= 0 || videoHeight <= 0) return null;
    const rectification = alignmentToUnitMatrix(alignment);
    if (!rectification) return null;
    const fit = Math.min(width / videoWidth, height / videoHeight);
    const offsetX = (width - videoWidth * fit) / 2;
    const offsetY = (height - videoHeight * fit) / 2;
    const imageFromCss: Matrix3 = [
        alignment.sourceWidth / (videoWidth * fit), 0, -offsetX * alignment.sourceWidth / (videoWidth * fit),
        0, alignment.sourceHeight / (videoHeight * fit), -offsetY * alignment.sourceHeight / (videoHeight * fit),
        0, 0, 1,
    ];
    const rotation = alignment.topAngle === null ? alignment.majorAngle : -Math.PI / 2 - alignment.topAngle;
    const radius = BOARD_DIAMETER_FRACTION * Math.min(width, height) / 2;
    return multiplyMatrices(outputMatrix(width / 2, height / 2, radius, rotation),
        multiplyMatrices(rectification, imageFromCss));
}
