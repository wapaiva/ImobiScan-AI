/**
 * Geometry engine — constraint-based room closure.
 *
 * Rules honoured (per master prompt section 10.2):
 * - A room is NOT assumed to be rectangular.
 * - The engine never silently adjusts measurements to force closure.
 * - When data is insufficient for a unique geometry, it reports what is
 *   missing instead of inventing values.
 * - Impossible geometries and open loops are detected and reported.
 */

const EPSILON = 1e-9;

/**
 * Validates whether a sequence of wall lengths can close a polygon.
 * Necessary condition: the longest side must not exceed the sum of the others.
 */
export function canClosePolygon(sideLengths) {
  if (!Array.isArray(sideLengths) || sideLengths.length < 3) {
    return { closable: false, reason: 'A closed environment requires at least 3 walls.' };
  }
  for (const s of sideLengths) {
    if (!Number.isFinite(s) || s <= 0) {
      return { closable: false, reason: 'All wall lengths must be positive finite numbers.' };
    }
  }
  const sorted = [...sideLengths].sort((a, b) => a - b);
  const longest = sorted[sorted.length - 1];
  const rest = sorted.slice(0, -1).reduce((acc, v) => acc + v, 0);
  if (longest > rest + EPSILON) {
    return {
      closable: false,
      reason: `Geometry impossible: the longest wall (${longest} m) exceeds the sum of the remaining walls (${rest} m).`,
    };
  }
  return { closable: true, deficit: rest - longest };
}

/**
 * Computes the fourth side of a quadrilateral given three consecutive sides
 * and the two right angles implied by an axis-aligned layout. Returns null
 * when inputs are insufficient — the caller must then request additional
 * measurements or accept a clearly-marked provisional solution.
 */
export function solveQuadrilateralMissingSide({ ab, bc, cd, rightAnglesAssumed = false }) {
  const sides = [ab, bc, cd];
  if (sides.some((s) => !Number.isFinite(s) || s <= 0)) {
    return { solvable: false, missing: sides.map((s, i) => (Number.isFinite(s) && s > 0 ? null : ['AB', 'BC', 'CD'][i])).filter(Boolean) };
  }
  if (!rightAnglesAssumed) {
    return {
      solvable: false,
      missing: ['angles'],
      note: 'Without confirmed right angles the fourth side cannot be derived uniquely. Provide the DA measurement or confirm perpendicularity.',
    };
  }
  // Axis-aligned rectangle-like closure: DA spans the net offset of AB vs CD.
  const da = Math.abs(ab - cd) === 0 ? bc : null;
  // For a strict rectangle AB == CD and BC == DA.
  if (Math.abs(ab - cd) > EPSILON) {
    return {
      solvable: false,
      missing: ['DA'],
      note: 'AB and CD differ; the shape is not a closed rectangle. Measure side DA explicitly.',
    };
  }
  return { solvable: true, da: bc, provisional: false };
}

/** Shoelace area of a simple polygon given ordered vertices in metres. */
export function polygonArea(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    throw new RangeError('Polygon area requires at least 3 vertices.');
  }
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Perimeter of an ordered vertex list in metres. */
export function polygonPerimeter(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    throw new RangeError('Polygon perimeter requires at least 3 vertices.');
  }
  let total = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

/**
 * Applies a confirmed length to one wall of a rectangular room preview and
 * recomputes dependent quantities. It returns a PREVIEW only; applying it is
 * an explicit user decision made elsewhere (controlled changes workflow).
 */
export function previewRectangleUpdate({ width, depth, height, newWidth, newDepth }) {
  const w = newWidth ?? width;
  const d = newDepth ?? depth;
  for (const [label, v] of [['width', w], ['depth', d], ['height', height]]) {
    if (!Number.isFinite(v) || v <= 0) {
      return { valid: false, error: `Invalid ${label}: dependent geometry will not be recalculated.` };
    }
  }
  const closure = canClosePolygon([w, d, w, d]);
  return {
    valid: closure.closable,
    provisional: false,
    area: w * d,
    perimeter: 2 * (w + d),
    wallArea: 2 * (w + d) * height,
    affected: { width: w, depth: d },
  };
}

/**
 * Detects conflicts between measurements associated to opposite walls of a
 * nominal rectangle. Divergences are reported for user decision; nothing is
 * averaged or adjusted automatically.
 */
export function detectWallConflicts({ wallPairs, toleranceMeters = 0.02 }) {
  const conflicts = [];
  for (const [aName, bName, a, b] of wallPairs) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const diff = Math.abs(a - b);
    if (diff > toleranceMeters) {
      conflicts.push({
        walls: [aName, bName],
        values: [a, b],
        difference: diff,
        resolution: 'pending_user_decision',
      });
    }
  }
  return conflicts;
}
