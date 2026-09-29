import { base } from '$app/paths';
import type { BoardAlignment } from './types';
import { imageToBoardMatrix, invertMatrix } from './boardAlignmentGeometry';

const NUMBERS_CLOCKWISE = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

interface EllipseCandidate {
    centerX: number;
    centerY: number;
    major: number;
    minor: number;
    angle: number;
}

export interface AlignmentResult {
    alignment: BoardAlignment;
    warning: string | null;
}

function pixelColor(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): 0 | 1 | 2 {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0;
    const index = (iy * width + ix) * 4;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red > 55 && red - green > 18 && red - blue > 12) return 1;
    if (green > 50 && green - red > 12 && green - blue > 8) return 2;
    return 0;
}

function isRingColor(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): boolean {
    return pixelColor(data, width, height, x, y) !== 0;
}

function ringColorCoverage(candidate: EllipseCandidate, pixels: ImageData, radius: number): number {
    const { centerX, centerY, major, minor, angle } = candidate;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    let hits = 0;
    const samples = 120;
    for (let i = 0; i < samples; i++) {
        const t = 2 * Math.PI * i / samples;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        for (const scale of [radius - 0.035, radius, radius + 0.035]) {
            const x = centerX + scale * (major * cosine * ct - minor * sine * st);
            const y = centerY + scale * (major * sine * ct + minor * cosine * st);
            if (isRingColor(pixels.data, pixels.width, pixels.height, x, y)) {
                hits++;
                break;
            }
        }
    }
    return hits / samples;
}

function findBull(pixels: ImageData, cv: Awaited<ReturnType<typeof import('@opencvjs/web')['loadOpenCV']>>) {
    const { width, height, data } = pixels;
    const redMask = new cv.Mat(height, width, cv.CV_8UC1);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    let best: { x: number; y: number; score: number } | null = null;
    try {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                redMask.data[y * width + x] = pixelColor(data, width, height, x, y) === 1 ? 255 : 0;
            }
        }
        cv.findContours(redMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            try {
                const area = cv.contourArea(contour);
                if (area < 10 || area > Math.min(width, height) ** 2 * 0.005) continue;
                const box = cv.boundingRect(contour);
                if (box.width < 4 || box.height < 4 || box.width > Math.min(width, height) * 0.08 ||
                    Math.min(box.width, box.height) / Math.max(box.width, box.height) < 0.55) continue;
                const perimeter = cv.arcLength(contour, true);
                const circularity = 4 * Math.PI * area / (perimeter * perimeter);
                if (circularity < 0.35) continue;
                const x = box.x + box.width / 2;
                const y = box.y + box.height / 2;
                const radius = Math.sqrt(area / Math.PI);
                let green = 0;
                for (let a = 0; a < 32; a++) {
                    const t = 2 * Math.PI * a / 32;
                    for (const scale of [1.6, 2, 2.4, 2.8]) {
                        if (pixelColor(data, width, height, x + Math.cos(t) * radius * scale,
                            y + Math.sin(t) * radius * scale) === 2) {
                            green++;
                            break;
                        }
                    }
                }
                if (green < 6) continue;
                const score = green / 32 + circularity * 0.5 +
                    0.15 * (1 - Math.hypot((x - width / 2) / width, (y - height / 2) / height));
                if (!best || score > best.score) best = { x, y, score };
            } finally {
                contour.delete();
            }
        }
    } finally {
        redMask.delete();
        contours.delete();
        hierarchy.delete();
    }
    return best;
}

function bandStrength(pixels: ImageData, x: number, y: number, dx: number, dy: number, radius: number) {
    let hits = 0;
    for (const fraction of [-0.04, -0.02, 0, 0.02, 0.04]) {
        if (isRingColor(pixels.data, pixels.width, pixels.height,
            x + dx * radius * (1 + fraction), y + dy * radius * (1 + fraction))) hits++;
    }
    return hits;
}

