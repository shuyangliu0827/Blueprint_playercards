# Backend review

## Final scoped reproduction check — reviewed failures resolved

Re-ran the previously failing deterministic scenarios against the final backend implementation:

- Same signed cookie after more than 24 hours idle retains `successfulCount:3`.
- New work is accepted (`pending`) after completed jobs fill the configured job cap; completed history can now be evicted to make room.
- One identity's third success triggers the newcomer signal even when prior successes were more than ten minutes apart; moving an existing identity to that IP produces zero auxiliary events.
- A future-dated client event no longer retains expired events: both entries disappear after the server receipt-time retention window.
- Client `auto_collected` is rejected (`accepted:0`).

Focused service/timing tests: **20/20 passed**. Finite abandoned-task expiry, bounded event insertion and auxiliary-window cleanup remain in place. No remaining failure was found in this scoped recheck. Earlier findings below are retained as history and are **resolved**. This check did not change implementation files.

## Earlier scoped fix re-review — resolved

The updated focused suite passes **13/13**. The new auxiliary check correctly uses the timestamp of the third success: a deterministic case with more than ten minutes between earlier successes still flagged a newcomer immediately after the third. Event count caps and finite abandoned reservations are now implemented. Completed replay and counters survive job pruning when identity activity has kept the identity alive.

Remaining exact failures, reproduced against the updated service:

- **P1 — Ordinary idle expiry still resets successful quota.** Complete three cards, advance 86,400,001 ms with no calls, then reopen session using the same signed cookie: `successfulCount:0`. `prune()` removes jobs, then identity and completion records, before `createSession()` reads the identity. The new documentation explicitly scopes preservation to the identity's memory lifetime, but this remains different from the original documented restart-only volatility and original review requirement. Preserve minimal quota state for signed identity continuity, or have the product owner explicitly accept this additional reset behavior.
- **P1 — Finished jobs now exhaust queue capacity for a day.** `submit()` rejects when `jobs.size >= maximumJobs`, while `prune()` evicts finished jobs only when `jobs.size > maximumJobs`. Once the queue reaches exactly 2,000 jobs, even if every one is completed or failed, no new work is admitted until age expiry. Confirmed with the identical capacity branch and a reduced in-memory cap of two: two completed jobs caused a fresh actor's submission to throw `QUEUE_BUSY`. Before rejection, evict an eligible finished job or distinguish active queue count from retained history.
- **P2 — Existing identities still qualify as new anonymous visitors.** `observeIp()` uses absence from the IP visitor window as `isNew`. An identity created on another IP, then reopening its existing signed cookie on the exhausted IP, produces `ip_pollution_after_exhaustion`. Carry identity-creation status from `createSession()` rather than interpreting new-to-IP as newly issued anonymous identity.
- **P2 — Event age expiry still trusts client ordering/timestamps.** A `share_intent` dated 2099 followed by a normally dated event keeps the latter visible after 24 hours, even while identity activity keeps the session alive. `prune()` still checks only the head's client `occurredAt`. Use server receipt time and prune all expired entries independently of event timestamps.
- **P2 — Client collection spoofing remains.** `acceptEvents()` still omits `auto_collected` from its rejection list; a direct submission returns accepted count `1`. Reject the server-emitted collection lifecycle name.

No implementation files changed during re-review.

Reviewed the batch-three brief, owned backend implementation/config/tests, and the authoritative core validation/event contracts. No implementation or frontend files changed.

## Findings

- **P1 — Job eviction resets issuance quota and replay accounting.** `src/server/preview-service.ts:120,128`: `successfulCount` is derived entirely from retained jobs; pruning removes counted jobs after 24 hours or at the job cap. Deterministic reproduction: complete three cards, advance 86,400,001 ms, call session with the same signed cookie → `successfulCount:0, remaining:3`. This happens without a process restart. Separate minimal issuance/request completion records from disposable job payloads so task cleanup does not grant another three successes or permit counting a replay twice. Test age and capacity eviction with a still-valid identity.

- **P1 — Reservation memory never expires.** `src/server/preview-service.ts:118,128`: pruning skips every reserved job and never advances abandoned jobs. An unpolled terminal-failure task still reserves quota after ten days; abandoned ready tasks can occupy all three slots indefinitely. Many new identities can consequently grow the jobs map without any upper age/count bound. Advance terminal states during housekeeping, define a finite inactive-task expiry, and preserve recently active jobs preferentially instead of permanently exempting reservations. Test abandoned fail and ready tasks, plus capacity behavior.

- **P2 — Auxiliary IP signal implements three people instead of an exhausted allowance.** `src/server/preview-service.ts:126-127` and the final test in `tests/preview-service.test.ts`: `recentSuccess` counts distinct actors with any success. One visitor completing all three cards followed immediately by a new identity yields no signal; three visitors completing one each yields a signal despite nobody exhausting their allowance. Existing identities reopening session also qualify as “new.” Track when an identity completes its third card on that IP, and emit only for a newly issued identity within the following 600,000 ms. Replace the current test with positive and negative cases for these exact boundaries.

- **P2 — Event and auxiliary-flag storage is not bounded on the event ingestion path.** `src/server/preview-service.ts:112-113,124,128`: `acceptEvents`/`metrics` never prune and `push` never enforces the cap. Reproduction using 101 legal batches of 100 events produces 10,100 retained events despite `maximumEvents:10000`; continued ingestion grows indefinitely. Expiry also examines only the array head using caller-controlled `occurredAt`, so a future-dated first event prevents age cleanup of subsequent old entries. Auxiliary pollution flag keys are never removed. Enforce bounds during ingestion, retain server receipt time for expiry, and expire auxiliary dedup keys with their window.

- **P2 — Client can duplicate server collection lifecycle events.** `src/server/preview-service.ts:101,112`: completion emits `auto_collected`, but the client rejection list omits that name. A client event with a new event ID and arbitrary generation ID is accepted and returned by metrics; the brief restricts clients to export/view interactions and prohibits double counting generation lifecycle events. Reject `auto_collected` at this boundary or use an explicit permitted-client-event-name list, and test it alongside the existing generation spoof checks.

## Verification

`npm test -- tests/preview-service.test.ts tests/mock-timing.test.ts` under Node 24: **12/12 passed**. Additional read-only deterministic service executions confirmed all five findings above (reservation expiry and cap behavior were inspected and reproduced for elapsed time/event count respectively).

Signed cookies/referrals, self-referral exclusion, strict photo metadata validation, actor sanitization, trusted-event rejection, per-actor visibility, poll-driven retry timing, and in-process concurrent reservation were otherwise consistent with the reviewed brief. Deployment restart volatility is explicitly documented; the quota finding concerns ordinary pruning within one live process, not that accepted restart limitation.
