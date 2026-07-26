# Ascend Roofing Group — Remediation Plan

The audit found 136 issues: 3 critical, 21 high, 42 medium, 70 low. Most are small, self-contained fixes; the work is dominated by three things — two live money/fraud problems that can be stopped this week, a batch of business-fact decisions only you can make, and one large regeneration of the 314 suburb pages that has to be paid for exactly once. **The structural precondition for everything else: the CI check that guards those 314 generated pages fails on every single run today (H-15), so nobody can currently tell an intended regeneration from an accident. That is a two-line fix and it lands first, alone.** Work is organised into 22 batches, sequenced so that no two batches fight over the same file and the highest-risk change (the 314-page rebuild) lands late, behind machine-checkable guards rather than human eyeballs. Total engineering effort is roughly **7–9 weeks of one engineer**, plus owner decision time and a small number of ops tasks that can start today. Four low findings are deliberately not being fixed; they are listed with reasons in section 6.

---

## 1. Decisions needed from you

These are the long pole. An engineer cannot invent a warranty term or a price. Start here — most of the rest of the plan can run in parallel while you answer.

| Question | What it blocks | Safest default if you don't answer |
|---|---|---|
| **How long do you actually guarantee your workmanship?** Your homepage says "back the workmanship for life"; your published Terms cap it at 10 years. | H-17 (Batch 7) | Ship **10 years** everywhere. terms.html is the contractual document, so aligning marketing down to it can only reduce exposure. Change index.html:393 and delete the two TODO comments at :251 and :533. |
| **The 21 named five-star reviews** (David & Emma L. from Robina, etc.) — are those real customers who gave permission to be quoted? | H-20 (Batch 7) | **Remove them entirely.** The identical review with the same persona appears verbatim on two different URLs. index.html and build.js were already anonymised — finishing that cleanup is the low-risk path. |
| **What is the one correct 2026 price for a 150–220 m² tile-to-metal replacement**, and is Anticon insulation included or a $2,000–5,000 add-on? Right now it's $18–26k on two pages and $18–30k on a third, with insulation described both ways. | H-21 (Batch 7) | **No safe default — do not let an engineer guess a price.** If you're unreachable, the price tables come out of the pages entirely rather than publishing a wrong number. |
| **Is the Colorbond product warranty 30 years or 36?** Stated as 30 on one page, 36 on six others. | M-38 (Batch 7) | Use the figure BlueScope publishes for the exact grades you install. If unconfirmed, drop the specific number and say "manufacturer-backed". |
| **Can you substantiate "1,200+ Roofs", "100% Satisfaction Rate", "Queensland's Most Trusted", "Top-rated"?** The ACCC can issue a substantiation notice for exactly these. | M-41 (Batch 21) | **Delete the absolute and comparative claims.** Replace the roof count with a dated, basis-stated figure or remove it. |
| **What is your real ABN, and do you have a GA4 measurement ID?** 340 pages ship `YOUR_ID_HERE` in a commented analytics block and say "ABN Registered" with no number. | L-69 (Batch 21) | Delete both. A commented-out placeholder earns nothing and "ABN Registered" without a number is worse than silence. |
| **What single trading address should the site publish?** Today 314 suburb pages each claim a business address in that suburb. | H-18, L-64 (Batch 21) | Use **one** real trading address on index.html only, and remove the address block from every suburb page. |
| **Do you have a real online booking link** (for SCHEDULER_URL)? | M-7 (Batch 11) | Assume none. The button gets hidden properly instead of rendering dead. The CSS fix ships either way. |
| **Should customers get an emailed copy of their instant quote?** quote.html promises it; no such email is ever sent. | M-14 (Batch 11) | **Delete the promise.** Adding a second outbound email is new deliverability risk for a nice-to-have. |
| **How should a subcontractor correct their bank details after submitting?** Today anyone on the internet can overwrite them. | C-1 (Batch 4) | **Append-only:** the form records a new submission, office staff promote it manually. Smaller change, no new email infrastructure. |
| **Rename `images/ROOFING GROUP.png` to `roofing-group-logo.png`, or percent-encode the space as `%20`?** | M-39, M-32 (Batches 17, 21) | **Percent-encode.** Renaming touches every HTML file plus styles.css and build.js, inflating an already-huge diff. Recommend `%20`. |
| **"Your roof is always our own skilled crew"** sits on quote.html next to a subcontractor recruitment pack linked from every footer. Reword or remove? | L-60 (Batch 7) | Reword to "your roof is always managed and quality-checked by our own team". |
| **Add Moreton Bay to the homepage Service Area card?** It's omitted while you have suburb pages there. | L-28 (Batch 7) | Add it. |

---

## 2. Actions outside the code

These need console/account access an engineer may not have. Several are marked immediate — please start them today.

| Action | Who | Urgency | Unblocks |
|---|---|---|---|
| **Audit the live database for evidence the bank-detail overwrite has been used.** Query `subcontractors` and `employees` for rows where `updated_at > created_at`; check `insurance_documents` for unexpected replacements. Then verify every BSB and account number **by phone, not email**, before the next pay run. Do this BEFORE the code fix — after it, you can no longer distinguish a fraudulent overwrite from a normal one. | Owner + bookkeeper, engineer runs the queries | **Immediate** | C-1 |
| **Rotate the Google Maps API key.** `AIzaSyAtuH3SKAhvh-XI2sONazBTcEc6LycF4Zc` is in public git history and is returned in the JSON body of every quote response. (1) Check Static Maps billing for anomalous spend. (2) Create a NEW browser key, Static-Maps-only, referrer allow-list of apex + www + the Vercel preview domain, with a daily quota cap. (3) Set it as `GOOGLE_MAPS_FRONTEND_KEY` in Vercel Production AND Preview. (4) **DELETE** the old key — don't just restrict it. Also confirm the separate server-side `GOOGLE_MAPS_API_KEY` is API-restricted with its own cap. | Google Cloud billing account owner | **Immediate** | H-7 |
| **Produce a written inventory of what is actually set in Vercel env vars, Production AND Preview:** `POSTGRES_URL`, `ENCRYPTION_KEY`, `UPSTASH_REDIS_REST_URL/TOKEN`, `BUSINESS_EMAIL`, `FROM_EMAIL`, `RESEND_API_KEY`, `CRON_SECRET`, `SCHEDULER_URL`, `ALLOWED_ORIGINS`, `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`. Several findings change severity entirely depending on the answers. | Vercel project admin | **Immediate** | H-8, H-2, M-1, M-2, M-4, M-7, M-34, L-2, L-3 |
| **Read the exact production value of `ALLOWED_ORIGINS`** and check it for trailing slashes, stray whitespace and missing www/apex variants. The parser has never executed in a test, and production almost certainly takes that untested branch. If it's malformed, 100% of real customers are already getting a silent 403 on the lead form with nothing failing. | Vercel admin + engineer | **Immediate** | M-34, L-3 |
| **If `POSTGRES_URL` was unset for any period:** contact every employee and subcontractor who submitted an onboarding form in that window and re-collect TFN and bank details. That data exists nowhere — masked in the email, redacted in the logs, and the form showed them a success screen. | Owner / office admin | **Immediate** | M-1, L-9 |
| **Take a production DB backup, then run the PII column migration**, then generate and set `ENCRYPTION_KEY` (`openssl rand -hex 32`). Order is load-bearing — the other way round makes every write throw. Migration: `ALTER TABLE employees ALTER COLUMN tfn TYPE TEXT, ALTER COLUMN bsb TYPE TEXT, ALTER COLUMN account_number TYPE TEXT;` plus the subcontractors equivalent, and `date_of_birth` DATE→TEXT. | Engineer with prod Postgres creds; owner approves the window | Before deploy | H-8, L-9 |
| **Add `reminded_tier SMALLINT` to `insurance_documents`** and backfill already-reminded rows to tier 90. Without the backfill, every existing document re-fires on the first run. | Engineer with prod Postgres creds | Before deploy | H-2 |
| **Set `BUSINESS_EMAIL` to the real monitored inbox** and verify the `FROM_EMAIL` sending domain in Resend. The cron currently defaults to `delivered@resend.dev` — Resend's sandbox sink, which always reports delivered and is never readable — and then permanently stamps the reminder as sent. | Vercel admin + Resend account owner | Before deploy | L-2, H-2, H-3 |
| **Provision Upstash Redis** (Vercel Marketplace, free tier is enough) and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. The code is already correct; only provisioning is missing. | Vercel admin | Soon | M-4, H-6, L-26, L-50 |
| **Set hard spend caps and billing alerts:** daily quota caps per API in Google Cloud (Static Maps, Solar, Places), monthly spend limit + alert in the Anthropic console. This is the backstop a rate limiter cannot provide. | Owner (billing holder) | Soon | M-4, H-5, M-36 |
| **Confirm the current supported Anthropic model id** from the console/docs — **not** from the audit text, which guesses — and whether `temperature` is still accepted. Confirm `ANTHROPIC_API_KEY` is set. | Engineer, using owner's Anthropic console | Soon | M-2 |
| **Purge Vercel runtime logs containing PII and reduce retention.** Bank details, DOB, home addresses and every customer's exact lat/lng are written there today. Assess with an adviser whether this plus plaintext TFNs in Postgres triggers an Australian Notifiable Data Breach obligation. | Vercel admin + owner; adviser for the NDB call | Soon | M-5, H-8 |
| **Grant Search Console access** and record existing manual actions plus the current indexation state of `/service-areas/` before and after Batch 21. If a manual action has already landed, the remedy is a reconsideration request, not a code change. | Owner grants; engineer/marketer interprets | Soon | H-18, H-19, M-42 |
| **Produce new image assets:** landscape hero crop (~1920×1100) plus an ~800px mobile variant; logo at ~240px in AVIF and WebP; a real 1200×630 social share image. | Owner / designer | Before Batch 21 | M-31, M-32, L-61 |
| **Run `npm audit fix`** for the one open high advisory (brace-expansion, dev-only, never shipped to browsers) as its own commit. | Engineer | Whenever | L-54 |

---

## 3. The batches

Executed in this order. Where the three planners disagreed, the call and its reason are stated inline.

---

## Batch 1 — Make the CI drift guard tell the truth

**Goal.** Add `fetch-depth: 0` to `actions/checkout@v4` so the one check protecting 314 generated pages can pass.

**Findings.**
- **H-15** — `actions/checkout` shallow-clones; in a shallow clone the boundary commit appears to touch every path, so `build.js:38 getSiteLastmod()` resolves to HEAD's date instead of the content date, rewriting 328 `<lastmod>` lines and failing the drift step on every run.