/** Find the bull, then fit the colored double ring using its matching triple ring. */
export async function detectBoard(frame: HTMLCanvasElement): Promise<{ alignment: BoardAlignment; uncertain: boolean } | null> {
    const { loadOpenCV } = await import('@opencvjs/web');
    const cv = await loadOpenCV();
    const width = frame.width;
    const height = frame.height;
    const context = frame.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Kamerabild konnte nicht gelesen werden.');
    const pixels = context.getImageData(0, 0, width, height);
    const bull = findBull(pixels, cv);
    if (!bull) return null;
    const points: number[] = [];
    const smallest = Math.min(width, height);
    for (let i = 0; i < 90; i++) {
        const angle = 2 * Math.PI * i / 90;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let bestRadius = 0;
        let bestScore = 0;
        for (let radius = smallest * 0.06; radius <= smallest * 0.68; radius += 2) {
            const outer = bandStrength(pixels, bull.x, bull.y, dx, dy, radius);
            if (outer < 2) continue;
            const inner = bandStrength(pixels, bull.x, bull.y, dx, dy, radius * 0.63);
            const score = outer * inner;
            if (inner >= 2 && score > bestScore) {
                bestScore = score;
                bestRadius = radius;
            }
        }
        if (bestScore >= 6) {
            points.push(Math.round(bull.x + dx * bestRadius), Math.round(bull.y + dy * bestRadius));
        }
    }
    if (points.length < 24) return null;
    let retained = points;
    let best: EllipseCandidate | null = null;
    for (let pass = 0; pass < 3; pass++) {
        const mat = cv.matFromArray(retained.length / 2, 1, cv.CV_32SC2, retained);
        try {
            const ellipse = cv.fitEllipse(mat);
            const major = Math.max(ellipse.size.width, ellipse.size.height) / 2;
            const minor = Math.min(ellipse.size.width, ellipse.size.height) / 2;
            const angle = (ellipse.angle + (ellipse.size.width >= ellipse.size.height ? 0 : 90)) * Math.PI / 180;
            best = { centerX: ellipse.center.x, centerY: ellipse.center.y, major, minor, angle };
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const filtered: number[] = [];
            for (let i = 0; i < retained.length; i += 2) {
                const x = retained[i] - best.centerX;
                const y = retained[i + 1] - best.centerY;
                const distance = Math.hypot((cos * x + sin * y) / major, (-sin * x + cos * y) / minor);
                if (Math.abs(distance - 1) < 0.24) filtered.push(retained[i], retained[i + 1]);
            }
            if (filtered.length < 24 || filtered.length === retained.length) break;
            retained = filtered;
        } finally {
            mat.delete();
        }
    }
    if (!best || best.minor / best.major < 0.3 ||
        Math.hypot(best.centerX - bull.x, best.centerY - bull.y) > best.major * 0.38) return null;
    const doubleCoverage = ringColorCoverage(best, pixels, 1);
    const tripleCoverage = ringColorCoverage(best, pixels, 0.63);
    if (doubleCoverage < 0.12 || tripleCoverage < 0.08) return null;
    const alignment: BoardAlignment = {
        sourceWidth: width,
        sourceHeight: height,
        centerX: best.centerX / width,
        centerY: best.centerY / height,
        majorRadius: best.major / height,
        minorRadius: best.minor / height,
        majorAngle: best.angle,
        bullX: bull.x / width,
        bullY: bull.y / height,
        topAngle: null,
    };
    return {
        alignment,
        uncertain: retained.length < 70 || doubleCoverage < 0.28 || tripleCoverage < 0.22,
    };
}

