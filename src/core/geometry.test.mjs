import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canClosePolygon,
  solveQuadrilateralMissingSide,
  polygonArea,
  polygonPerimeter,
  previewRectangleUpdate,
  detectWallConflicts,
} from './geometry.mjs';

test('polygon closure rejects impossible geometry and short inputs', () => {
  assert.equal(canClosePolygon([10, 1, 1]).closable, false);
  assert.match(canClosePolygon([10, 1, 1]).reason, /impossible/i);
  assert.equal(canClosePolygon([2, 2]).closable, false);
  assert.equal(canClosePolygon([3, 4, 5, 3, 4]).closable, true);
  assert.equal(canClosePolygon([3, -1, 5]).closable, false);
});

test('quadrilateral solver requests missing data instead of inventing it', () => {
  const insufficient = solveQuadrilateralMissingSide({ ab: 4, bc: 3 });
  assert.equal(insufficient.solvable, false);
  assert.ok(insufficient.missing.includes('CD'));

  const noAngles = solveQuadrilateralMissingSide({ ab: 4, bc: 3, cd: 4 });
  assert.equal(noAngles.solvable, false);
  assert.ok(noAngles.missing.includes('angles'));

  const rect = solveQuadrilateralMissingSide({ ab: 4, bc: 3, cd: 4, rightAnglesAssumed: true });
  assert.equal(rect.solvable, true);
  assert.equal(rect.da, 3);

  const nonRect = solveQuadrilateralMissingSide({ ab: 4, bc: 3, cd: 3.7, rightAnglesAssumed: true });
  assert.equal(nonRect.solvable, false);
  assert.ok(nonRect.missing.includes('DA'));
});

test('area and perimeter computed from ordered vertices', () => {
  const square = [[0, 0], [4, 0], [4, 3], [0, 3]];
  assert.ok(Math.abs(polygonArea(square) - 12) < 1e-9);
  assert.ok(Math.abs(polygonPerimeter(square) - 14) < 1e-9);
  // L-shaped room is not assumed rectangular:
  const lShape = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
  assert.ok(Math.abs(polygonArea(lShape) - 12) < 1e-9);
  assert.throws(() => polygonArea([[0, 0], [1, 1]]), RangeError);
});

test('rectangle preview recalculates dependent quantities without applying them', () => {
  const p = previewRectangleUpdate({ width: 4, depth: 3, height: 2.7, newWidth: 5 });
  assert.equal(p.valid, true);
  assert.equal(p.area, 15);
  assert.equal(p.perimeter, 16);
  assert.ok(Math.abs(p.wallArea - 2 * (5 + 3) * 2.7) < 1e-9);
  const bad = previewRectangleUpdate({ width: 4, depth: 3, height: 2.7, newWidth: -2 });
  assert.equal(bad.valid, false);
});

test('wall conflicts are reported for user decision, never auto-adjusted', () => {
  const conflicts = detectWallConflicts({
    wallPairs: [['N', 'S', 4.0, 3.95], ['E', 'W', 2.0, 2.005]],
    toleranceMeters: 0.02,
  });
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].walls, ['N', 'S']);
  assert.equal(conflicts[0].resolution, 'pending_user_decision');
});
