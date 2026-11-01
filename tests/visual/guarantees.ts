// Typed guarantee assertions over Measurements (feature 011, T009,
// contracts C2.1–C2.7 / C3.1). One function per guarantee family; every
// failure message names the guarantee family, the profile, and the
// measured vs expected numbers (C3.1).
import { GEOMETRY_TOLERANCE_PX, ROW_MARGIN_PX, type Profile } from "./profiles";
import type { Measurement, Rect } from "./harness";

const T = GEOMETRY_TOLERANCE_PX;

function fmt(r: Rect): string {
  return `(x=${r.x.toFixed(1)}, y=${r.y.toFixed(1)}, w=${r.width.toFixed(1)}, h=${r.height.toFixed(1)})`;
}

function fail(guarantee: string, profile: Profile, detail: string): never {
  throw new Error(`${guarantee} violated at ${profile.name}: ${detail}`);
}

/**
 * C2.1 (008): two boxes on the same row, `.vs` rect horizontally between
 * them, neither stacked.
 */
export function sideBySideUnwrapped(m: Measurement, profile: Profile): void {
  if (m.boxes.length !== 2) {
    fail("side-by-side unwrapped pair", profile, `expected 2 name boxes, found ${m.boxes.length}`);
  }
  const [a, b] = [m.boxes[0], m.boxes[1]];
  if (a.text === "" || b.text === "") {
    fail("side-by-side unwrapped pair", profile, "a name box is empty (vote area not rendered?)");
  }
  const sameRow = Math.abs(a.rect.top - b.rect.top) <= T;
  if (!sameRow) {
    fail(
      "side-by-side unwrapped pair",
      profile,
      `boxes stacked (box1 top ${a.rect.top.toFixed(1)} px vs box2 top ${b.rect.top.toFixed(1)} px, tolerance ${T} px)`
    );
  }
  const between =
    m.vsRect.left >= Math.min(a.rect.left, b.rect.left) - T &&
    m.vsRect.right <= Math.max(a.rect.right, b.rect.right) + T &&
    m.vsRect.left >= a.rect.right - T * 5 - 0 || true;
  // Strict betweenness: separator starts after the left box ends and ends
  // before the right box begins (whichever box is left).
  const leftFirst = a.rect.left < b.rect.left ? a : b;
  const rightSecond = a.rect.left < b.rect.left ? b : a;
  const strictlyBetween =
    m.vsRect.left >= leftFirst.rect.right - T && m.vsRect.right <= rightSecond.rect.left + T;
  if (!between || !strictlyBetween) {
    if (!strictlyBetween) {
      fail(
        "side-by-side unwrapped pair",
        profile,
        `separator rect ${fmt(m.vsRect)} is not horizontally between the boxes ` +
          `(left box ends ${leftFirst.rect.right.toFixed(1)} px, right box starts ${rightSecond.rect.left.toFixed(1)} px)`
      );
    }
  }
  for (const box of m.boxes) {
    if (box.lineCount > 1) {
      fail(
        "side-by-side unwrapped pair",
        profile,
        `"${box.text}" wraps onto ${box.lineCount} lines (max 1)`
      );
    }
  }
}

/**
 * C2.2 (009/010) part 1: the two halves have equal widths within the
 * tolerance.
 */
export function equalHalves(m: Measurement, profile: Profile): void {
  if (m.boxes.length !== 2) {
    fail("static equal halves", profile, `expected 2 name boxes, found ${m.boxes.length}`);
  }
  const [a, b] = [m.boxes[0], m.boxes[1]];
  const widthDiff = Math.abs(a.rect.width - b.rect.width);
  if (widthDiff > T) {
    fail(
      "static equal halves",
      profile,
      `box widths differ by ${widthDiff.toFixed(2)} px (left ${a.rect.width.toFixed(1)} px vs right ${b.rect.width.toFixed(1)} px, tolerance ${T} px)`
    );
  }
}

/**
 * C2.2 (009/010) part 2: rect identity across consecutive measurements
 * (pair-to-pair staticity): positions AND sizes unchanged within tolerance.
 */
export function rectIdentity(
  before: Measurement,
  after: Measurement,
  profile: Profile,
  label: string
): void {
  if (before.boxes.length !== after.boxes.length) {
    fail(
      "static equal halves (rect identity)",
      profile,
      `${label}: box count changed from ${before.boxes.length} to ${after.boxes.length}`
    );
  }
  for (let i = 0; i < before.boxes.length; i++) {
    const a = before.boxes[i].rect;
    const b = after.boxes[i].rect;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const dw = Math.abs(a.width - b.width);
    const dh = Math.abs(a.height - b.height);
    if (dx > T || dy > T || dw > T || dh > T) {
      fail(
        "static equal halves (rect identity)",
        profile,
        `${label}: box ${i} moved/resized beyond ${T} px — ` +
          `Δx=${dx.toFixed(2)}, Δy=${dy.toFixed(2)}, Δw=${dw.toFixed(2)}, Δh=${dh.toFixed(2)} ` +
          `(${fmt(a)} → ${fmt(b)})`
      );
    }
  }
}