**Files touched.** `.github/workflows/ci.yml`

**Why it's here.** All three planners put this first and alone, and they're right. Until it's green, every later batch's "CI passed" is noise, and the team is already trained to ignore the only check guarding the generated corpus. Five other findings edit this file later — adding anything else to this PR makes the first green run ambiguous.

**How we verify.** Reproduce the failure first: `git clone --depth 1 file://$PWD /tmp/shallow && cd /tmp/shallow && npm ci && npm run build && git diff --stat -- sitemap.xml` → expect 656 changed lines. Then push a no-op PR and confirm the "Generated files must be committed and drift-free" step exits 0 — the first green run on this repo.

**Risk.** Low. Two lines of YAML, no production code. Worst case, checkout is a few seconds slower.

**Effort.** 30 minutes.

---

## Batch 2 — Decouple sitemap `lastmod` from git history

**Goal.** Replace the git-derived site lastmod with a committed `build-meta.json` value a human bumps deliberately, so ordinary commits stop re-stamping 328 sitemap lines.

**Findings.**
- **L-65** — 21 static pages take their lastmod from build inputs they don't use, and because `getSiteLastmod()`'s pathspec includes `build.js` itself, any commit to build.js changes the answer.

**Files touched.** `build.js`, `build-meta.json` (new), `sitemap.xml`

**Why it's here — a resolved disagreement.** Planner 3 argued for deferring this: "the git derivation is what makes the drift check possible at all, and changing it reintroduces the shallow-clone problem." **That is backwards, and we're overruling it.** A committed constant has *no* git dependency, so it is strictly more deterministic than what's there now — the drift check keeps working and gets more reliable, not less. Planner 2's argument wins: today, editing build.js forces a commit-rebuild-amend dance or CI goes red, and that circular dependency taxes Batches 18 and 21, the two most expensive batches in the plan. Pay one 656-line diff here to make every later diff legible. This is also the last time the sitemap churns site-wide.

**How we verify.** `npm run build && git diff -U0 -- sitemap.xml | grep -vc '<lastmod>'` → 0 non-lastmod changes, proving the diff is date-only. Confirm the committed value equals the current `2026-07-10` so the change is a no-op in value terms. Then commit and prove the decoupling: `touch build.js && npm run build && git diff --exit-code -- sitemap.xml` → exit 0 (today: 328 changed lines).

**Risk.** Medium. A 656-line one-off diff to a generated SEO artefact. Content is unchanged — only a date field — but if the committed date is wrong it's wrong for 335 URLs simultaneously. Verify the value before merging.

**Effort.** Half a day.

---

## Batch 3 — Stop silently discarding quote enquiries

**Goal.** Rewrite the contact-form submit handler so it can never depend on an element that may not exist, always surfaces a visible error, and shows the API's actual message. Land the minimal corpus scanner and jsdom harness that prove it.

**Findings.**
- **C-2** — Five service pages have `id="contactForm"` but no `id="submitBtn"`; `script.js:193` dereferences it with no guard, so the handler throws after `preventDefault()` has already suppressed the native POST. 100% of enquiries from those five pages vanish, with no error and no log.
- **H-9** — `#contactError` exists only on index.html; 322 pages show nothing at all when the quote API fails.
- **H-10** — The skip link added by PR #21 does not move focus on any of the 341 pages.
- **M-11** — No form's success state is announced, focused or scrolled to.
- **M-16** — The contact form replaces every API error with one generic string.

**Files touched.** `script.js`, `gutters-downpipes-brisbane.html`, `new-roof-installation-brisbane.html`, `roof-insulation-brisbane.html`, `roof-repairs-brisbane.html`, `skylights-whirlybirds-brisbane.html`, `new-employee-form.html`, `subcontractor-pack.html`, `colour-confirmation.html`, `scripts/lib/html-corpus.mjs` (new), `__tests__/html-invariants.test.js` (new), `__tests__/dom/contact-form.test.js` (new), `package.json`, `.github/workflows/ci.yml`

**Why it's here — two resolved disagreements.**

*First:* all three planners independently landed on the same key insight, so we adopt it with confidence — **fix H-9 and H-10 in `script.js`, not in `template.html`.** Have script.js *create* the `#contactError` element when it's missing, and set `tabindex="-1"` + `.focus()` on the skip-link target programmatically. That repairs error feedback on all 322 pages and the skip link on all 341, with a one-file diff and **zero page regeneration** — taking both findings off the critical path of the 314-page rebuild entirely. Combined with M-16 (surface `body.message`), the invisible 400 that H-11 causes on 314 suburb pages becomes a readable "Property address is required" *today*, which is what makes deferring the regeneration to Batch 21 acceptable.

*Second:* Planner 2 wanted the full 2–3 day verification harness landed before touching C-2; Planner 3 wanted the harness last. **We split it deliberately, not down the middle:** the *derived invariant* that catches C-2 (parse script.js for un-null-guarded `getElementById` literals, require those ids on every page loading script.js) is about an hour's work, and the jsdom contact-form test is ~120 lines. Those ship *in this PR*, so the fix is proven by assertion rather than by looking at it — which is the exact failure mode that let C-2 survive two PRs and a prior audit. The *rest* of the harness (build fixtures, link integrity, diff homogeneity, coverage gates) lands in Batch 19, before the regeneration that actually needs it. Landing 2,000 lines of test scaffolding before stopping 100% lead loss would be the wrong trade.

**How we verify.** The derived invariant must go from listing exactly 5 files (the C-2 pages) and 322 files (H-9) to listing none. `__tests__/dom/contact-form.test.js` loads the real `service-areas/roofing-ascot.html` in jsdom, stubs `IntersectionObserver`/`matchMedia`, evaluates script.js, dispatches submit with fetch mocked to a 400 — asserts no unhandled rejection, that visible error text contains the server's message, that the button re-enables, and that fetch hit `/api/submit-quote`. A regression test removes `id="submitBtn"` from a fixture page and asserts a fetch still happens (native-POST fallback). Then revert the C-2 fix locally and confirm the test goes red. Add a ci.yml grep step. Finally, submit one real lead from a preview deploy of `roof-repairs-brisbane.html` and confirm the email arrives.

**Risk.** Medium. `script.js` loads on all ~341 pages with zero prior test coverage, so a regression here breaks every form at once, not five. Mitigated by shipping the jsdom test in the same PR. Honest limit: jsdom has no layout, so the *visual* behaviour of the injected error region still needs one manual pass. This batch owns `script.js:170-238` only; Batches 9 and 21 touch other regions.

**Effort.** 1 day.

---

## Batch 4 — Close the unauthenticated bank-detail overwrite

**Goal.** Make both HR endpoints refuse to mutate an existing row's payment details from an unauthenticated POST, stop deleting insurance documents from that path, and delete the log statements writing PII into Vercel logs.

**Findings.**
- **C-1** — Anyone who knows a subcontractor's or employee's email can POST and silently replace `bsb` / `account_number` / `account_name` on the existing row. The confirmation email masks the digits, so a successful attack reads as a routine resubmission.
- **M-5** — Bank details, DOB, home addresses and every customer's exact lat/lng are written to Vercel logs.

**Files touched.** `api/submit-subby-pack.js`, `api/submit-new-employee.js`, `api/roof-quote.js`, `__tests__/submit-subby-pack.test.js`, `__tests__/submit-new-employee.test.js`

**Why it's here — a resolved disagreement.** Planner 3 bundled C-1 with the whole PII migration (encryption, column widening, schema redesign) at position 5, arguing they rewrite the same 60 lines. **We're overruling that.** Bundling gates a live payment-redirection fraud fix behind a production maintenance window and a DB backup — days of scheduling for something that can deploy today. Planner 1's framing wins: scope this to **containment, not redesign**. Change `ON CONFLICT (email) DO UPDATE SET ... bsb/account_number/account_name` to `DO NOTHING` (or leave those columns untouched), replace the unauthenticated `DELETE FROM insurance_documents` with an append-of-new-version, and flag the resubmission loudly in the admin email so staff promote it by hand. That's a ~30-line diff. The full submissions-table or invitation-token design lands with the migration in Batch 16. M-5 rides along because it's the same two handlers and is pure deletion — every day it's left, more PII accumulates in logs.

**How we verify.** New jest cases against the existing `@vercel/postgres` mock: POST with an already-present email and a different BSB → assert the emitted SQL contains `DO NOTHING` and not `DO UPDATE`, assert no `DELETE FROM insurance_documents` is issued at all, assert the admin email subject matches `/RESUBMISSION — existing record NOT overwritten/`. Add a source-grep test asserting `bsb = EXCLUDED.bsb` appears nowhere in either handler, so a future refactor can't reintroduce it. `grep -rn 'bsb\|accountNumber\|dateOfBirth\|streetAddress' api/*.js | grep console` → zero.

**Risk.** Medium. This genuinely changes behaviour a legitimate subcontractor relies on — someone correcting a typo in their bank details no longer self-serves, and staff must action it manually. That trade is correct against fraud exposure, but **the office must be briefed before deploy** or they'll assume the update landed. Also: run the forensic DB query *before* this ships, because afterwards you can no longer distinguish a fraudulent overwrite from a normal one via `updated_at`.

**Blocked on.** Ops: the live DB forensic query (runs in parallel, does not block the merge). Owner: the append-only vs invitation-token decision — containment ships either way; the choice only sets what the pending path writes.

**Effort.** Half a day engineering.

---

## Batch 5 — Fix the Resend field names and the unguarded request bodies

**Goal.** Rename snake_case keys the Resend SDK never reads to the camelCase interface it does, and stop three handlers crashing outside their try blocks.

**Findings.**
- **H-3** — Every website lead email has no Reply-To header (`reply_to` → `replyTo`).
- **H-1** — The colour-confirmation signature image is dropped from every email (`content_type`/`content_id`/`inline` → `contentType`/`inlineContentId`).
- **L-6** — HR endpoints pass `content_type`; the SDK reads `contentType`.
- **L-4** — Three handlers crash on malformed requests outside their try blocks, including a places-autocomplete array-query crash.

**Files touched.** `api/submit-quote.js`, `api/submit-colour.js`, `api/submit-new-employee.js`, `api/submit-subby-pack.js`, `api/places-autocomplete.js`, `__tests__/submit-colour.test.js`, `__tests__/submit-quote.test.js`