/** Rectify the projected ring and bull so OCR sees a circular number ring. */
function makeRectifiedFrame(frame: HTMLCanvasElement, alignment: BoardAlignment): HTMLCanvasElement {
    const size = 800;
    const forward = imageToBoardMatrix(alignment, size, 220);
    const inverse = forward && invertMatrix(forward);
    if (!inverse) throw new Error('Boardgeometrie konnte nicht entzerrt werden.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const source = frame.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, frame.width, frame.height);
    const context = canvas.getContext('2d')!;
    const target = context.createImageData(size, size);
    const [a, b, c, d, e, f, g, h, i] = inverse;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const out = (y * size + x) * 4;
            const divisor = g * x + h * y + i;
            const sx = (a * x + b * y + c) / divisor;
            const sy = (d * x + e * y + f) / divisor;
            if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 ||
                sx >= source.width - 1 || sy >= source.height - 1) {
                target.data[out] = target.data[out + 1] = target.data[out + 2] = target.data[out + 3] = 255;
                continue;
            }
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const dx = sx - x0;
            const dy = sy - y0;
            const p = (y0 * source.width + x0) * 4;
            const row = source.width * 4;
            for (let channel = 0; channel < 3; channel++) {
                const top = source.data[p + channel] * (1 - dx) + source.data[p + channel + 4] * dx;
                const bottom = source.data[p + row + channel] * (1 - dx) + source.data[p + row + channel + 4] * dx;
                target.data[out + channel] = top * (1 - dy) + bottom * dy;
            }
            target.data[out + 3] = 255;
        }
    }
    context.putImageData(target, 0, 0);
    return canvas;
}

export function orientationFromReadings(readings: { sample: number; value: number; confidence: number }[]) {
    const twenty = readings.filter(reading => reading.value === 20 && reading.confidence >= 40)
        .sort((a, b) => b.confidence - a.confidence)[0];
    if (twenty) return {
        angle: -Math.PI / 2 + twenty.sample * Math.PI / 20,
        confident: twenty.confidence >= 80,
    };
    const votes = new Array<number>(40).fill(0);
    const contributors = Array.from({ length: 40 }, () => new Set<number>());
    for (const { sample, value, confidence } of readings) {
        const position = NUMBERS_CLOCKWISE.indexOf(value);
        if (position < 0) continue;
        const topSample = ((sample - position * 2) % 40 + 40) % 40;
        for (const offset of [-1, 0, 1]) {
            const index = (topSample + offset + 40) % 40;
            votes[index] += Math.max(1, confidence) * (offset === 0 ? 1 : 0.45);
            contributors[index].add(value);
        }
    }
    const best = votes.indexOf(Math.max(...votes));
    if (!readings.length || !votes[best] || contributors[best].size < 3) return null;
    return {
        angle: -Math.PI / 2 + best * Math.PI / 20,
        confident: votes[best] >= 160,
    };
}

