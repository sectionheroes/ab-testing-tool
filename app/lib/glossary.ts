/**
 * The glossary — one definition per term, referenced by key from every tooltip (plan WP5a).
 *
 * No tooltip text ever stands inline in JSX. The reason is drift: "Key" is explained on the experiment form, on the
 * experiment detail page and later on Results, and three hand-written sentences become three slightly different
 * promises about the same field.
 *
 * **Which terms get a tooltip at all is DESIGN.md §10, not this file.** Only where a layperson actually stumbles,
 * once per term at its first occurrence on a page, never on a self-explanatory column header. A term may live here
 * and be rendered nowhere — that is fine. The reverse is not.
 *
 * Text is English (CLAUDE.md overrides DESIGN.md §8), numbers de-DE.
 */
export const glossary = {
  /** Contract 4.1: the slug that identifies the experiment in the cart attribute. */
  key: "The short name this test is stored under. It travels with every order as part of the cart attribute, so it cannot change once the test has run.",

  /** Contract 4.4. Shown read-only on the detail page, never on create. */
  salt: "A fixed random string that decides which visitor sees which variant. It never changes after the test is created — changing it would reshuffle everyone and invalidate the numbers collected so far.",

  /** Experiment.allocation — "Visitors in test" in the form. */
  allocation:
    "How much of the traffic takes part at all. At 50 % half the visitors see the original page and are not counted anywhere; the other half is split between the variants below.",

  /** Experiment.trigger — "Count a visitor" in the form. */
  trigger:
    "When a visitor counts as part of the test. On page load counts everyone who opens a matching page. On scroll counts only visitors who actually saw the element you changed, which gives cleaner numbers but fewer of them.",

  hideUntilApplied:
    "Hides the page for a few milliseconds until the variant has been applied, so nobody sees the original flash past first. Costs a little speed on every matching page.",

  /** ADR-0036 — the "When is it decided?" card and the Result column of the list. */
  stoppingRule:
    "A result only gets a verdict once enough has been collected: the conversions per variant below, the minimum runtime, and a whole number of weeks counted from the start day. Until all three are reached the tool shows counts but no winner.",

  /** ADR-0036 — the MDE derived from the conversion target. */
  detectableLift:
    "The smallest improvement this test can reliably tell apart from chance. A smaller number needs more conversions. If the real effect is below it, the test will most likely end without a verdict.",

  /** ADR-0036 / lib/stats README: for RPV the planner is a floor, not a promise. */
  detectableLiftRpv:
    "Revenue per visitor varies far more than a conversion rate, so this number is a floor rather than a promise: the real test is somewhat weaker than the figure suggests. Treat it as the best case and plan with some room.",

  /** The baseline conversion rate the planner derives the visitor numbers from. */
  baselineCr:
    "The conversion rate we expect without any change, taken from an earlier test in this shop. It only affects the runtime estimate, never the result.",

  /** The projection shown under the stopping rule. */
  runtimeEstimate:
    "How long this test would take at the speed of the last test in this shop. A different page or a narrower audience changes that speed, so treat it as a rough order of magnitude.",

  /** SRM — Result column of the list, "Assignment broken". */
  srm: "Far more visitors ended up in one variant than the split says they should. Something is interfering with the assignment, so the numbers cannot be compared and this test gets no verdict until it is fixed.",

  /** Contract 4.8: conversions count visitors, not orders. */
  conversions: "Visitors who bought at least once. A visitor who placed three orders counts once here — the order count is a separate number.",

  /** Contract 4.4 force mode, shown in the QA block of a running experiment. */
  forceLink:
    "Opens the shop with one variant forced on, for this browser only. Nothing is counted and no cart attribute is set, so you can check a variant without touching the numbers.",
} as const;

export type GlossaryKey = keyof typeof glossary;