**Why it's here.** One class of bug, roughly one word each, and the highest value-to-lines ratio on the board. H-3 is on the site's primary lead endpoint — staff currently hand-copy the customer's address out of the email body on every single enquiry. **The test edit is mandatory and in scope:** `__tests__/submit-colour.test.js:76-77,111` currently assert the *broken* field names and are the reason H-1 shipped green. Fixing the code alone turns the suite red; fixing the test alone locks the bug in permanently. Doing them in one PR makes that coupling visible to the reviewer.

**How we verify.** `grep -rn 'reply_to:\|content_type:\|content_id:\|inline:' api/` → zero, enforced by a source-grep test. Updated assertions for `replyTo`, `contentType`, `inlineContentId`, and a filename extension derived from the MIME match rather than hardcoded `.png`. New malformed-body cases: POST with no body, and `?input[]=a&input[]=b` → 400, not a 500 stack. Then send one real colour confirmation through a preview deploy and confirm the signature renders **inline** in the received email rather than as a detached attachment.

**Risk.** Low. Mechanical rename against a documented SDK interface. The only subtlety: the mock proves the field names, not that Resend renders the `cid` — hence the one manual send.

**Blocked on.** Ops (verification only, not merge): confirm the `FROM_EMAIL` sending domain is verified in Resend. The Reply-To fix is pointless if the From domain is still the `.env.example` placeholder.

**Effort.** 2–3 hours.

---

## Batch 6 — Rotate and de-hardcode the Google Maps key

**Goal.** Delete the `|| "AIzaSy…"` fallback so a missing env var fails loudly, after the key has been rotated in Google Cloud Console.

**Findings.**
- **H-7** — A live Google Maps API key is hardcoded at `api/roof-quote.js:62-64`, is in public git history (commits 0ff8f11, 20fa9a7, c3e257f), and is returned inside the JSON body of every `/api/roof-quote` response — anyone who has ever requested a quote holds it.

**Files touched.** `api/roof-quote.js`, `.env.example`, `__tests__/roof-quote.test.js`

**Why it's here.** The code change is three lines; the value is entirely in the ops rotation, which is why it sits early — it's a "raise the request now" item. There is no referrer allow-list and no quota cap on the exposed key, so the exposure is an unbounded Google Cloud bill. Carried over unfixed from the 2026-07-10 audit.

**How we verify.** `grep -c AIzaSy api/roof-quote.js quote.html` → 0, enforced by a source-grep test. New test asserts the handler fails loudly (500, not a silent fallback) when `GOOGLE_MAPS_FRONTEND_KEY` is unset. After rotation, request one quote on a preview deploy, confirm the satellite image renders and its key differs from the burned one. Confirm in the console that the old key is **deleted**, not merely restricted.

**Risk.** Low code risk, but sequencing is sharp: shipping the code change *before* the new key is set in Vercel takes the instant-quote satellite image offline for real customers. Rotate → set env var (Production **and** Preview) → merge.

**Blocked on.** Ops: the full key rotation (see section 2).

**Effort.** 1 hour engineering; ops rotation is the long pole.

---

## Batch 7 — Content integrity: warranty, testimonials, pricing

**Goal.** Remove the fabricated testimonials, align the workmanship warranty with the published Terms, settle one canonical price tier and one Colorbond warranty term.

**Findings.**
- **H-17** — Homepage promises workmanship "for life"; the T&Cs cap it at 10 years.
- **H-20** — 21 invented named testimonials across 7 pages, with the same fake person quoted verbatim on two URLs.
- **H-21** — The same job is priced $18–26k on two pages and $18–30k on a third; insulation is both included and a $2–5k add-on.
- **M-38** — Colorbond product warranty stated as 30 years on one page, 36 on six others.
- **L-28** — The homepage Service Area card omits Moreton Bay.
- **L-60** — "No subcontracting" claim sits beside a subcontractor recruitment page linked from every footer.

**Files touched.** `index.html`, `roof-replacement.html`, `new-roof-installation-brisbane.html`, `roof-repairs-brisbane.html`, `gutters-downpipes-brisbane.html`, `roof-insulation-brisbane.html`, `skylights-whirlybirds-brisbane.html`, `blog-colorbond-roof-replacement-brisbane-gold-coast.html`, `blog/how-much-roof-replacement-cost-brisbane-2026.html`, `quote.html`, `.github/workflows/ci.yml`

**Why it's here.** This is the entire Australian Consumer Law exposure surface in one PR, and it's all hand-edits to hand-written pages — no regeneration, no build step, trivially revertible. H-17 is literally one line. What makes it urgent rather than merely tidy: the repo already contains two TODO comments (index.html:251, :533) documenting that the business *knew* the warranty term was unconfirmed and softened the wording anyway. Documented awareness is materially worse than never having noticed. It sits at 7 rather than 1 only because it cannot merge until you answer.

**How we verify.** `grep -rn 'author-avatar' --include=*.html .` → 0 (today 21), and a new ci.yml grep step fails the build if it ever returns. `grep -rniE 'for life|lifetime' index.html` returns only the corrected wording, with no TODO comments. One identical price range across roof-replacement.html, the Colorbond post and the cost blog, and the FAQ JSON-LD on the cost page repeats the same figure. One consistent Colorbond warranty term site-wide. Each becomes a corpus invariant in Batch 19 so it can't recur.

**Risk.** Medium — but the risk is entirely business, not technical. Removing 21 testimonials will measurably change how those pages read and possibly how they convert. That's the correct trade against an ACL s.18/s.29 exposure the business documented in its own HTML, but it's your call to make explicitly, not the engineer's to make quietly. **Do not let an engineer guess a price or a warranty term** — a wrong number replaces one ACL problem with another.

**Blocked on.** Owner: H-17, H-20, H-21, M-38, L-28, L-60 (see section 1).

**Effort.** 1 day once answers arrive.

---

## Batch 8 — Restore keyboard access to the onboarding forms

**Goal.** Replace `display:none` on the file inputs with a visually-hidden-but-focusable pattern, restore native `required`, associate every error with its field, and add a privacy notice at the point PII is collected.

**Findings.**
- **C-3** — Required file uploads are impossible to use with a keyboard. `display:none` removes the input from the tab order *and* the accessibility tree, and a `<label>` is not focusable, so there is no keyboard path to the file picker at all.
- **M-13** — Form errors are never associated with their fields, never announced, never focused.
- **M-17** — No privacy or consent statement anywhere near the TFN, bank account and photo-ID fields.
- **L-8** — Raw filename interpolated into `innerHTML`; the sibling form was already fixed and this one was missed.
- **L-14** — File read failures are swallowed with no user feedback.
- **L-17** — Rejecting an oversized file clears the input but leaves the previous file's card on screen.
- **L-18** — BSB and TFN formatters force the caret to the end on every keystroke.
- **L-24** — `subcontractor-pack.html` has zero `autocomplete` attributes and no numeric `inputmode`.
- **L-31** — Postcode and BSB use `pattern` with no `title`.
- **L-40** — The three ATO tax-declaration checkboxes are not grouped in a fieldset.

**Files touched.** `new-employee-form.html`, `subcontractor-pack.html`

**Why it's here.** WCAG 2.1.1 Level A hard blocker, and both file uploads are server-required: a keyboard-only subcontractor can fill every field, reach Submit, be told "Public Liability Insurance is required", and have no reachable control to satisfy it. That's a hiring and onboarding dead end, not a revenue leak, which is why it sits at 8 rather than 3. The two files are near-identical and 12 of 15 defects are duplicated across both — patch once, apply twice. **C-3 must land before M-13's ARIA plumbing**, because restoring native `required` changes the validation model that the JS-only workaround at `subcontractor-pack.html:689-691` exists solely to compensate for. M-17 is scoped here because these are the pages collecting TFN, bank and photo-ID data — a point-of-collection privacy notice is a Privacy Act APP 5 obligation.

**How we verify.** New corpus invariants (they run site-wide, so they lock the pattern in): no CSS rule anywhere sets `display:none` on a selector matching an `<input>`; every input with a sibling `.error-message` carries `aria-describedby` pointing at that element's id (`grep -rn 'aria-describedby' --include=*.html .` returns 0 today); no element id has two `<label for>` pointing at it (catches new-employee-form.html:624/626); every `pattern=` has a `title=`. jsdom: focus each of the six file inputs and assert `getComputedStyle(input).display !== 'none'` and `tabIndex >= 0`; dispatch a change with a 12 MB file and assert the previous file card is removed; type into `#bsb` and assert `selectionStart` is preserved mid-string; a filename containing `<img onerror>` is rendered via `textContent`. Plus one documented manual keyboard-only pass on both forms — jsdom cannot verify a focus ring on a styled label.

**Risk.** Medium. This rewrites the validation model on two forms that collect TFNs and bank details; a regression means a submission is rejected, or worse, accepted with a missing insurance certificate. The visually-hidden pattern is well-trodden, but the JS validator must be removed carefully in step with restoring native `required`, and both forms need a real end-to-end submission test before merge.

**Effort.** 1–2 days.

---

## Batch 9 — Navigation, focus and contrast (CSS + JS only, zero page regeneration)

**Goal.** Fix the nav that stays focusable when closed and untrapped when open, the panel that clips its own CTA at 200% zoom, the scroll-lock that survives resize, and the contrast and focus-ring failures — without regenerating a single page.

**Findings.**
- **H-12** — Closed mobile nav stays focusable at `right:-100%` while `aria-expanded` says false; open nav has no focus management.
- **H-13** — The nav panel is an unscrollable `100vh` box; at 200% zoom the primary "Get a Quote" CTA is unreachable by mouse, touch or keyboard.
- **M-9** — Crossing 768px with the menu open leaves the page locked behind a blurred overlay with no visible close control.
- **M-21** — Form error text fails AA contrast on every form.
- **M-22** — Text on the `#007bff` accent background still fails AA; PR #21's fix missed these.
- **M-23** — The focus ring on every FAQ accordion button is clipped away entirely by `overflow:hidden`.
- **M-24** — Text inputs have `border: 1px solid transparent` — a 1.06:1 boundary against their container.
- **L-15** — The "current page" highlight is stripped from the Locations nav link on all 314 suburb pages at first scroll.
- **L-47** — AVIF-capable but `image-set()`-unaware browsers download both the AVIF and the JPG.
- **L-48** — ~1.9 KB of dead CSS from a retired autocomplete widget ships on every page.

**Files touched.** `styles.css`, `script.js`, plus the inline `<style>` duplicates in `new-employee-form.html`, `subcontractor-pack.html`, `colour-confirmation.html`

