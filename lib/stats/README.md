# lib/stats

The statistics engine. Pure TypeScript, no database, no imports from `app/` (ESLint boundary, plan §2). Everything the
dashboard, the CLI and the frozen snapshot report comes from here.

`STATS_VERSION` (currently **2.0.0**) is written into every `ExperimentResult` snapshot (ADR-0025). **Bump it by hand
whenever a formula changes** – a new test statistic, a different CI method, a change to the winsorization rule, the
Bonferroni rule or a sample-size formula. Adding a field or fixing a comment is not a formula change.

**2.0.0 (WP4.1)** changed two things that move numbers, hence the major bump: the conversion count (one conversion is
one *visitor* now that `_ab_v` binds orders to exposures, ADR-0033 – it was one *identity* under ADR-0032) and the
evaluability rule (the three-condition stopping rule of ADR-0036 replaced the single `plannedSampleSize`).

## What is in here

| Function | Does | Method |
|---|---|---|
| `twoProportionZTest(a, b)` | CR comparison | pooled two-sided z-test; CI for the **relative** lift via the Katz log method |
| `welchTTest(samplesA, samplesB, { winsorize })` | RPV / AOV comparison | Welch–Satterthwaite t-test on values capped at the 99th percentile of **both arms pooled** |
| `welchTTestFromMoments(a, b)` | same, from summary statistics | used by `stats.server.ts`, which winsorizes in SQL so a million rows stay in Postgres |
| `srmCheck(observed, weights)` | Sample Ratio Mismatch | Pearson chi-square goodness of fit, `df = k − 1`, alarm at `p < 0.001` |
| `sampleSize({ … })` | planning | Fleiss normal approximation for CR, two-sample means formula for RPV/AOV |
| `rpvMomentsFromOrders(cr, amounts)` | σ of RPV from order history | `Var(RPV) ≈ CR·E[AOV²] − (CR·AOV)²` (plan WP4) |
| `conversionsForMde` / `mdeFromConversions` | the planner, both ways | `MDE ≈ (z_{1−α/2} + z_power)·√(2/C)` (ADR-0036) |
| `rpvSurcharge(targetPower)` | the RPV correction | derived from the measured power, see below |
| `evaluateStoppingRule({ … })` | when a verdict may be read | the three conditions of ADR-0036 |
| `classifyChannel(referrer, utm)` | traffic source of an exposure | the ten groups of contract 4.10, first rule wins |
| `evaluate(experiment, variantStats, statsVersion)` | the verdict | applies contract 4.8 end to end |
| `guardrail(variantStats)` | breakage hint | from 500 visitors per arm, CR below half the control's |

`timezone.ts` holds the calendar arithmetic both the aggregation and the stopping rule need – the UTC interval a local
day covers, and the day counting that week boundaries rest on. It lives here rather than in `app/services` because
`evaluate()` needs it and `lib/` must not import from `app/` (plan §2); `app/services/timezone.ts` re-exports it.

`distributions.ts` holds the normal, Student-t and chi-square CDFs and quantiles (Hart 1968 for Φ, Acklam plus one
Halley step for Φ⁻¹, Numerical Recipes continued fractions for the incomplete beta and gamma). They agree with
scipy 1.13.1 to ~1e-12; `test/distributions.test.ts` pins that.

## The one rule

> `significant` is `true` only when `stoppingRuleMet && pValue < alpha`.

Never otherwise, in no branch, for no metric. `evaluate()` enforces it in one place and `test/evaluate.test.ts` asserts
it with a p-value below 0.001 that still returns `significant: false`. Fixed-horizon testing is the whole point of
ADR-0018 – peeking is the failure mode this tool exists to avoid.

## The stopping rule (ADR-0036)

Three conditions, **all of them that are set** have to be met. All of them off means never significant, exactly as a
missing `plannedSampleSize` did before.

| Condition | Default | Meaning |
|---|---|---|
| `minConversionsPerArm` | 1 000 | converting visitors in the **slowest** arm (4.8) |
| `minDurationDays` | 14 | calendar days since `startedAt`, in `Shop.timezone` |
| `requireFullWeeks` | true | only on multiples of 7 days **from the start date**, never from Monday |

`evaluate()` returns a status per condition plus an overall `met` and `evaluableOn` – the latest of the three end
dates, with the conversions one projected from the pace so far. Before the first conversion there is no pace, so the
date stays `null` rather than being guessed. A projected date more than six weeks after the start sets a **futility**
warning: the MDE is too small for this traffic. Nothing is ever stopped automatically – same posture as the guardrail.

Why conversions and not visitors: the relative standard error of a conversion count is ≈ √(1/C), so 1 000 conversions
per arm buy ~12.5 % relative MDE whether the shop converts at 1 % or at 5 %. A visitor target would need a baseline CR
we do not have, because we only ever see the visitors of a running experiment, never the shop's whole traffic.

The rule may only be **tightened** while an experiment is `RUNNING` (contract 4.6, enforced in
`experiments.server.ts`). Loosening it would let anyone set the threshold below the current stand and unlock a p-value
on demand – the back door that would make the whole fixed horizon decorative.

