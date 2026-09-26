import { test } from 'bun:test';
import assert from 'node:assert/strict';
import {
    alignmentToUnitMatrix,
    boardAlignmentMatrix,
    imageToBoardMatrix,
    invertMatrix,
    transformPoint,
} from '../src/lib/boardAlignmentGeometry.ts';

const alignment = {
    sourceWidth: 1000,
    sourceHeight: 800,
    centerX: 0.52,
    centerY: 0.48,
    majorRadius: 0.35,
    minorRadius: 0.23,
    majorAngle: 0.4,
    topAngle: -Math.PI / 2,
};

function near(actual, expected, tolerance = 1e-8) {
    assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

test('projective rectification keeps the ring round and puts the bull at center', () => {
    const cx = alignment.centerX * alignment.sourceWidth;
    const cy = alignment.centerY * alignment.sourceHeight;
    const major = alignment.majorRadius * alignment.sourceHeight;
    const minor = alignment.minorRadius * alignment.sourceHeight;
    const cosine = Math.cos(alignment.majorAngle);
    const sine = Math.sin(alignment.majorAngle);
    const projectedBull = {
        x: cx + major * cosine * 0.22 - minor * sine * 0.12,
        y: cy + major * sine * 0.22 + minor * cosine * 0.12,
    };
    const withBull = {
        ...alignment,
        bullX: projectedBull.x / alignment.sourceWidth,
        bullY: projectedBull.y / alignment.sourceHeight,
    };
    const toUnit = alignmentToUnitMatrix(withBull);
    assert.ok(toUnit);
    const bull = transformPoint(toUnit, projectedBull.x, projectedBull.y);
    near(bull.x, 0);
    near(bull.y, 0);
    for (let index = 0; index < 20; index++) {
        const angle = index * Math.PI / 10;
        const x = cx + major * cosine * Math.cos(angle) - minor * sine * Math.sin(angle);
        const y = cy + major * sine * Math.cos(angle) + minor * cosine * Math.sin(angle);
        const point = transformPoint(toUnit, x, y);
        near(Math.hypot(point.x, point.y), 1);
    }
    const toBoard = imageToBoardMatrix(withBull, 800, 220);
    assert.ok(toBoard);
    const centered = transformPoint(toBoard, projectedBull.x, projectedBull.y);
    near(centered.x, 400);
    near(centered.y, 400);
    const inverse = invertMatrix(toBoard);
    assert.ok(inverse);
    const restored = transformPoint(inverse, centered.x, centered.y);
    near(restored.x, projectedBull.x);
    near(restored.y, projectedBull.y);
});

test('alignment scales to different contained camera views', () => {
    const view = { width: 600, height: 400, videoWidth: 1000, videoHeight: 800 };
    const matrix = boardAlignmentMatrix(alignment, view);
    assert.ok(matrix);
    const fit = Math.min(view.width / view.videoWidth, view.height / view.videoHeight);
    const offsetX = (view.width - view.videoWidth * fit) / 2;
    const offsetY = (view.height - view.videoHeight * fit) / 2;
    const center = transformPoint(matrix,
        offsetX + alignment.centerX * alignment.sourceWidth * fit,
        offsetY + alignment.centerY * alignment.sourceHeight * fit);
    near(center.x, 300);
    near(center.y, 200);
    const topSource = transformPoint(invertMatrix(alignmentToUnitMatrix(alignment)), 0, -1);
    const top = transformPoint(matrix, offsetX + topSource.x * fit, offsetY + topSource.y * fit);
    near(top.x, 300);
    near(top.y, 60);
});