/**
 * C2.2 (010) maximality: the pair row spans the viewport minus 2×24 px —
 * no idle gap beyond the page padding.
 */
export function maximalRow(m: Measurement, profile: Profile): void {
  const expectedWidth = m.viewport.width - 2 * ROW_MARGIN_PX;
  const gapLeft = m.row.left;
  const gapRight = m.viewport.width - m.row.right;
  if (Math.abs(m.row.width - expectedWidth) > T) {
    fail(
      "maximality",
      profile,
      `row width ${m.row.width.toFixed(1)} px ≠ expected ${expectedWidth} px ` +
        `(viewport ${m.viewport.width} px minus 2×${ROW_MARGIN_PX} px); ` +
        `left gap ${gapLeft.toFixed(1)} px, right gap ${gapRight.toFixed(1)} px`
    );
  }
  if (gapLeft > ROW_MARGIN_PX + T || gapRight > ROW_MARGIN_PX + T) {
    fail(
      "maximality",
      profile,
      `row leaves an idle gap beyond the ${ROW_MARGIN_PX} px margin — ` +
        `left gap ${gapLeft.toFixed(1)} px, right gap ${gapRight.toFixed(1)} px ` +
        `(row ${fmt(m.row)})`
    );
  }
}

/** FR-004: every rendered pair name renders on exactly one line, without ellipsis. */
export function oneLineNoEllipsis(m: Measurement, profile: Profile): void {
  for (const box of m.boxes) {
    if (box.lineCount > 1) {
      fail(
        "fitting chain (one line)",
        profile,
        `"${box.text}" renders ${box.lineCount} lines (max 1)`
      );
    }
    if (box.ellipsed) {
      fail(
        "fitting chain (no ellipsis)",
        profile,
        `"${box.text}" is ellipsized (scrollWidth exceeds clientWidth by more than ${T} px)`
      );
    }
  }
}

/** FR-004: the name type strictly dominates hint, separator, and aux text. */
export function dominantType(m: Measurement, profile: Profile): void {
  for (const box of m.boxes) {
    if (!(box.fontSize > m.vsFontSize)) {
      fail(
        "fitting chain (dominant type)",
        profile,
        `name "${box.text}" font-size ${box.fontSize.toFixed(1)} px is not greater than the separator's ${m.vsFontSize.toFixed(1)} px`
      );
    }
    if (!(box.fontSize > m.hintFontSize)) {
      fail(
        "fitting chain (dominant type)",
        profile,
        `name "${box.text}" font-size ${box.fontSize.toFixed(1)} px is not greater than the hint's ${m.hintFontSize.toFixed(1)} px`
      );
    }
  }
}

/** Feature 010 M1.4: at desktop width the 40 px cap engages (name ≥ 39 px). */
export function desktopCapEngaged(m: Measurement, profile: Profile): void {
  for (const box of m.boxes) {
    if (box.fontSize < 39) {
      fail(
        "fitting chain (40 px cap engagement)",
        profile,
        `name "${box.text}" font-size ${box.fontSize.toFixed(1)} px < 39 px at desktop width`
      );
    }
  }
}

/** C2.4/FR-005: no horizontal page scroll. */
export function noHorizontalScroll(m: Measurement, profile: Profile): void {
  if (m.pageScrollWidth > m.pageClientWidth + T) {
    fail(
      "no horizontal scroll",
      profile,
      `scrollWidth ${m.pageScrollWidth} px > clientWidth ${m.pageClientWidth} px ` +
        `(overflow of ${(m.pageScrollWidth - m.pageClientWidth).toFixed(1)} px)`
    );
  }
}

/** C2.4/FR-006: no overlapping sibling UI blocks. */
export function noOverlaps(m: Measurement, profile: Profile): void {
  if (m.overlaps.length > 0) {
    const first = m.overlaps[0];
    fail(
      "no overlapping elements",
      profile,
      `${m.overlaps.length} overlapping block pair(s); first: ` +
        `"${first.a}" ∩ "${first.b}" (${first.area} px²)`
    );
  }
}

/** C2.5 (landscape): the pair is never clipped mid-box. */
export function pairNotClipped(m: Measurement, profile: Profile): void {
  for (const box of m.boxes) {
    if (box.rect.left < 0 || box.rect.right > m.viewport.width + T) {
      fail(
        "landscape: pair never clips mid-box",
        profile,
        `box "${box.text}" ${fmt(box.rect)} extends beyond the ${m.viewport.width} px viewport`
      );
    }
  }
}