async function recognizeTop(frame: HTMLCanvasElement, alignment: BoardAlignment) {
    const board = makeRectifiedFrame(frame, alignment);
    const sheet = document.createElement('canvas');
    const cellWidth = 88;
    const cellHeight = 72;
    sheet.width = cellWidth * 10;
    sheet.height = cellHeight * 4;
    const context = sheet.getContext('2d', { willReadFrequently: true })!;
    function drawSheet(radius: number) {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, sheet.width, sheet.height);
        for (let i = 0; i < 40; i++) {
            const angle = -Math.PI / 2 + i * Math.PI / 20;
            const x = 400 + radius * Math.cos(angle);
            const y = 400 + radius * Math.sin(angle);
            const left = (i % 10) * cellWidth;
            const top = Math.floor(i / 10) * cellHeight;
            context.save();
            context.beginPath();
            context.rect(left + 3, top + 3, cellWidth - 6, cellHeight - 6);
            context.clip();
            context.translate(left + cellWidth / 2, top + cellHeight / 2);
            context.rotate(-angle - Math.PI / 2);
            context.drawImage(board, -x, -y);
            context.restore();
        }
        return context.getImageData(0, 0, sheet.width, sheet.height);
    }

    const { createWorker, PSM } = await import('tesseract.js');
    const assetBase = `${base}/ocr`;
    const worker = await createWorker('eng', 1, {
        workerPath: `${assetBase}/worker.min.js`,
        corePath: `${assetBase}/core/tesseract-core-lstm.wasm.js`,
        langPath: assetBase,
        workerBlobURL: false,
    });
    try {
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789',
            tessedit_pageseg_mode: PSM.SINGLE_WORD,
        });
        const patch = document.createElement('canvas');
        patch.width = cellWidth * 2;
        patch.height = cellHeight * 2;
        const patchContext = patch.getContext('2d')!;
        const candidates = new Map<string, { sample: number; value: number; confidence: number }>();
        for (const radius of [285, 275, 265, 305]) {
          const raw = drawSheet(radius);
          for (const topMargin of radius === 285 ? [14, 24] : [6, 14]) {
            const image = context.createImageData(sheet.width, sheet.height);
            image.data.set(raw.data);
            for (let y = 0; y < sheet.height; y++) {
                for (let x = 0; x < sheet.width; x++) {
                    const i = (y * sheet.width + x) * 4;
                    const margin = x % cellWidth < 5 || x % cellWidth >= cellWidth - 5 ||
                        y % cellHeight < topMargin || y % cellHeight >= cellHeight - 14;
                    const luminance = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
                    image.data[i] = image.data[i + 1] = image.data[i + 2] = margin ? 255 : luminance > 80 ? 0 : 255;
                }
            }
            for (let sample = 0; sample < 40; sample++) {
                const left = (sample % 10) * cellWidth;
                const top = Math.floor(sample / 10) * cellHeight;
                for (let localY = 0; localY < cellHeight; localY++) {
                    let black = 0;
                    for (let localX = 0; localX < cellWidth; localX++) {
                        if (image.data[((top + localY) * sheet.width + left + localX) * 4] === 0) black++;
                    }
                    if (black > cellWidth * 0.55) {
                        for (let localX = 0; localX < cellWidth; localX++) {
                            const pixel = ((top + localY) * sheet.width + left + localX) * 4;
                            image.data[pixel] = image.data[pixel + 1] = image.data[pixel + 2] = 255;
                        }
                    }
                }
            }
            context.putImageData(image, 0, 0);
            for (let sample = 0; sample < 40; sample++) {
                for (const upsideDown of [false, true]) {
                    patchContext.fillStyle = '#fff';
                    patchContext.fillRect(0, 0, patch.width, patch.height);
                    patchContext.save();
                    if (upsideDown) {
                        patchContext.translate(patch.width, patch.height);
                        patchContext.rotate(Math.PI);
                    }
                    patchContext.drawImage(sheet, (sample % 10) * cellWidth, Math.floor(sample / 10) * cellHeight,
                        cellWidth, cellHeight, 0, 0, patch.width, patch.height);
                    patchContext.restore();
                    const { data } = await worker.recognize(patch);
                    const text = data.text.trim();
                    const value = Number(text);
                    if (/^\d{1,2}$/.test(text) && data.confidence >= 35 && NUMBERS_CLOCKWISE.includes(value) &&
                        (radius === 285 || value === 20)) {
                        const key = `${sample}:${value}`;
                        if ((candidates.get(key)?.confidence ?? 0) < data.confidence) {
                            candidates.set(key, { sample, value, confidence: data.confidence });
                        }
                    }
                }
            }
          }
          if ([...candidates.values()].some(candidate => candidate.value === 20 && candidate.confidence >= 40)) break;
        }
        const readings = [...candidates.values()];
        return orientationFromReadings(readings);
    } finally {
        await worker.terminate();
    }
}

/** Uses exactly one raw frame; no continuous camera processing or image upload. */
export async function alignDartboard(video: HTMLVideoElement): Promise<AlignmentResult | null> {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
        throw new Error('Kamerabild ist noch nicht bereit.');
    }
    const frame = document.createElement('canvas');
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext('2d')!.drawImage(video, 0, 0);
    const detection = await detectBoard(frame);
    if (!detection) return null;
    const { alignment, uncertain } = detection;
    try {
        const orientation = await recognizeTop(frame, alignment);
        if (orientation) alignment.topAngle = orientation.angle;
        return {
            alignment,
            warning: !orientation ? 'Board erkannt, aber keine Zahlen lesbar. Die bisherige Drehung bleibt erhalten.' :
                !orientation.confident || uncertain ? 'Board ausgerichtet; die Ausrichtung ist nur geschätzt.' : null,
        };
    } catch (error) {
        console.error('Zahlenerkennung fehlgeschlagen:', error);
        return { alignment, warning: 'Board erkannt, aber Zahlenerkennung nicht verfügbar. Die bisherige Drehung bleibt erhalten.' };
    }
}