## Channels (contract 4.10)

`classifyChannel(referrer, utm, { selfHosts })` returns one of ten groups, first matching rule wins. It is **derived,
never stored**: change a host or medium list and old reports change with it, except for ENDED experiments, which read
the frozen snapshot (ADR-0025). That is intended, and it is why `CHANNEL_LISTS_VERSION` exists.

Two departures from the printed order of 4.10, both deliberate and both tested:

- `organic_shopping` is checked before `organic_search`, because `shopping.google.com` and `google.com/shopping` are
  shopping surfaces on a search-engine host. No host is genuinely in both lists, so nothing else moves.
- `selfHosts` (the shop's own domain) is not in the contract, but "any other **external** referrer" implies it.
  Without it every internal navigation would count as a `referral`.

The numbers will not match Shopify Analytics: different attribution moment (exposure, not purchase) and a different
model. The results page has to say so under the table.

Related: only the **primary** metric gets a p-value. Secondary metrics carry an estimate and a confidence interval and
nothing else (4.8). With more than two variants, alpha is divided by the number of comparisons (Bonferroni).

## Reference tests

Every test statistic reproduces a published worked example to 4 decimals before it is used (ADR-0018). The expected
numbers are quoted from the source; each was re-derived with scipy 1.13.1 as a second source.

| Test | Source | Reproduced |
|---|---|---|
| Two-proportion z | OpenStax, *Introductory Statistics 2e* §10.3, Examples 10.8 / 10.9 / 10.10 | `z = 1.4744`, two-tailed `p = 0.1404`; `z = −1.2565`, one-tailed `p = 0.1045`; `z = 2.3305`, `pc = 0.0927` |
| Welch t | NIST/SEMATECH *e-Handbook* §7.3.1 (assembly times, two processes) | `t = 2.2694`, `ν = 15.5325` (the handbook prints 15.5), means 36.0909 / 32.2222, sds 4.9082 / 2.5386 |
| Chi-square GOF | OpenStax, *Introductory Statistics 2e* §11.2, Examples 11.2 / 11.3 / 11.4 | `χ² = 3`, `df = 4`, `p = 0.5578`; `χ² = 29.6464`, `p = 5.7764e−6`; `χ² = 2.14`, `df = 2`, `p = 0.3430` |

Two notes where a publication is internally inconsistent and we follow the counts, not the print:

- OpenStax 10.10 prints `z = 2.33` (which we reproduce exactly, 2.3305) but a p-value of 0.0092. `P(Z > 2.33)` is
  0.00989; 0.0092 would need `z = 2.3575`. We assert the statistic against the publication and take the p-value from
  Examples 10.8/10.9.
- OpenStax 11.3 prints `χ² = 29.65`; its own observed and expected counts give 29.6464. We assert both.

The CI for the relative lift and the sample-size formulas are validated differently, because matching a third party's
rounding proves less than checking the property itself. `test/coverage.test.ts` measures, seeded:

| Property | Measured |
|---|---|
| Katz 95 % interval for the relative CR lift covers the true lift | **95.10 %** (2 000 runs) |
| Welch 95 % interval for the absolute RPV difference covers the truth | **95.25 %** (2 000 runs) |
| `sampleSize({ metric: "CR", … })` delivers its 80 % power | **79.60 %** at n = 24 193 per arm |
| `sampleSize({ metric: "RPV", … })` delivers its 80 % power, on the equal-variance normal problem the formula describes | **78.83 %** at n = 100 466 per arm |

The methods themselves are cited in the source comments (Katz et al., *Biometrics* 34 (1978) 469–474; Fleiss,
*Statistical Methods for Rates and Proportions*).

### Where the sample-size planner is optimistic

On realistic revenue data the same n buys **less** than 80 % power. Measured: a 10 % RPV lift on zero-inflated
lognormal revenue (CR 3 %, μ = 4.2, σ = 0.7) at the n the planner returns rejects **71.6 %** of the time, not 80 %.

Two reasons, both inherent to the formula plan WP4 specifies:

1. `n = 2(z + z_power)²σ²/Δ²` assumes **both arms have the same σ**. A real RPV lift is a bigger basket, so the
   variant's variance grows with the effect.
2. `Var(RPV) ≈ CR·E[AOV²] − (CR·AOV)²` treats a visitor as having at most one order, which understates the variance.

So read the planner as a floor, not a promise. **The surcharge is derived from that measurement, not estimated**
(ADR-0036 explicitly retires an earlier guessed "20–25 %"). For a two-sample mean test,
power = Φ(√(n/2)·Δ/σ − z_{1−α/2}), so the measured power fixes √(n/2)·Δ/σ at the n the planner returned and asking for
the target power instead scales n by

    n₁/n₀ = ( (z_{1−α/2} + z_target) / (z_{1−α/2} + z_measured) )²

At α = 0.05, measured 71.6 % and target 80 % that is **1.2253** – round up by about 23 %. `sampleSize()` returns it as
`perVariantConservative` next to the floor, so a caller cannot forget to apply it, and it is 1 for CR, where the
formula holds.

The gap is pinned by a test (`documents how much power that same n really has…`), which also asserts that the measured
power still matches `RPV_POWER_AT_PLANNED_N` within 2 SE – if the implementation drifts, the test fails rather than the
surcharge silently going wrong. If it ever reaches 80 % or drops below 60 %, this section is wrong and needs rewriting.

## A/A Monte-Carlo: measured false-positive rate

`test/aa-simulation.test.ts` runs **10 000 simulated A/A experiments** per metric – both arms drawn from the same
distribution, so every rejection is a false positive by construction. `n` is drawn from 5 000–50 000 per arm, the true
CR from 2–4 %, and the order value is lognormal (`μ = 4.2`, `σ = 0.7`, mean ≈ 85 €). The RNG is seeded
(xoshiro128\*\*), so these numbers are exact and reproducible, not a coin flip in CI.

| Metric | Test | Measured FPR | Band |
|---|---|---|---|
| CR | pooled two-proportion z | **4.98 %** (498 / 10 000) | 4–6 % ✅ |
| RPV | Welch t, winsorized at p99 | **5.36 %** (536 / 10 000) | 4–6 % ✅ |

Runtime ≈ 15 s, almost all of it RPV (it needs the full per-visitor vector to winsorize). That fits the default suite,
so there is no separate slow suite – `pnpm test` runs it on every invocation and `.github/workflows/ci.yml` runs it on
every pull request.

**The band is not negotiable.** At 10 000 runs the standard error of the measured rate is
√(0.05 · 0.95 / 10 000) ≈ 0.22 pp, so 4 % and 6 % sit about 4.6 standard errors from 5 %. At 2 000 runs the band would
be ~2 SE wide and the test would flake. If a rate lands outside the band, the implementation is wrong – fix the
implementation. Never widen the band, never lower the run count (CLAUDE.md).

### What we measured around the band

Four further seeds, 10 000 runs each, to check the test is not riding an edge:

| Seed | CR | RPV |
|---|---|---|
| 1 | 5.07 % | 4.85 % |
| 2 | 4.93 % | 4.90 % |
| 3 | 5.20 % | 4.54 % |
| 4 | 5.11 % | 4.75 % |

And on the effect of the winsorization rule itself (same draws, same seed, 10 000 runs):

| Variant | FPR |
|---|---|
| RPV, winsorized at p99 over both arms (contract 4.8) | 5.36 % |
| RPV, no winsorization | 5.16 % |
| RPV, winsorized, only small arms (n = 5 000–10 000) | 4.91 % |
| RPV, winsorized, only large arms (n = 40 000–50 000) | 5.33 % |

Joint winsorization costs about 0.2 pp of false-positive rate compared to not winsorizing: the cap is computed from
both arms, so the arm that happened to produce the larger outliers keeps more of its excess while the variance
estimate shrinks. That is the price of the 4.8 rule, it is small, and it stays comfortably inside the band. A per-arm
cap would be cheaper statistically and is explicitly not what the contract says.

## Order → visitor: how a conversion is counted

Contract 4.8 defines the conversion rate on **converting visitors**: a visitor with three orders converts once. Since
WP4.1 that is literally true for every order that had cart contact, and an approximation only for the rest.

**The `_ab_v` path (ADR-0033).** The snippet carries the visitorId in its own cart attribute (contract 4.1b) and the
ingest writes it to `OrderAttribution.visitorId`. Where it is there, the order joins straight onto its visitor's
`Exposure`: converters are `COUNT(DISTINCT visitorId)`, revenue per visitor is per real visitor, the attribution
window's lower bound is that visitor's own `firstSeenAt`, and the device is `Exposure.device`. Guests included – that
was the whole point.

**The ADR-0032 fallback**, for orders without `_ab_v` (no cart contact, the `CUSTOMER_LOOKUP` path). A conversion is
then an *identity*: `Order.customerId` when the order has one, otherwise the order itself.

- Repeat purchases by a logged-in customer count **once**. Correct.
- Repeat purchases by a guest with no customer id count **more than once**. A known, small upward bias on CR.
- It applies to both arms the same way, so a lift is affected far less than a level.
- `evaluate()` still clamps converters to visitors so CR can never exceed 100 %, and warns when the clamp fires. It is
  a safety net now rather than a routine correction.

An order that names a visitor or a customer we *have* seen in the experiment, but never in a matching exposure before
the order, does not count – that is 4.8's own rule, and `_ab_v` is what finally made it checkable for guests. An id we
have never seen an exposure for is a lost beacon, not a mismatch, and stays in.

**`unknown` is the fourth device bucket**, and it is visible (4.10). Orders we could not tie to an exposure have no
device; without the bucket the device rows would not sum to the totals. It is a data-quality reading, not a migration
artefact: if the share jumps in production, something about the cart attribute broke. `stats.server.ts` also reports
`deviceLinkRate` and `ordersWithoutDevice`. The WP4 load fixture measured a device link rate of 31 % under ADR-0032;
under ADR-0033 the same fixture measures **86 %**.

The `unknown` bucket is the one place `evaluate()` does **not** clamp converters to visitors: its visitors are always 0
by construction, and clamping would zero the bucket and break the only thing it exists for.
