// Named viewport profiles for the visual verification suite (feature 011,
// data-model.md "Viewport Profile"). Every scenario selects its geometry
// from these constants — no ad-hoc viewport sizes anywhere else.

/** A named browser geometry at which scenarios render and measure. */
export interface Profile {
  /** Short machine name used in failure messages and screenshot files. */
  name: string;
  width: number;
  height: number;
}

// Phone portrait (C2.1/C2.2/C2.3 core set)
export const PHONE_320: Profile = { name: "320x568", width: 320, height: 568 };
export const PHONE_375: Profile = { name: "375x667", width: 375, height: 667 };
export const PHONE_430: Profile = { name: "430x932", width: 430, height: 932 };

// Phone landscape (C2.5)
export const LANDSCAPE_740: Profile = { name: "740x360", width: 740, height: 360 };

// Tablet spot checks (C2.6)
export const TABLET_640: Profile = { name: "640x960", width: 640, height: 960 };
export const TABLET_768: Profile = { name: "768x1024", width: 768, height: 1024 };

// Desktop (C2.3 40 px cap engagement + C2.6)
export const DESKTOP_1280: Profile = { name: "1280x800", width: 1280, height: 800 };

/** All profiles, in spec order (spec Assumptions). */
export const ALL_PROFILES: readonly Profile[] = [
  PHONE_320,
  PHONE_375,
  PHONE_430,
  LANDSCAPE_740,
  TABLET_640,
  TABLET_768,
  DESKTOP_1280,
];

/** Portrait profiles used by the core vote-screen guarantees (C2.1–C2.3). */
export const PORTRAIT_PROFILES: readonly Profile[] = [
  PHONE_320,
  PHONE_375,
  PHONE_430,
];

/** Geometry tolerance for rect equality / pair-to-pair identity (spec Q5, FR-003). */
export const GEOMETRY_TOLERANCE_PX = 1;

/** Page margin each side of the vote row (010: maximality = viewport minus 2×24 px). */
export const ROW_MARGIN_PX = 24;
