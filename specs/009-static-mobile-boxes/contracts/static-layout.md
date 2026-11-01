# UI Static-Layout Contract (009 — amendment to the 008 UI layout contract)

Date: 2026-11-03. Feature 009 layers a **staticity** guarantee on top of
the 008 contract (`specs/008-mobile-vote-layout/contracts/ui-layout.md`),
whose C-clauses remain fully in force (C1.1–C1.6, C2, C3, C4). The
S-clauses below override 008 C1.5's fallback wording (cards no longer
"flex narrower" per pair — they are content-independent halves; the row
still never scrolls or stacks). Otherwise: same screens, same elements,
same violation semantics — any S-clause failure at a tested width is a
spec violation, verified by the quickstart check matrix.

## S1 — Pair-box staticity (screen: `/`, vote state)

| # | Guarantee |
|---|---|
| S1.1 | Each name box has a **content-independent** size: its rectangle at a given viewport does not depend on which names the current pair holds. Box sizes are a function of the viewport (width) only. |
| S1.2 | Box positions follow from box sizes: at a given viewport the left box, "oder" separator, and right box occupy fixed rectangles — pixel-identical across every consecutive pair. Nothing moves, grows, shrinks, or reflows between pairs (FR-001). |
| S1.3 | The layout is **two equal halves**: left box and right box are equally wide at every supported width (separator + gaps fixed between them). Slot order is markup order: pair[0] left, pair[1] right — every pair, no swapping (refines 008 C1.4). |
| S1.4 | Text is fitted into the immutable boxes, never the reverse: 008's chain (shrink via font clamp → ellipsis as last resort) operates inside the box; a box's border/edge never expands or contracts because of its text (FR-002). |
| S1.5 | Re-derived 008 C1.3-data under static halves: with the current 200-name set (longest "Maximilian"/"Konstantin", ≈87 px text at the 15 px floor) the ellipsis step stays unreachable at ≥320 px — static card ≈106 px at 320 px with the padding floor cut to 8 px per side leaves ≥90 px text room (worst-case math in research.md R3). |
| S1.6 | Viewport-only variability: rotation, window resize, or an enlarged device font setting may re-derive the static geometry **once**; after that, S1.1/S1.2 hold again under the new geometry across consecutive pairs (FR-005). |
| S1.7 | Surrounding-element immunity: any notice (uncounted votes, errors) appearing or disappearing above/below the pair row must not change the pair boxes' rectangles (FR-006). |

## S2 — Touch targets under staticity (FR-008; refines 008 C2)

| # | Guarantee |
|---|---|
| S2.1 | Static box widths never drop below 44 px (they are ≈106 px at the tightest 320 px viewport — research R4), and `min-height: 44px` stays declared on the name boxes; the whole fixed box is the tap target, independent of how much text it shows (incl. short names). |
| S2.2 | `min-height: 44px` remains declared on `.noticeDismiss` and the sign-out button (008 R4 inherited, unchanged). |

## S3 — Behavior preservation (FR-007; inherits 008 C4)

| # | Guarantee |
|---|---|
| S3.1 | Zero changes to vote submission, async dispatch/retry, notice counting/dismissal, pair generation, session handling. |
| S3.2 | Accessible names/ARIA unchanged (vote buttons carry the name text; notice keeps `role="alert"`). |
| S3.3 | Markup untouched: the fix is stylesheet-only (`.nameButton` flex tuning + padding floor), so S3.1/S3.2 hold by construction. |