**Why it's here.** **The single most important structural correction in this plan:** `build.js` does not read `styles.css` — it only emits a `<link href>` string — so **no CSS change regenerates anything**. The audit's "rebuild to propagate" note on M-22 is wrong. That makes these ten findings, including three High WCAG failures affecting 341 pages, a two-file diff with zero page churn — the cheapest high-value accessibility work available, and worth pulling well ahead of the regeneration. It lands after Batch 8 because M-21/M-24 also patch the inline-style duplicates in the onboarding forms that Batch 8 owns, and it must land **before** Batch 21 because M-10 (there) and M-23 (here) both edit `.faq-item`/`.faq-answer` at styles.css:1005-1013 and 1705-1718.

**How we verify.** `npm run build && git diff --exit-code -- service-areas locations.html sitemap.xml` → exit 0, proving the zero-regeneration claim. New `scripts/check-contrast.mjs` (no dependencies — parse declared colour pairs, composite, compute the WCAG ratio) asserts every pair used by `.form-error`, `.hero-badge`, `.exp-label` and input borders is ≥4.5:1. jsdom: with the viewport stubbed at 375px and the menu closed, no `.nav-link` is focusable; open the menu and assert focus lands on the first link and Tab from the last returns to the toggle; fire a matchMedia change past 768px with the menu open and assert `document.body.style.overflow` resets; on a suburb page fixture, dispatch scroll and assert the Locations link keeps `.active`. CSS-structure assertions: the `.nav-menu` rule inside the ≤768px block declares `overflow-y` and `max-height:100dvh`.

**Risk.** Medium blast radius, small diff. `styles.css` and `script.js` are on every page. **Honest limits:** jsdom has no layout, so H-13 (clipping at 200% zoom) and M-23 (focus ring rendering) genuinely cannot be automated — they need one manual browser-zoom pass at 100% and 200% on a 1280×800 viewport. Do not pretend the tests cover them.

**Effort.** 1 day.

---

## Batch 10 — colour-confirmation.html

**Goal.** Stop the error panel showing alongside success, expose the disclosure and tab state to assistive technology, and fix the signature pad defects.

**Findings.**
- **M-8** — The error panel is set to `block` and never back to `none` anywhere in the file, and it sits outside the form — so a customer whose first submit fails and second succeeds sees the green success panel with the red "call us" panel still beneath it, and `role="alert"` re-announces the stale failure.
- **M-25** — The Colorbond colour-range disclosure has no `aria-expanded` or `aria-controls`.
- **M-26** — The signature Draw/Type toggle conveys the selected mode with a CSS class only.
- **L-19** — Signature restore is asynchronous; two rapid resize events wipe the drawing.
- **L-22** — A signed colour confirmation can be submitted with no colours at all.
- **L-23** — Clicking a swatch does nothing once all three dropdowns are filled.
- **L-32** — The typed-signature field specifies a handwriting font the page never loads.
- **L-33** — Two controls are ~20–23px tall on mobile, one of them overlaying the signature pad.

**Files touched.** `colour-confirmation.html`, `api/submit-colour.js`

**Why it's here.** Eight findings inside one self-contained page's inline `<style>` and `<script>`, with heavy internal collisions (M-8 and the scroll fixes share the handler at :1036-1046; M-25/M-26/L-23/L-33 share the colour-toggle and signature-tab IIFEs; L-19/L-33 share the canvas region). One coherent PR, no shared-asset risk, so it can run in parallel with the API batches. It's at 10 rather than earlier because this is the customer's record of a decision on a job already sold — failures cost admin time, not leads.

**How we verify.** Extract the inline `<script>` to `js/colour-confirmation.js` first, as a pure move with no behaviour change, so it becomes testable at all (this also removes one of the six inline blocks blocking Batch 17's CSP work). Then jsdom: mock fetch to reject, submit, assert the error panel is `block`; mock a 200, submit again, assert the error panel is `none` **and** success is `block` — today both are visible. Assert the disclosure flips `aria-expanded` with a real `aria-controls` target; assert the Draw/Type buttons expose `aria-pressed`; assert a zero-colour submit is blocked client-side and that `api/submit-colour.js` returns 422 for the same payload; fire two resize events in one tick and assert the canvas still has non-blank pixel data. Corpus invariant: every control's tap target ≥24px, and Clear no longer overlays the drawing surface.

**Risk.** Low. Self-contained page, no shared assets, no build output. Extracting the inline script is the only structurally interesting change and it's mechanical. `api/submit-colour.js` is touched for the second time after Batch 5 — sequential, different region (validation block only).

**Effort.** 1 day.

---

## Batch 11 — quote.html client

**Goal.** Fix the dead CTA at the highest-intent moment in the funnel, the client lockout that breaks its own "New Quote" button, the promise nothing fulfils, the crash reported as a network error, and the unannounced results.

**Findings.**
- **M-7** — `.qr-cta { display: inline-flex }` defeats the `hidden` attribute, so with SCHEDULER_URL unset "Book Free Inspection" renders with `href="#"` and bounces the customer to the top of the page, away from the quote they just generated.
- **M-14** — The page promises to email the customer a copy of a $15k–$45k estimate; no such email is ever sent.
- **M-15** — A 60-minute client lockout, 12× stricter than the server, makes the on-screen "New Quote" button always fail.
- **M-18** — Server crashes are reported as "check your connection".
- **M-20** — Results render with no live region and no focus move, and `setLoading()` drops focus to `<body>`.
- **L-13** — A localStorage write failure reports "Network error" over a successful quote.
- **L-21** — The hero says "No phone calls" while Phone Number is required and forwarded to sales.
- **L-34** — The entire "Why Choose" section sits outside `<main>`.
- **L-37** — Decorative emoji are injected into `innerHTML` with no `aria-hidden`.
- **L-38** — Nine `scrollIntoView({behavior:'smooth'})` calls across the repo ignore `prefers-reduced-motion`.

**Files touched.** `quote.html`, `js/quote.js` (new, extracted), plus the `scrollIntoView` call sites in `colour-confirmation.html`, `new-employee-form.html`, `subcontractor-pack.html`

**Why it's here.** Ten findings in one ~600-line inline script and its inline style, colliding heavily: M-15/M-18/L-13 all rewrite the same try/catch at :1122-1161; M-20/L-38 both touch the scrollIntoView calls at :1211-1215; M-7/L-37 touch renderResults' `innerHTML` sinks. Treat the inline script as one unit of work or you'll merge-conflict with yourself. Extract to `js/quote.js` as the first commit, no behaviour change, so the reviewer can diff it as a pure move.

**How we verify.** jsdom against the real page: with SCHEDULER_URL absent, assert `getComputedStyle(schedulerLink).display === 'none'` and that its href is never `#`; a 500 with an HTML body produces a message matching `/server/i` and **not** `/connection/i`; stubbing `localStorage.setItem` to throw still renders the quote with no "Network error"; the results container has `role="status"` and receives focus, and `setLoading(false)` doesn't drop focus to `<body>`; with `prefers-reduced-motion` stubbed true, all nine scroll call sites pass `behavior:'auto'`; the client lockout window equals the server's. Corpus invariant: "we'll email you a copy" appears nowhere.

**Risk.** Medium. This is the headline conversion feature, and extracting 600 lines of inline script is a large mechanical change with real regression surface. **The extraction is the risky part, not the ten fixes.**

**Blocked on.** Owner: SCHEDULER_URL (the CSS fix ships either way) and the M-14 email decision.

**Effort.** 1–2 days.

---

## Batch 12 — The instant-quote endpoint

**Goal.** Stop one typo locking a customer out for five minutes, stop silently dropping leads, keep the lead when geocoding fails, and cover the untested Google Solar failure paths.

**Findings.**
- **H-6** — The rate limiter runs at :531 *before* validation at :557, so a first-attempt address typo burns the customer's only token, and the 422 at :611 literally tells them to add their postcode and retry — into a 429.
- **H-4** — roof-quote swallows every email failure and still returns 200. There is no `sql` import anywhere in the file, so a Resend outage destroys the lead entirely.
- **M-19** — A quote that fails geocoding discards the customer's name, phone and email.
- **M-29** — The quote response waits for a Resend round trip the customer never sees.
- **M-30** — The main contact form blocks on an 8-second Nominatim geocode used only to prettify an email string.
- **M-36** — The poor-condition surcharge and the "Manual quote required" path are unreachable dead code, and four Solar failure paths are untested.
- **L-5** — The lead email can report "Roof Area 0 m²" beside a 200 m² quote.
- **L-7** — Google Solar error strings are returned to the browser.
- **L-26** — The 429 names no wait time and offers no fallback.

**Files touched.** `api/roof-quote.js`, `api/submit-quote.js`, `lib/geocode-address.js`, `vercel.json`, `__tests__/roof-quote.test.js`

**Why it's here — a resolved disagreement.** H-4 and M-29 are in **direct architectural tension** and all three planners flagged it: H-4 wants the email failure surfaced, M-29 wants to stop awaiting the email at all. Planner 1 proposed making captureLead non-blocking *and* surfacing `lead_notified:false`; Planner 2 proposed keeping the await with a bounded timeout. **We take Planner 2's resolution: keep the `await`, add a 3-second `AbortSignal`, and surface `lead_notified: false` in the 200 body.** Reason: this handler has *no other persistence path* — no DB write anywhere in the file — so making the email fire-and-forget makes systemic lead loss permanently invisible to save ~300ms. That is the wrong trade. **Decide and write this contract down before either line is coded, and do not re-litigate it in a later batch.** M-30 lands here rather than separately because cutting the shared geocode timeout to ~2500ms raises M-19's failure rate, so M-19's lead-capture-on-failure must ship in the same PR.

**How we verify.** A request that 422s on validation must not consume a rate-limit token (assert the limiter mock is not called before `validateInputs`). The four untested Solar failure paths — missing key, 429, 500, a body with no `solarPotential`, and a parse throw — each assert `estimate_basis === 'typical'` and that `roof.no_coverage_reason` is set, with no internal error string in the response. A Resend rejection yields `lead_notified: false` in the 200 body. Geocode failure still emails the lead. `replyTo` is omitted when email is empty. The geocode `AbortSignal` is 2500ms. Branch coverage on `api/roof-quote.js` rises from 75.28%.

**Risk.** Medium. This is the site's headline feature and the batch changes its rate-limit semantics, response shape and error surface at once. The response-shape change must be tolerated by Batch 11's client — verify against it.

**Effort.** 1–2 days.

---

## Batch 13 — Make rate limiting real, and test the origin guard

**Goal.** Point the limiter at provisioned Upstash Redis, key it correctly, fix the memory fallback, and finally execute the `ALLOWED_ORIGINS` parser in a test.

**Findings.**
- **M-4** — Rate limiting is per-instance memory and fails open in the shipped configuration.
- **M-34** — The `ALLOWED_ORIGINS` parser and the Referer fallback have never executed in a test.
- **L-3** — The documented non-production allowance does not exist in the code (stale comment).
- **L-12** — The autocomplete endpoint's origin check depends entirely on Referer.
- **L-50** — The in-memory limiter clears the whole map instead of evicting LRU.

**Files touched.** `lib/rate-limit.js`, `lib/verify-origin.js`, `api/places-autocomplete.js`, `__tests__/rate-limit.test.js`, `__tests__/verify-origin.test.js` (new)

**Why it's here.** Deliberately *after* Batch 12, for a reason the audit spells out: once Upstash is live, the limiter stops being a per-lambda Map and real cross-user CGNAT collisions start to bite. H-6's reordering and limit raise must already be in place, or provisioning Upstash makes the customer experience *worse*. M-34 belongs here because the parser is at 68.75% statements with lines 15-25 never executed — and per `.env.example:43`, **production almost certainly takes that untested branch**. A stray trailing slash 403s 100% of real customers on the lead form with nothing failing.

**How we verify.** New `__tests__/verify-origin.test.js` covering trailing slashes, stray whitespace, empty segments and the Referer-only success path — the branch production actually takes. Assert `sec-fetch-site: same-origin` is accepted on the GET autocomplete route with no Origin and no Referer. Assert the rate-limit key derives from `x-vercel-forwarded-for`, not the leftmost `x-forwarded-for` segment. Assert an Upstash outage on the three expensive endpoints returns `limited:true` (fail-closed) while submit-quote fails open. Assert the memory map evicts LRU rather than clearing wholesale. Then on a preview deploy, hit the endpoint twice from one IP and confirm the second 429s across two different lambda instances.

**Risk.** Medium. Fail-closed is a deliberate availability trade: an Upstash outage will now block real subcontractor submissions and real quotes. That's correct for endpoints that fire three Claude Vision calls or a billable Solar call, but it must be a conscious decision with an alert attached, not a side effect.

**Blocked on.** Ops: Upstash provisioning; the exact production `ALLOWED_ORIGINS` value.

**Effort.** Half a day plus provisioning.

---

## Batch 14 — Bound the AI calls and fix the expiry arithmetic

**Goal.** Give the Anthropic client an explicit timeout and retry budget, run the three extractions concurrently, add `maxDuration`, and fix the off-by-one day count.

**Findings.**
- **H-5** — Three sequential Claude Vision calls with a 10-minute SDK default timeout and no `maxDuration`. Worst case is 3 documents × 3 attempts × 10 minutes in one invocation; Vercel kills it, and the DB writes have already committed while no email was sent.
- **M-2** — The model `claude-sonnet-4-20250514` is retired; any extraction failure silently produces a `NULL` expiry date the reminder cron can never see.
- **M-37** — A certificate valid today reads "EXPIRED 1 days ago" from 10:00 Brisbane time onward.
- **L-51** — An AI confidence of 0.0 is coerced to 0.5 and reported as "50%".

**Files touched.** `lib/extract-insurance-data.js`, `api/submit-subby-pack.js`, `vercel.json`, `__tests__/extract-insurance-data.test.js`, `__tests__/submit-subby-pack.test.js`

**Why it's here.** This is the **only** unbounded outbound call in the codebase — Solar (10s), Nominatim (8s), Places (5s) and Upstash (2s) are all correctly capped. M-2 rides along because a silent extraction failure writes `expiry_date` NULL, which makes that document permanently invisible to the Batch 15 cron, so fixing the cron without fixing this leaves a hole. All three extraction findings touch lines :20-22 / :54 / :100 — one pass. M-37 joins because it's the same domain and the same test file.

**How we verify.** Source-shape assertion that the Anthropic client is constructed with explicit `{ timeout ≤ 25000, maxRetries ≤ 1 }`. Assert all three mocked extraction calls are *initiated* before any resolves (`Promise.allSettled`, not sequential await). Assert `vercel.json` contains `functions['api/submit-subby-pack.js'].maxDuration`. M-37 boundary tests at expiry === today, +60d, +61d and −1d, run under `TZ=Australia/Brisbane`, `TZ=UTC` and `TZ=Pacific/Midway` — and **tighten the existing loose regexes at `__tests__/submit-subby-pack.test.js:204-238` first**, because they currently pass either way. Assert a confidence of 0.0 reports "0%".

**Risk.** Medium. This changes the model in production. **Do not take the model id from the audit text, which guesses** — read the current supported list. A wrong model id means every insurance extraction silently returns null, writes `expiry_date` NULL, and the document becomes permanently invisible to the reminder cron. Also the second touch on `api/submit-subby-pack.js` after Batch 4 — sequential, and a different region (the extraction loop above the write path).

**Blocked on.** Ops: confirm the model id, `ANTHROPIC_API_KEY`, and set spend caps.

**Effort.** 1 day.

---

## Batch 15 — Make insurance reminders escalate

**Goal.** Replace the one-shot `reminded_at IS NULL` gate with tier tracking so 90/60/30-day and expired reminders each fire.

**Findings.**
- **H-2** — A certificate is emailed exactly once, ever — the first day it enters the 90-day window — then excluded forever. Once it actually expires, the `>= todayStr` bound drops it from the query entirely.
- **L-1** — Reminder emails render the raw JS `Date` object.
- **L-2** — Cron reminders default to Resend's test sink (`delivered@resend.dev`), which always reports delivered and is never readable — and the cron then permanently stamps `reminded_at` on that success path.
- **L-45** — One UPDATE per document inside a per-subcontractor loop.
- **L-57** — The `reminded_at` test asserts only "more than one SQL call happened".

**Files touched.** `api/cron/check-expiring-insurance.js`, `schema.sql`, `migrations/002-reminded-tier.sql` (new), `__tests__/check-expiring-insurance.test.js`

**Why it's here.** You are sending uninsured trades onto roofs with no system-generated warning. L-2 compounds it catastrophically: in the sandbox-sink misconfiguration the cron takes the success path and permanently stamps the reminder, so every reminder is destroyed with no trace. **L-57 must land first, inside this PR** — the existing assertion (`updateCalls.length > 0`) would stay green through the entire rewrite even if it updated the wrong column.

**How we verify.** Strengthen L-57 to an exact assertion on the SQL text and bound value, and mutation-check it: change the UPDATE to a different column and confirm the test goes red (today, mutating it leaves 207/207 green). Then table-drive the tiers: documents at 95, 90, 61, 60, 31, 30, 1, 0 and −5 days with `reminded_tier` null/90/60/30 → assert exactly which produce a send and what tier is written; an already-expired document produces an escalating alert rather than vanishing. Assert the email renders a formatted date string, not `[object Object]`. Assert a single batched UPDATE, not one per row. Then run the cron against a scratch DB with the migration applied and confirm four consecutive daily runs produce four escalating emails.

**Risk.** Medium. Requires a production schema change plus a backfill. Get the backfill wrong and either every existing document re-alerts at tier 90 (noise that trains staff to ignore the alert) or none do. Note also: the cron fails closed and never runs at all if `CRON_SECRET` is unset — confirm that first or this batch is unobservable.

**Blocked on.** Ops: the `reminded_tier` column + backfill; `CRON_SECRET`; `BUSINESS_EMAIL`.

**Effort.** 1 day plus a migration window.

---

## Batch 16 — PII at rest: encryption, column widths, honest failures

**Goal.** Turn the commented-out migration into real DDL, extend encryption to the columns that are plaintext regardless, stop storing HTML entities, and return 5xx instead of a silent 200 when the write fails.

**Findings.**
- **H-8** — `encryptField()` is an identity function without `ENCRYPTION_KEY`, so TFNs and bank details sit in Postgres in plaintext — and turning it on breaks the DB writes because the ciphertext exceeds the varchar widths.
- **M-1** — TFN and bank details are unrecoverable when `POSTGRES_URL` is unset, and the API still reports success.
- **M-3** — HTML entities are stored in the database and then escaped a second time on render. Existing rows hold `O&#x27;Brien` in `account_name` — the payroll bank-account holder name.
- **L-9** — No server-side length or format validation on DB-bound fields.
- **L-11** — Uploads are trusted on the client-declared MIME type only.

**Files touched.** `schema.sql`, `migrations/001-pii-widths.sql` (new), `api/submit-new-employee.js`, `api/submit-subby-pack.js`, `api/cron/check-expiring-insurance.js`, `lib/sanitize.js`, `new-employee-form.html`, `subcontractor-pack.html`, and the three affected test files

**Why it's here.** This is the second-largest legal exposure after C-1, and it sits at 16 purely because its **risk retired per hour is poor**: it needs a production migration against a live table of real TFNs, a verified backup, a maintenance window, and a data-repair migration for rows already holding entity-escaped names. All three planners agreed on deferring it; none of them deferred the *ops request*, and neither do we — **start the env inventory and backup on day one**, even though the merge lands here.

**Two contracts to reconcile before writing a line:** M-1 proposes returning 503 and setting `dbFailed`; L-9 proposes a different non-200 shape. **Pick one: return 503 when `POSTGRES_URL` is unset or the insert threw, and have the client render `result.warning`** (`new-employee-form.html:929` ignores it today). Second: ordering inside the batch is load-bearing — **widen the columns, then set `ENCRYPTION_KEY`.** The other order makes every INSERT throw 22001, get swallowed, and return 200 while the PII is lost.

**How we verify.** Rehearse the entire sequence on a scratch DB restored from a production backup before touching production. On the scratch DB: insert with `ENCRYPTION_KEY` set → `SELECT length(tfn)` > 11 and the value starts `enc:v1:`; `decryptField` round-trips; legacy plaintext rows still read. Unit tests: the SQL parameter for `account_name` given `"O'Brien & Sons"` is the **raw** string, and the email HTML for the same value contains `O&#x27;Brien &amp; Sons` exactly once, not twice. `POSTGRES_URL` unset → 503, not 200, with the form rendering the warning. A 40-character account number → 400 before any DB call. A PDF-declared upload whose bytes don't start with `%PDF-` → 400.

**Risk.** **High — the only batch that can destroy existing production data.** Widening columns is safe; changing `date_of_birth` from DATE to TEXT is a type change that can lose data; M-3's data repair rewrites payroll-critical `account_name` values in place. Backup first, rehearse on a restored copy, do it in a maintenance window. Separately: if the env inventory shows `POSTGRES_URL` was ever unset, **this batch does not recover the lost data** — it must be re-collected from real people.

**Blocked on.** Ops: env inventory; DB backup; the migration; log purge and NDB assessment. Owner: contacting affected people if data was lost.

**Effort.** 2–3 days plus a maintenance window.

---

## Batch 17 — Cache headers, CSP, and the image assets

**Goal.** Stop marking unhashed images immutable for a year, preload the hero on the pages that missed it, cut the heaviest blog payload, and tighten the CSP.

**Findings.**
- **M-33** — `/images/*` is `max-age=31536000, immutable` while filenames carry no content hash.
- **M-27** — The 261 KB hero LCP background has no preload on 15 pages, including the highest-intent service pages.
- **M-28** — The Colorbond blog post ships 1.6 MB of raw JPG with zero `<picture>` elements.
- **L-10** — CSP permits inline scripts, wildcard `https:` images, and four unused third-party script origins.
- **L-43** — styles.css and script.js are capped at `max-age=3600` with no content hashing.

**Files touched.** `vercel.json`, `roof-replacement.html`, `roof-repairs-brisbane.html`, `gutters-downpipes-brisbane.html`, `new-roof-installation-brisbane.html`, `roof-insulation-brisbane.html`, `skylights-whirlybirds-brisbane.html`, `blog-colorbond-roof-replacement-brisbane-gold-coast.html`, `blog/*.html`, `images/`

**Why it's here — all three planners agreed and it's the load-bearing point.** **M-33 is the gate on every image fix in Batch 21 actually reaching a real visitor.** With unhashed filenames marked immutable for a year, replacing the hero or shipping the new logo AVIF means returning visitors keep serving the old bytes from disk for up to 365 days with no cache-busting path. This must land **before** Batch 21, not after — and the sooner it ships, the smaller the cohort already stuck on the old header. L-10's cheap half ships here too: every `gtag` block is commented out and no page loads `maps.googleapis.com` any more, so those four script-src origins are dead weight.

**How we verify.** `curl -sI <preview>/images/…` shows the new policy with no `immutable`; replace one image, redeploy, and confirm a warm browser picks it up. Preload assertion: every page whose hero uses the AVIF background carries a matching `<link rel=preload as=image type=image/avif fetchpriority=high>` — ≥1 for all 15. `<picture>` count on the Colorbond post goes 0 → 4, with measured transfer dropping from ~1.61 MB to ~0.90 MB. CSP: `script-src` lists none of `maps.googleapis.com`, `maps.gstatic.com`, `googletagmanager.com`, `google-analytics.com`, and `img-src` has no bare `https:`.

**Risk.** Medium — **CSP is the sharp edge.** A missed origin breaks an image or script silently, on some pages only, and the audit did no live-browser run, so the inventory of what actually loads is inferred from grep. Ship to a preview and walk index, quote, a suburb page, the blog hub and all three onboarding forms with the console open before merging. **Scope L-10 to removing dead origins and narrowing `img-src` only** — removing `unsafe-inline` requires nonces or hashes for inline scripts on ~340 pages and is out of scope.

**Blocked on.** New binary assets must exist. Owner/engineering: content-hashed filenames vs dropping `immutable` — default is drop `immutable`; hashing 340 HTML references for six photographs isn't worth the machinery.

**Effort.** 1 day.

---

## Batch 18 — locations.html and the hand-written page catch-up

**Goal.** Bring the service-area hub up to the standard every other page already meets, and give the remaining hand-written pages their missing call CTA and preconnect.

**Findings.**
- **H-14** — locations.html's LCP is the raw 478 KB JPEG; the one page PR #21's AVIF rollout missed entirely.
- **L-20** — The only page loading script.js without `defer`, and the only page with no nav overlay.
- **L-29** — faq.html has no in-content CTA and no mobile floating call button.
- **L-30** — Six pages ship without the mobile floating call CTA.
- **L-46** — Two blog posts omit the `fonts.gstatic.com` preconnect and the Vercel analytics script.
- **L-49** — locations.html requests a different Google Fonts URL from every other page, fragmenting the cache.

**Files touched.** `build.js` (the locations.html template literal at ~285-455 only), `locations.html`, `faq.html`, `404.html`, `blog/index.html`, `blog/asbestos-roof-removal-brisbane-guide.html`, `blog/signs-roof-needs-replacing-brisbane.html`, `blog-colorbond-roof-replacement-brisbane-gold-coast.html`, `blog/how-much-roof-replacement-cost-brisbane-2026.html`

**Why it's here.** locations.html is linked from the nav of every page and sits at sitemap priority 0.9, yet it is the single most-missed page on the site — and all four of its defects exist for one reason: **its markup lives inside a JS template literal rather than an `.html` file**, so every rollout skipped it. This is also a deliberate rehearsal for Batch 21's mechanics at one-hundredth the diff size. Because Batch 2 decoupled the sitemap, a build.js edit that doesn't touch template.html or suburbs.json now produces a **locations.html-only diff** — that's what makes this cheap and legible instead of drowning a 13-finding change in 656 sitemap lines.

**How we verify.** `npm run build && git diff --numstat` → exactly one generated file changed (locations.html); `service-areas/` and `sitemap.xml` untouched, proving Batch 2 worked. New corpus invariants, run site-wide so the class of defect cannot recur: every page requests the identical Google Fonts URL (1 distinct value, currently 2); every page loading script.js loads it with `defer`; every page containing `#navToggle` also contains `#navOverlay`; every page whose LCP background is a JPEG also declares an `image-set()` AVIF source and a matching preload link; every page has the floating call CTA. Each currently flags locations.html and only locations.html. Measure: above-the-fold budget drops from ~830 KB toward ~615 KB.

**Risk.** Low. One generated file, one source of truth, and the drift guard proves the output matches. Do **not** touch the suburb-generation region of build.js in this PR.

**Effort.** Half a day.

---

## Batch 19 — Guard rails: build tests, corpus invariants, CI gates

**Goal.** Build the verification layer that makes a 314-page regeneration reviewable at all.

**Findings.**
- **M-35** — Zero tests for build.js, enrich, script.js and the 314 generated pages; no client-side JS tests.
- **L-52** — `api/health.js` has 0% coverage and no test file.
- **L-53** — jest has no `coverageThreshold` and CI never runs `test:coverage`.
- **L-54** — CI has no lint, no audit gate, no link check and no job hardening.
- **L-55** — The subby-pack rejection path and two sanitize branches never execute in tests.
- **L-56** — Two input guards on submit-colour and the invalid-email 400 on submit-quote are untested.

**Files touched.** `build.js` (pure helper-export refactor), `scripts/lib/html-corpus.mjs`, `scripts/check-diff-homogeneity.mjs` (new), `__tests__/build-fixture.test.js`, `__tests__/build-output-contract.test.js`, `__tests__/link-integrity.test.js`, `__tests__/no-unfinished-markup.test.js`, `__tests__/health.test.js`, `__tests__/known-violations.json`, `package.json`, `.github/workflows/ci.yml`

**Why it's here — the placement all three planners argued about.** Planner 2 wanted the whole harness at position 3; Planner 3 wanted it last; Planner 1 put it just before the regeneration. **We split it: the C-2-catching slice landed in Batch 3, and the rest lands here, immediately before the regeneration that needs it.** The reason it can't be last: the existing drift guard only proves the committed output matches what build.js produces — it says **nothing** about whether the change was *correct*, and no human will read a 314-file diff. `check-diff-homogeneity.mjs` converts that review into "template.html plus one representative page" by asserting every changed service-areas file has an identical diff shape after normalising suburb/region/postcode/slug. If 313 files change by +14/−6 and one changes by +14/−19, that's your bug.

Adopt Planner 2's **ratchet** mechanism: enumerate today's violations in `known-violations.json` so the suite fails when a *new* violation appears **and** when an allowlisted one is fixed but not removed. That keeps main mergeable while the debt is machine-tracked, instead of landing deliberately red.

`build.js` needs one pure refactor here — export `getSlug`/`escapeAttr`/`getNearbySuburbs`/`getMetaDescription` and allow `CONFIG` override. That produces zero output drift, which Batch 1's guard proves for free.

**How we verify.** The scanner must reproduce the audit's exact counts: 340 HTML files walked in ~60ms; 316 files containing `YOUR_ID_HERE`; 242 of 314 suburb meta descriptions over 160 chars; 329 files with a raw space in `og:image`; template.html the only file with live `{{TOKEN}}`s. All ~22,752 `href`/`src` values resolve in ~100ms (template.html resolved as if it lived in `service-areas/`), reproducing the audit's zero-broken-links result. Mutation-check the ratchet: delete one entry and expect failure; add a stray `service-areas/roofing-zzz-test.html` and expect `build-output-contract` to fail (today `git diff --exit-code` returns 0 for that). `build-fixture.test.js` runs the real template against a 6-entry synthetic `suburbs.json` in `os.tmpdir()`: no `{{` survives; a suburb named `Test & "Co"` produces no raw `&` or `"` inside any `title=`/`content=` attribute; a record missing `region` or with a non-`/^4\d{3}$/` postcode exits non-zero; and the nearby list is ordered by postcode proximity — **this last assertion fails today and is the regression guard for H-16.** `node scripts/check-diff-homogeneity.mjs` exits 0 on a clean tree and 1 when one page is deliberately corrupted. CI gains `permissions: {contents: read}`, `timeout-minutes`, a concurrency group, prettier, `npm audit --audit-level=high`, coverage thresholds, and `git add -A && git diff --cached --exit-code` so untracked and deleted pages fail too.

**Risk.** Low — no production behaviour changes. But it's ~2,000 lines of new test code plus a jest `projects` split, and **a badly-calibrated invariant becomes a permanent source of red-build noise that trains people to ignore CI — the exact failure H-15 already caused.** Every invariant must be *derived from source* (parse script.js for unguarded `getElementById`; import `REQUIRED_FIELDS` from `api/submit-quote.js`) rather than hardcoded, or it rots. Run `npm audit fix` as its own commit inside this PR so the new audit gate doesn't land red.

**Deliberately not using Playwright:** no browser download, no dev server, no CI minutes, and the failure mode being guarded against is fully reproducible in jsdom. **Be explicit that jsdom will not catch H-13 (200% zoom), M-22 (contrast rendering) or M-23 (clipped focus ring)** — those stay a manual PR checklist item, and pretending otherwise is worse than admitting it.

**Effort.** 2 days.

---

## Batch 20 — Structured data and on-page markup corrections

**Goal.** Make every FAQ JSON-LD block describe the page it's actually on, and remove invented friction from the homepage lead form.

**Findings.**
- **H-19** — FAQPage JSON-LD does not match the visible FAQ on 6 pages; `new-roof-installation-brisbane.html` has **zero** overlap between its four marked-up questions and its four visible ones.
- **L-25** — Two selects on the index contact form are `required` in HTML, unmarked in their labels, and not required by the API at all.
- **L-66** — faq.html marks up 5 of 7 visible questions and targets "Australia" rather than Brisbane.

**Files touched.** `new-roof-installation-brisbane.html`, `roof-replacement.html`, `gutters-downpipes-brisbane.html`, `roof-insulation-brisbane.html`, `roof-repairs-brisbane.html`, `skylights-whirlybirds-brisbane.html`, `blog/how-much-roof-replacement-cost-brisbane-2026.html`, `faq.html`, `index.html`, `__tests__/html-invariants.test.js`

**Why it's here.** Invisible structured data is a documented cause of manual actions. The downside isn't losing rich results on one page — it's a **site-wide manual action removing every rich result across all 335 indexable URLs.** It sits at 20 rather than earlier because the harm is probabilistic rather than continuous, and because Batch 19's invariant suite now makes it permanently enforceable. Note the audit explicitly *cleared* faq.html of H-19 — L-66 is the narrower fix there.

**How we verify.** Extend the invariant suite: for every page containing a FAQPage block, every `mainEntity[].name` must appear verbatim as visible text in the same file after entity decoding. Currently 6 violating pages (new-roof-installation 4 absent, roof-replacement 2, gutters 2, insulation 2, cost blog 2, repairs 1, skylights 1) → must be zero. Better still, generate both the visible FAQ and the JSON-LD from one array per page so they cannot diverge again. Google Rich Results Test returns FAQ-eligible with no warnings. faq.html: 7 marked-up questions matching 7 `<h3>`s, retargeted to Brisbane/Queensland. `grep -n 'required' index.html | grep -c 'roof_type\|service'` → 0. All 47 JSON-LD blocks still parse.

**Risk.** Low. Pure markup, no build step. **L-25 must match Batch 12's actual API contract, not the current one.**

**Blocked on.** Ops (informational): Search Console — check for an existing manual action first. If one has landed, this batch is a prerequisite for a reconsideration request, not a substitute for it.

**Effort.** 1 day.

---

## Batch 21 — THE REGENERATION: template.html + build.js, all 314 suburb pages at once

**Goal.** Land every remaining template-driven fix in a single rebuild, so the 314-file diff is paid once rather than twenty-four times.

**Findings.**
- **H-11** — 314 suburb pages don't mark Property Address `required`, but `api/submit-quote.js:27` hard-rejects without it.
- **H-16** — "Nearby Suburbs We Service" links are chosen by first letter, not geography.
- **H-18** — 314 suburb pages each publish a LocalBusiness address located in that suburb.
- **M-6** — All page content ships at `opacity:0` with no no-JS fallback.
- **M-10** — Collapsed FAQ answers stay in the tab order and the accessibility tree, with no `aria-controls`.
- **M-12** — The address autocomplete declares `role=combobox` with no ids, `aria-controls` or `aria-activedescendant`.
- **M-31** — Hero LCP is a 1440×1920 portrait photo used as a landscape background, 58% cropped, no mobile variant.
- **M-32** — The 58 KB 400×400 PNG logo ships eagerly on ~340 pages at ~120 CSS px.
- **M-39** — `og:image`, `twitter:image` and JSON-LD `image` URLs contain a raw unencoded space on 329 files.
- **M-40** — Hero trust statistics render as "0+ Years / 0+ Roofs / 0% Satisfaction" in the served HTML on 331 pages.
- **M-41** — Unverifiable trust numbers and superlatives site-wide.
- **M-42** *(minimum scope only)* — Expand the 8 description templates and 3 climate variants that make 314 pages near-duplicates.
- **L-35** — 278 decorative inline SVGs lack `aria-hidden="true"`.
- **L-36** — Footer headings jump h2 → h4 on all pages; four pages jump h1 → h3.
- **L-39** — The primary `<nav>` has no accessible name.
- **L-42** — Six declared Google Font weights are never downloaded, so headings render in synthetic bold.
- **L-58** — Suburb names are escaped in locations.html but not in the nearby-suburb cards.
- **L-59** — build.js never validates suburbs.json.
- **L-61** — 315 pages declare `og:image` 1200×630 for an image that is 400×400.
- **L-62** — template.html is deployable at `/template.html` with live `{{SUBURB}}` placeholders and no noindex.
- **L-63** — 242 of 314 suburb meta descriptions exceed 160 characters.
- **L-64** — Four unlinked business entities; the only `@id` is on the wrong page.
- **L-67** — Three noindex internal-workflow pages are linked from every footer.
- **L-69** — TODO comments and a `YOUR_ID_HERE` GA4 block ship in production HTML on 340 pages.

**Files touched.** `template.html`, `build.js`, `suburbs.json`, `scripts/enrich-service-areas.cjs`, `service-areas/*.html` (314 generated), `locations.html`, `sitemap.xml`, `index.html`, `quote.html`, `roof-replacement.html`, `styles.css`, `script.js`, `images/`, `.vercelignore`

**Why it's here — and why it is ONE batch, not two.** Planner 1 proposed splitting this into two sequential regenerations (content/SEO, then accessibility/performance), arguing that two diffs with distinct themes are more reviewable than one 24-finding diff. **We're overruling that and siding with the other two planners.** The review of a 314-file diff is carried by `check-diff-homogeneity.mjs` and the invariant suite, **not by human eyes reading themes** — so a thematic split buys almost no review value while costing a second full 314-file diff, a second round of Search Console churn, and a second high-risk deployment. Pay it once. Structure it as one PR with **one commit per template region** (head/JSON-LD, hero/stats, contact form, footer) so review is per-region within a single regeneration.

It comes last among the code batches because it is unreviewable without Batch 1's CI fix, Batch 2's sitemap decoupling and Batch 19's homogeneity checker — and because **Batch 3 already retired the customer-facing harm of H-11** (the silent 400 now reads "Property address is required"), which is precisely what made deferring this acceptable. Note what is deliberately *not* here: H-9 and H-10, fixed in script.js in Batch 3 specifically to keep them off this critical path.

Highest-value items: **H-18** — 314 distinct `addressLocality` values on one name, one phone and no `streetAddress` is the textbook local-spam fingerprint, and combined with ~43% unique body text it can suppress the whole domain. **H-16** — Redcliffe's page currently recommends suburbs 45 km inland while omitting four adjacent ones, and carries two contradictory nearby lists; copy the correct postcode-proximity implementation already sitting in `enrich-service-areas.cjs:125-129`.

**Guard the anchor.** `template.html:236` carries the literal `<!-- ===================== SERVICES ===================== -->` comment that `enrich-service-areas.cjs:41/202` requires. Removing or reformatting it makes enrich silently mark every page "skipped" rather than failing loudly.

**How we verify.** Four mechanical gates, then a narrow human review.
1. `node scripts/check-diff-homogeneity.mjs` — every changed file under `service-areas/` must have identical added/removed line counts and identical added lines after normalising suburb/region/postcode/slug.
2. The Batch 19 ratchet shrinks to empty for these findings and `npm test` stays green: `{{TOKEN}}` count 0; `YOUR_ID_HERE` 0 (from 316); `TODO(owner)` 0 (from 340); meta descriptions >160 chars 0 (from 242); raw-space `og:image` 0 (from 329); `data-count` spans with initial "0" 0 (from 331); inline SVGs without `aria-hidden` 0 (from 278); zero h2→h4 or h1→h3 jumps; every `<nav>` has an accessible name; exactly one Organization `@id` site-wide, on index.html.
3. `grep -c '"addressLocality"' service-areas/*.html | grep -v ':0'` → empty (from 314).
4. `build-fixture.test.js`'s postcode-ordering assertion flips from red to green (H-16); the `Test & "Co"` escaping and suburbs.json validation assertions pass.
Then: `git diff --stat` shows exactly 314 + locations.html + sitemap.xml plus the hand-edited pages; `scripts/enrich-report.json` shows zero "skipped"; `curl -I <preview>/template.html` → 404; the jsdom contact-form suite re-runs green against a regenerated page. Finally, **one human reviews exactly three things**: the template.html diff, the build.js diff, and `git diff service-areas/roofing-ascot.html`. Spot-check `roofing-southport.html`, `roofing-redcliffe.html` and `roofing-ascot.html` live in a real browser, and submit one real lead from a preview suburb page.

**Risk. High — and nobody should call this low risk under any framing.** It rewrites 314 committed files (94% of the site's indexable inventory) in one commit, changes JSON-LD that Google has already crawled on every one of them, and alters the form markup on the site's highest-volume conversion surface — driven by 24 simultaneous edits to the single highest-conflict file in the repo. The diff is physically unreviewable by a human and is trusted entirely to the homogeneity script and the invariant suite; **if either is miscalibrated, a systematic error ships to 314 pages at once.** M-12's combobox rewiring is the riskiest single item — a half-wired combobox is worse for screen-reader users than no ARIA at all, and needs a real screen-reader pass jsdom cannot substitute for. Ship on a Monday with a tested one-commit revert path. Expect a period of Search Console churn afterwards.

**Blocked on.** Batch 17 must be live (cache headers) or the new assets never reach existing visitors. New binary assets produced. The rename-vs-percent-encode decision settled **before the first line is written**. Owner: trading address, M-41 substantiation, ABN, GA4 ID. Ops: Search Console baseline recorded before and after.

**Effort.** 4–5 days.

---

## Batch 22 — No-JS fallback and the blog post move

**Goal.** Give the native POST path a real destination, and move the root blog post under `/blog/`.

**Findings.**
- **L-27** — With JS unavailable the contact form POSTs natively and shows raw JSON.
- **L-68** — The Colorbond post sits at the root, targets the same query as roof-replacement.html, and has one inbound link.

**Files touched.** `thank-you.html` (new), `api/submit-quote.js`, `blog-colorbond-roof-replacement-brisbane-gold-coast.html` → `blog/colorbond-roof-replacement-brisbane-gold-coast.html`, `vercel.json`, `build.js`, `blog/index.html`

**Why it's here — all three planners agreed on the placement.** A `git mv` of that file makes every line reference in H-20, H-21, M-27, M-28, M-41 and L-30 go stale, so doing it earlier forces the redirect, sitemap and inbound-link work to be redone after each content change. The audit's own file map says do it last. L-27 joins because it matters more *after* Batch 3, which deliberately routes users with a missing submit button into the native POST path.

**How we verify.** `curl -sI <preview>/blog-colorbond-…` → 301 with the correct `Location`; the new URL → 200. `npm run build` → the sitemap contains the new URL exactly once and the old one zero times, and the "no `<loc>` matches a vercel.json redirect source" assertion still passes. **The link-integrity test must stay green with zero broken references across all 340 files** — that's the assertion that catches a missed inbound link, which is the entire failure mode of a file move. With JS disabled, submitting the index contact form lands on thank-you.html, not a JSON blob.

**Risk.** Low, and fully covered by the link-integrity and sitemap invariants from Batch 19. The only external cost is a temporary ranking wobble while Google processes the 301.

**Effort.** Half a day.

---

## 4. Regression guards

Which guard lands where, and — stated plainly — which findings each one would have caught.

| Guard | Lands in | What it would have caught |
|---|---|---|
| **`fetch-depth: 0` on checkout** | Batch 1 | H-15 itself. Without it, no other guard's signal is trustworthy. |
| **Committed `build-meta.json` lastmod** | Batch 2 | Makes every build.js and template.html diff legible instead of drowning in 656 sitemap lines. Not a defect guard — a *reviewability* guard. |
| **Derived DOM-contract invariant** (parse script.js for un-null-guarded `getElementById` literals; require those ids on every page loading script.js) | Batch 3 | **C-2 outright.** Also H-9 (322 pages), and it tightens itself automatically the next time anyone adds a `getElementById` to script.js. |
| **jsdom contact-form suite** (real committed page, fetch mocked) | Batch 3 | **C-2 on the page where it happened**, plus H-9, H-10, M-11, M-16. This is the layer whose absence let C-2 survive two PRs and a prior audit. |
| **Source-grep tests** (`reply_to`, `content_type`, `AIzaSy`, `DO UPDATE SET … bsb`, `author-avatar`, console-PII) | Batches 4, 5, 6, 7 | H-1, H-3, H-7, L-6, C-1 regression, H-20, M-5. Cheap, and they make a future refactor unable to silently reintroduce the bug. |
| **Corpus form/ARIA invariants** (no `display:none` on inputs; `aria-describedby` present; no duplicate `<label for>`; every `pattern` has a `title`) | Batch 8 | C-3, M-13, L-31, and the duplicate-label defect at new-employee-form.html:624/626. |
| **`scripts/check-contrast.mjs`** | Batch 9 | M-21, M-22, M-24. Note it cannot catch M-23 (a *rendering* clip) — that stays manual. |
| **Zero-regeneration assertion** (`npm run build && git diff --exit-code -- service-areas locations.html sitemap.xml`) | Batch 9 | Proves the CSS-only claim empirically rather than trusting the audit's (wrong) "rebuild to propagate" note on M-22. |
| **Strengthened cron assertion** (exact SQL text + bound value, mutation-checked) | Batch 15 | L-57, and it is the guard that keeps H-2's tier rewrite honest — the current `updateCalls.length > 0` would stay green even if the rewrite updated the wrong column. |
| **`__tests__/verify-origin.test.js`** | Batch 13 | M-34, L-3, L-12 — and specifically the `ALLOWED_ORIGINS` parse branch that production almost certainly takes and no test has ever executed. |
| **Link-integrity test** (all ~22,752 `href`/`src` values resolve, in ~100ms, no network) | Batch 19 | Replaces linkinator. Catches M-39's raw-space image URLs and, critically, the missed-inbound-link failure mode of Batch 22's file move. |
| **`no-unfinished-markup` test** (no `{{TOKEN}}`, no `YOUR_ID_HERE`, no `TODO(owner)`, meta ≤160, title ≤60) | Batch 19 | L-62, L-63, L-69 — and outright the entire class M-35 names, "a renamed placeholder leaves `{{NEARBY_SUBURBS}}` on 314 pages". |
| **`build-fixture.test.js`** (real template + synthetic suburbs.json in tmpdir) | Batch 19 | L-58 (`Test & "Co"` escaping), L-59 (suburbs.json validation), and **H-16** — the postcode-ordering assertion fails today and is the permanent regression guard for it. |
| **`build-output-contract.test.js`** (sitemap ⟷ disk ⟷ suburbs.json) | Batch 19 | Orphaned and deleted pages, which `git diff --exit-code` is structurally blind to. Today `touch service-areas/roofing-fake.html` passes the guard. |
| **`check-diff-homogeneity.mjs`** | Batch 19 | Not a defect guard — the thing that makes **Batch 21 reviewable at all**, by converting a 314-file review into template.html plus one representative page. |
| **CI gates** (`git add -A && git diff --cached`, coverage thresholds, prettier, `npm audit`, C-2/H-20 greps, job hardening) | Batch 19 | M-35, L-53, L-54, and it stops the already-working API test layer from silently rotting. |
| **FAQ-schema-matches-visible-text invariant** | Batch 20 | H-19 across all 7 pages, permanently. |

**Honest limits.** jsdom has no layout, no compositing and no real focus-ring semantics. It will **not** catch H-13 (nav clipped at 200% zoom), M-22/M-21 as *rendered*, M-23 (focus ring clipped by `overflow:hidden`), or anything about real LCP. Those stay a manual pass on a PR checklist. Pretending a tool covers them is worse than admitting it doesn't.

---

## 5. Deferred / not doing

| Finding | Reason |
|---|---|
| **M-42** *(strategic half only)* | The minimum fix — expanding build.js's 8 description templates and enrich's 3 climate variants — **is** assigned, to Batch 21. What's deferred is consolidating 314 micro-suburb pages into region hubs and writing 300+ words of genuinely local copy for the top 30–50. That's an owner content programme measured in weeks of writing, it *deletes* pages (which build.js does not prune and the drift guard is structurally blind to), and it must be driven by Search Console "Crawled – currently not indexed" counts rather than an engineer's judgement. Revisit with 8 weeks of post-Batch-21 indexation data. Batch 21 already removes the signals that actually risk the domain (H-18's fake addresses, H-16's alphabetical lists, L-63's duplicate-shaped descriptions). |
| **L-16** — `window.__quoteAutoLat`/`__quoteAutoLng` dead code | Not a bug. Both are only ever assigned `null`, and `script.js:296-298` documents that as deliberate ("we no longer capture coordinates from Google, let the server geocode"). Deleting it is tidiness with a nonzero chance of changing quote.html's payload shape. |
| **L-41** — pricing tables in `overflow:hidden` containers | Latent, not active. The audit tried and could not make the clip trigger — both are two-column tables of wrappable prose with no long unbreakable tokens, and at a 288px content box the min-content width fits. The missing `scope`/`caption` are advisory techniques and implicit header association already works with a proper `<thead>`. Revisit only if the tables gain a third column. |
| **L-44** — unthrottled scroll handler | The audit's own verdict is "still acceptable", carried over unchanged from the 2026-07-10 audit. The write is a two-argument `classList.toggle` that doesn't mutate the DOM when the value already matches, the listener is `{passive:true}`, and Chrome coalesces scroll events to one per frame. A rAF guard would be churn. |
| **L-70** — coastal durability copy vs the salt-erosion warranty exclusion | The audit concludes these are not in genuine conflict: the marketing text is a product recommendation (marine-grade Colorbond Ultra), while the T&C exclusion governs the *workmanship* warranty, which has never covered environmental corrosion of the substrate. The audit marks the fix "Optional". Acting on it means editing `enrich-service-areas.cjs` and regenerating 50 coastal pages to fix a difference of register, not a defect. If you later want the two documents to read consistently, fold it into a future rebuild rather than paying a regeneration for it alone. |

---

## 6. Sequencing summary

| # | Batch | Findings | Risk | Effort | Blocked? |
|---|---|---|---|---|---|
| 1 | CI drift guard tells the truth | 1 | Low | 30 min | — |
| 2 | Decouple sitemap lastmod | 1 | Medium | 0.5 d | — |
| 3 | Stop discarding quote enquiries (+ minimal harness) | 5 | Medium | 1 d | — |
| 4 | Close the bank-detail overwrite | 2 | Medium | 0.5 d | Ops (DB forensics), Owner |
| 5 | Resend field names + body guards | 4 | Low | 3 h | Ops (verify only) |
| 6 | Rotate the Google Maps key | 1 | Low | 1 h | **Ops (rotation)** |
| 7 | Content integrity: warranty, testimonials, pricing | 6 | Medium | 1 d | **Owner ×6** |
| 8 | Onboarding forms: keyboard access | 10 | Medium | 1–2 d | — |
| 9 | Nav, focus and contrast (zero regeneration) | 10 | Medium | 1 d | — |
| 10 | colour-confirmation.html | 8 | Low | 1 d | — |
| 11 | quote.html client | 10 | Medium | 1–2 d | Owner ×2 |
| 12 | Instant-quote endpoint | 9 | Medium | 1–2 d | — |
| 13 | Rate limiting + origin guard | 5 | Medium | 0.5 d | **Ops (Upstash, ALLOWED_ORIGINS)** |
| 14 | AI call budget + expiry arithmetic | 4 | Medium | 1 d | Ops (model id, caps) |
| 15 | Insurance reminders escalate | 5 | Medium | 1 d | **Ops (migration, env)** |
| 16 | PII at rest: encryption + widths | 5 | **High** | 2–3 d | **Ops (backup, migration), Owner** |
| 17 | Cache headers, CSP, images | 5 | Medium | 1 d | Assets, Owner (hashing) |
| 18 | locations.html + page catch-up | 6 | Low | 0.5 d | — |
| 19 | Guard rails: build tests, invariants, CI | 6 | Low | 2 d | — |
| 20 | Structured data + on-page corrections | 3 | Low | 1 d | Ops (Search Console) |
| 21 | **THE REGENERATION** (314 pages) | 24 | **High** | 4–5 d | **Batch 17 live, assets, Owner ×4, Ops** |
| 22 | No-JS fallback + blog move | 2 | Low | 0.5 d | — |
| — | Deferred | 4 | — | — | — |
| | **Total** | **136** | | **~7–9 weeks** | |

**Critical path.** Batches 1 → 2 → 19 → 21 is the structural spine: nothing about the 314-page regeneration can be trusted until the CI guard passes, the sitemap stops churning, and the invariants exist. Everything else can be reordered around owner and ops availability. **The two batches to start ops work on today are 4 (the DB forensic query, which must run *before* the fix) and 6 (the key rotation).**
