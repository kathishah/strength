# Deployment & Implementation Plan (v1)

Companion to `SPEC-strength.md` (v1.18). Covers how v1 is hosted, authenticated, stored, and built. The spec says *what* the app does; this says *how it runs*.

## 1. Goals and constraints
- Keep the front end a **static site with plain HTML + JS (ES modules, no build step)**.
- One small on-demand backend. No servers, no idle cost.
- Private health data: sign-in required, self-signup off, nothing public.
- Logging must never wait on the network (gym Wi-Fi, Lambda cold starts).
- Single user, but keyed per user so it isn't a rewrite if that changes.

## 2. Architecture
```
Browser (installed PWA)                         AWS
┌──────────────────────────────┐   HTTPS   ┌───────────────────────────────────┐
│ index.html + ES modules      │──────────▶│ Cognito User Pool (login, JWT)    │
│ IndexedDB: cache + outbox    │           │ HTTP API (JWT authorizer)         │
│ event log → replay → state   │──────────▶│   └─ Lambda "events" (Node, arm64)│
└──────────────────────────────┘  Bearer   │        └─ S3 data bucket (private)│
        ▲ static files                      └───────────────────────────────────┘
v1 on S3 + CloudFront (app/); GitHub Pages serves only a redirect to it (the v0.2 viewer was retired in v1.19)
```
- **Hosting:** two sites, side by side.
  - **GitHub Pages** keeps serving the root `index.html`, which since v1.19 only redirects to https://strength.logbook.me (it was the v0.2 viewer).
  - **v1** lives in `app/` and is deployed to a private S3 bucket behind CloudFront (Origin Access Control, HTTPS only). Deploy with `aws s3 sync app/ s3://<site-bucket> --delete` followed by a CloudFront invalidation.
  - Pages also publishes `app/` at `/strength/app/`, since it serves the whole repo. That is harmless (no data, and the Cognito pool id and API URL are not secrets), but if it bothers you, switch Pages to a workflow that publishes only `index.html`.
  - v1 is served at **https://strength.logbook.me** (a CloudFront alias). DNS is at GoDaddy, so a CNAME points the name at the CloudFront domain (no Route 53), and the ACM certificate lives in `us-east-1`. The installed PWA, `localStorage` (refresh token) and IndexedDB are tied to the origin, so changing the domain later means reinstalling and signing in again.
- **Auth:** Cognito **User Pool only** (no Identity Pool; the browser never holds AWS credentials). Self-signup disabled, one user who signs in with email and a **single permanent 6-digit PIN**, no MFA (for now). The page signs in with plain `fetch` to Cognito (`InitiateAuth` with `USER_PASSWORD_AUTH`, then `REFRESH_TOKEN_AUTH`), so there is no SDK and no redirect (avoids the iOS standalone-PWA redirect problem). The ID token is the bearer token.
  - The app client must explicitly enable `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` (password auth is not in the defaults).
  - The PIN is the Cognito "password". Cognito's password policy cannot go below 6 characters and has no maximum, so the policy is minimum length 6 with no character-class rules, and the sign-in form accepts exactly 6 digits (a 4-digit PIN is not possible). Cognito's built-in lockout after repeated wrong attempts is the main brute-force defence; a 6-digit PIN is much weaker than a password, which is acceptable for this single-user app (a stronger sign-in was considered and dropped, see section 12).
  - The user is created with `admin-create-user` and then `admin-set-user-password --permanent`, so the account is never in the `NEW_PASSWORD_REQUIRED` state. The page therefore handles no auth challenges; if Cognito returns one, it shows "sign-in unavailable" instead.
  - A forgotten PIN is reset by an admin with `admin-set-user-password` (no email-based reset flow).
  - Google/Apple sign-in is a possible later addition (redirect-based, riskier on iOS home-screen apps); dropped, see section 12.
- **API:** one HTTP API with a JWT authorizer, so the Lambda contains no token-verification code. As defence in depth, the Lambda also checks the token's `sub` against an `OWNER_SUB` environment variable.
- **Lambda:** one function, Node 22, arm64, esbuild single-file bundle, no VPC, no heavy SDK (use `@aws-sdk/client-s3` only).
- **Storage:** private S3 bucket, versioning on, public access blocked, encryption at rest (SSE-S3).

## 3. The two endpoints

Base path is the HTTP API URL. Both require `Authorization: Bearer <ID token>`. CORS allows only the v1 site origin (`https://strength.logbook.me`), and the `Authorization` and `Content-Type` headers.

### `POST /events` — append events
Request:
```json
{
  "deviceId": "d_7f3a",
  "events": [
    { "id": "01J9Z…ULID", "ts": "2026-09-30T17:42:11.120Z-0003-d_7f3a",
      "v": 1, "type": "set.logged", "entityId": "s_01J9…",
      "payload": { "sessionId": "…", "exerciseId": "goblet-squat", "setNumber": 1,
                   "weightLbs": 25, "suggestedWeightLbs": 20, "reps": 12,
                   "isRampUp": false, "isCalibration": true } }
  ]
}
```
Response `200`:
```json
{ "accepted": 1, "duplicates": 0 }
```
Behavior:
- **Idempotent by `id`:** an event that is already stored counts as a duplicate, not an error, so the client can safely retry the whole outbox.
- The server stamps each stored event with `recvAt` (server time in US Pacific with an explicit offset, for information only). Clients never set it. The response has no cursor: only `GET /events` moves the client's sync position, so a device can never skip events written by another device.
- **Validation** (reject the whole batch with `400` and a per-event reason): max 200 events and 256 KB per request; known `type` and `v`; ULID `id`; required payload fields by type; ranges (weight 0–1000, reps 0–500, level 1–5, RIR 0–10, back pain 0–10); `ts` not more than 1 day in the future.
- **Write path.** Events are stored in the file for the **Pacific-time** month in which they are **received**, not the month in `ts`: `u/<sub>/events/<yyyy-mm>.json`, an append-only array. An offline workout from September uploaded in October therefore lands in October's file, where every device syncing from an October cursor will find it. Months roll over at Pacific midnight (00:00 PDT or PST), not UTC midnight: an event received at 9 pm on September 30 Pacific is a September event even though UTC already says October 1.
  1. `GET` the current month file. If it exists, note its ETag; if not, the array is empty.
  2. Skip events whose `id` is already present (duplicates); append the rest in order.
  3. `PUT` with `If-None-Match: *` when the file did not exist, or `If-Match: <etag>` when it did.
  4. On `412` (someone else wrote first) or `409` (a concurrent conditional write is in flight), start over from step 1. Retry up to 5 times with a short random delay; then return `503` and the client retries later.
  Two devices posting at the same moment is rare, and this makes it safe. A missing key with `If-Match` returns `404`, which is why creation uses `If-None-Match`.
- `401` bad or missing token, `403` `sub` is not the owner, `413` too large, `429` throttled.

### `GET /events?since=<cursor>&limit=<n>` — read events
Response `200`:
```json
{ "events": [ { "...": "as stored, plus recvAt" } ], "cursor": "2026-10:37", "more": false }
```
Behavior:
- **The cursor is a position in the append-only files, not a timestamp.** Format `<yyyy-mm>:<index>`: "in that month's file, everything from this index on, plus every later month's file from the start". Events are only ever appended (never edited or removed) and appends are serialized by the conditional writes, so positions are unique, stable, and free of timestamp ties.
- With no `since`, the Lambda lists `u/<sub>/events/`, reads all month files in order, and returns everything. The returned `cursor` points just past the last event returned.
- With a cursor, it reads that month's file from the index onward, then any later month files. If nothing is new, it returns `events: []` and the same cursor.
- `limit` defaults to 2,000 (max 5,000). When more remain, `more: true` and the cursor points just past the last returned event; the client calls again immediately. Because the cursor is a position, pagination cannot skip or repeat events.
- The client saves the cursor only after the returned events are stored locally. It also deduplicates by event `id`.
- **Warm-up:** the app-open sync is the warm-up. The client runs its normal `GET /events?since=<saved cursor>` as soon as the app opens; it is cheap and wakes the Lambda before the first set is logged. There is no separate ping and no fake cursor.

Nothing else is exposed. There is no update or delete endpoint: edits are new events on the same `entityId`, and deletes are tombstone events, both created through `POST /events`.

## 4. Data layout and event format
```
s3://<data-bucket>/u/<cognito-sub>/events/2026-10.json     # append-only array, one file per RECEIVE month (Pacific time)
```
- **Event envelope:** `{ id, ts, v, type, entityId, payload, recvAt }`. `ts` is a hybrid logical clock string (ISO time, counter, device id) so ordering is stable across devices with skewed clocks, for example `2026-09-28T11:03:00.000-07:00-0004-d_7f3a`. `ts` decides replay order; the file/position decides only sync order.
- **Time zone.** All dates and times use **US Pacific time** (`America/Los_Angeles`, which is PDT, UTC-7, in summer and PST, UTC-8, in winter), written with an explicit offset: `recvAt`, `ts`, `startedAt`, `finishedAt`, and the month of each event file. The validators also accept `Z` and other offsets. Because the offset changes at daylight saving, **timestamps must be ordered by instant, never as plain strings** (during the fall-back hour, `01:15-08:00` is later than `01:30-07:00`). The Lambda exports `compareTs` for this, and the app's own ordering does the same. Calendar concepts in the spec (days of the week, program weeks, the Tuesday/Thursday recovery day) are Pacific too.
- **Event types (v1):** `session.started`, `session.finished`, `set.logged`, `set.edited`, `session.notes`, `setting.changed` (starting weight, increment, trap bar weight, program start date, scheduled-increase options), `swap.set` / `swap.cleared`, `deload.started`, `deload.postponed`, `entity.deleted` (tombstone).
- **State** is `replay(events sorted by ts)` (ties broken by `id`). Sorting first means events that arrive out of order, for example a session uploaded a week late, still produce the same state on every device.
- **Reducers are field-level, not whole-entity.** Every event carries a *patch* of the fields it sets, and replay merges patches per `entityId`, last `ts` winning **per field**:
  - `session.started` sets `{templateCode, startedAt, programWeek, phase, isDeload, backPainBefore}`.
  - `session.finished` sets `{finishedAt, backPainAfter}`; `session.notes` sets `{notes}`. Applying them in any order gives the same session, and none erases another's fields.
  - `set.logged` creates a set with all its fields (`sessionId`, `exerciseId`, `setNumber`, weight, reps, and so on); `set.edited` patches individual fields of an existing set.
  - `setting.changed` sets one key (for example `startingWeight:goblet-squat`); `swap.set` / `swap.cleared` set the swap for a slot; `deload.*` events set the deload record for a program week.
  - `entity.deleted` is final for that `entityId` (ids are never reused): patches for a deleted entity are ignored, whatever their `ts`.
  - A patch for an entity that has not been created yet (arrived early) is held and applied once its creating event appears; a set whose session never appears is ignored by the engine.
- **The catalog is fixed** (spec 4.5): there are no events for creating exercises.
- **Not stored:** the catalog, templates, routines, alternatives, and pushup ladder. They ship inside the app code; a code deploy updates them.
- **Size:** about 45 sets a week is roughly 600 KB a year. Loading everything on a fresh device is fine for years; month files keep the incremental reads small.

## 5. Client behavior (local first)
- **Outbox in IndexedDB:** every user action writes the event locally first and updates the UI immediately. A background task sends the outbox with `POST /events`; on success it removes the sent events.
- **Sync triggers:** app open, `visibilitychange` to visible, `online`, and after each completed set (debounced ~2 s). iOS has no Background Sync, so a session finished with no signal uploads next time the app opens.
- **Draft safety:** the in-progress session is rebuilt from local events, so a refresh or app switch loses nothing. `session.finished` is just another event.
- **Cold starts:** the first request after idle may take about 0.3–1 s. Nothing blocks on it, because reads use the local cache and writes go through the outbox. The sync that runs when the app opens doubles as the warm-up.
- **Auth handling:** keep the refresh token in `localStorage`. If refresh fails (expired, or iOS cleared storage), show the PIN form and keep the outbox; nothing is lost.
- **Timers** use timestamps, not intervals, so they survive screen lock (spec Section 9).

## 6. Security
- Cognito: self-signup disabled, a 6-digit PIN (see section 2 for the policy and its limits), no MFA at first (TOTP can be added later, but it needs challenge handling in the page). Token lifetimes: ID/access 1 h, refresh token 365 days so sign-in is rare.
- Bucket: block all public access, versioning on, lifecycle rule to expire old versions after 90 days.
- IAM: the Lambda role can only `GetObject`, `PutObject`, `ListBucket` on this bucket.
- HTTP API: throttle to a low rate (for example 10 requests per second, burst 20), CORS locked to the site origin.
- Page: no Content-Security-Policy (removed: it blocked exercise GIFs from sites outside a short list); no third-party scripts or analytics.
- Nothing sensitive in URLs; only the opaque `since` cursor (a month and a position).

## 7. Infrastructure as code
A single **AWS SAM** template (`infra/template.yaml`) creates: the site bucket and CloudFront distribution (OAC), the data bucket, the Lambda, the HTTP API with JWT authorizer, the Cognito User Pool and app client (password + refresh auth flows enabled, no client secret; no Identity Pool), and log retention (14 days). The data bucket and the user pool are `DeletionPolicy: Retain`, so deleting the stack never deletes workout data or the login (the user's `sub` is the key prefix). Parameters: `DomainName` (default `strength.logbook.me`), `CertificateArn` (looked up with `aws acm list-certificates --region us-east-1`, never committed), `OwnerSub`. Commands:
```
sam build && sam deploy --guided        # first time
sam deploy                              # afterwards
aws cognito-idp admin-create-user …           # create the single user once
aws cognito-idp admin-set-user-password … --permanent   # no first-login challenge
```
There is one stack, **`strength-prod`**, in `us-west-2`; a dev stack is not needed while the app is unpublished and only being tested. Estimated cost: a few cents a month; everything sits inside free tiers.

## 8. Repo layout
```
index.html                # redirect to https://strength.logbook.me, served by GitHub Pages (was the v0.2 viewer)
app/                      # v1, deployed to S3 + CloudFront
  index.html, manifest.webmanifest, sw.js, css/app.css, icons/     # sw.js is Phase E (section 15e)
  js/
    config.js ids.js time.js main.js    # shared: deployment values, ULIDs and the hybrid clock, Pacific time and ts ordering, page start-up
    store/                # local event log and sync (Phase B, built)
      auth.js api.js                    # Cognito sign-in; POST/GET /events client
      open.js idb.js memory.js merge.js # storage interface, IndexedDB, in-memory (tests, fallback), merge rule
      events.js replay.js               # event store (append, ingest, outbox mirror) and replay (field-level reducers)
      outbox.js sync.js                 # push with quarantine, pull, single-flight, triggers, backoff
    seed/                 # catalog.js program.js: the v0.2 data, copied verbatim (Phase B, built)
                          # rules.js: structured numbers per exercise, slot set counts, ladder, program constants (Phase C, built)
    logging/              # pure workout-logging logic, no DOM/storage/clock (Phase D, built; section 15)
                          # rotation day-view input rows rest-timer draft session-events session-view summary text actions
    ui/                   # auth-screen sync-panel format (Phase B); dom router screens app-header day-screen dial theme
                          # summary-screen (Phase D, 15b); history-screen, exercise-screen, settings-screen, chart (Phase E, 15e)
    theme-boot.js         # plain script in the head: applies the chosen theme before the first paint
    engine/               # pure progression functions (spec Section 5), no DOM (Phase C, built; section 14)
                          # calendar config history load suggest session index
lambda/events/            # index.mjs (both endpoints), registry.mjs (types + validators),
                          # object-store.mjs (S3 interface + adapter), time.mjs (Pacific time)
infra/template.yaml       # SAM template
scripts/                  # deploy-app.sh, aws-env.sh (BUILD.md step 7); build-events.mjs, post-events.mjs, prompt.mjs (step 8)
test/                     # node --test: lambda, registry, time, seed, rules, replay, storage, sync and two-device merge, app modules, scripts,
                          # engine (calendar, history, suggest, plan, simulation), spec-examples + spec-coverage, engine-purity,
                          # logging (rotation, input, rows, draft-rest, events, view, actions, purity)
test-support/             # fake S3 and test builders (outside test/ so node --test does not run them)
private/                  # git-ignored: personal workout data, create-user.sh (holds the PIN)
BUILD.md                  # build and deploy commands
```
Tests run with Node's built-in runner (`node --test`), so there is still no bundler or dependency for the front end. `esbuild` is used only to bundle the Lambda (`sam build`).

## 9. Delivery phases (each ends deployable)
| Phase | Spec milestone | Work | Done when |
|---|---|---|---|
| 0. Freeze | 0.C | Tag the current `index.html` as the frozen v0.2 viewer; create `app/` with an empty shell and the S3 + CloudFront deploy step | Both sites load; Pages unchanged |
| A. Spike | 1 | Deploy SAM stack; login from the page via fetch; `POST`/`GET /events` with a test event; measure cold start | Works from an installed iPhone PWA and desktop; cold start acceptable |
| B. Backbone | 1–2 | Auth screen, outbox, sync, replay, seed data bundled; two-device merge test | Event written on phone appears on desktop |
| C. Engine | 3 | Pure functions for Section 5 with tests for every 5.7 and 5.12 example (design: section 14) | All example tests pass |
| D. Logging | 4 | Session screen, ramp sets, calibration, rest timer, draft safety, swaps, rotation, recovery guidance cards | A full Workout A is logged offline and syncs later |
| D2. Edit a finished workout | 4 | Reopen a finished workout from Home or its summary and tick, edit or undo exercises in it (section 15c, spec v1.15) | A Workout B finished with the pushups unticked can be fixed afterwards, and the next suggestions use it |
| E. History and polish | 5 | History (by exercise and by date), the sync screen in Settings, an export script, the service worker (design: section 15e) | Spec Section 11 acceptance criteria all pass |

Phase C can start in parallel with A and B, since the engine has no dependencies.

**Status (2026-09-30):** Phases 0 and A to E are built, tested (525 tests) and merged to `main`; the site at `https://strength.logbook.me` runs all of them. Earlier text of this note: the site ran Phases B, C and D (deployed together with `scripts/deploy-app.sh`; the Lambda and `infra/` have not changed since Phase A). The owner deployed it, tried it and reports that it works. The spec is v1.17 (v1.15 edit a finished workout, v1.16 no back pain rating, v1.17 Phase E scope). Found after that: a finished workout is locked, so a tick missed before Finish (pushups in Workout B on 2026-09-30) cannot be added. Phase D2 (section 15c, spec v1.15, 504 tests) fixes that: merged to `main` and deployed on 2026-09-30 with `scripts/deploy-app.sh` (static site only). It went in before Phase E. Phase E (scope cut after mock-ups, spec v1.17: History by exercise and by date, sync-only Settings, an export script, the service worker; design in section 15e) is built, tested (525 tests), merged to `main` and deployed on 2026-09-30 (static site only). All phases of v1 are built and deployed. The owner made the phone checks (BUILD.md step 7, Phase E check) and ran `scripts/export-data.mjs` against the real API, and both worked. The open decisions of section 12 are struck out, so nothing is planned beyond v1.

## 10. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Login in an iOS standalone PWA | In-page PIN form, no redirects; Phase A tests it on the phone |
| Offsets change at daylight saving, so string order of `ts` is wrong for about an hour each fall | Order by instant (`compareTs`); the offset is always explicit |
| A 6-digit PIN is guessable | Cognito lockout; single-user app; a stronger sign-in is not planned (section 12) |
| iOS evicts local storage | S3 is the source of truth; local is a cache; re-login restores everything |
| Two devices write at once | `If-None-Match: *` to create, `If-Match` to update, retry on 412/409; idempotent event ids |
| Offline events uploaded later are missed by other devices | Files are partitioned by receive time; the cursor is a file position |
| Concurrent edits to one session | Field-level patches; replay sorted by `ts` |
| Clock skew between devices | Hybrid logical clock in `ts` |
| Schema changes later | Every event has `v`; old versions are upgraded when read |
| Lambda cold start | Local-first UI; the app-open sync is the warm-up |
| Origin change after install (PWA, tokens and IndexedDB are per origin) | Pick the final domain before daily use; custom domain recommended |

## 11. Decisions made
- Warm-up, post-lift cardio, and recovery-routine tracking are out of the app (spec v1.11).
- The v0.2 viewer was retired in v1.19: GitHub Pages serves a redirect to v1, which is built in `app/` on S3 + CloudFront.
- Cognito User Pool only, one permanent 6-digit PIN, no MFA, no Identity Pool.
- One stack (`strength-prod`); no dev stack for now.
- The v1 site is served at `https://strength.logbook.me` (CloudFront alias, DNS at GoDaddy, ACM certificate in `us-east-1`).
- All dates and times are US Pacific (`America/Los_Angeles`) with explicit offsets, including the month of each event file.
- The exercise catalog is fixed; no custom exercise events.
- Spec v1.14 (owner's calls after trying the app): full set counts in weeks 1-4; leg press, hip thrust and reverse lunge pre-fill their first-loaded weight with no history; no RIR; Home is the v0.2 viewer's page (slim header, day pills, swipe cards with superset colours); logging is one tick per exercise with barrel dials in 2.5 lb notches, reps at the recommendation (sections 15b and 15b-2).
- The app is redeployed with `scripts/deploy-app.sh` (static site only).
- A finished workout can be reopened and corrected (spec v1.15, section 15c). It is a Phase D addition (D2), not part of Phase E; Phase E's History by date is now the way in (section 15e).
- Phase E scope (spec v1.17, from mock-ups): History by exercise and by date, Settings = sync only, export as a script, no install-help screen, no settings screens (defaults stay; the engine still honours `setting.changed` events), service worker kept.

## 12. Open decisions
Both struck out (2026-09-30, owner's call after the phone checks): not planned. The 6-digit PIN stays, for a single-user app. The text is kept for reference.
1. ~~**Stronger sign-in later:** replace the 6-digit PIN with a longer password or passkey before the app holds anything beyond personal test data or is shared with anyone else.~~
2. ~~**Google/Apple sign-in later:** only if the PIN form becomes a nuisance. It would need a hosted-UI redirect (test on the installed iPhone app first), a way to keep unknown Google accounts out, and a fixed data owner instead of one prefix per `sub`.~~

## 13. As built (Phase 0 and A)
Deployment facts and behaviours the sections above left open. `BUILD.md` has the commands; `lambda/events/registry.mjs` is the source of truth for event validation.

**Deployed.** Stack `strength-prod` in `us-west-2`; site `https://strength.logbook.me`; the data bucket and user pool are retained on stack deletion. One owner (`OwnerSub` set); the Lambda answers 403 to anyone else and to everyone if it is unset. The stack outputs are the source for `app/js/config.js`, which the app ships with.

**Event log.**
- The event registry is strict: unknown payload fields are rejected, so adding a field or type is a registry change (and a new `v` if the meaning changes). Payload shapes follow spec Section 8 and 6.7; `setting.changed` accepts only the keys listed in the registry.
- `entityId` is only pattern-checked by the server. Conventions in use: session events use the session id; `set.logged` and `set.edited` use the set id; `setting.changed` uses `settings` with payload `{ key, value }`.
- `session.notes` events whose `entityId` starts with `spike_` are Phase A test events; no session refers to them and the engine should ignore them.
- The log already holds real data: the program start date (`programStartDate` = 2026-09-28) and Workout A of 2026-09-28. Both were loaded with `scripts/`.

**API details.**
- `POST /events` with an empty `events` array is a 400. A batch whose events are all duplicates writes nothing. A `404` from an `If-Match` write is retried like `412` and `409`; "retry up to 5 times" means 1 try plus 5 retries, then `503` with `Retry-After`.
- `GET /events` with no events and no `since` returns `cursor: null`; the client keeps no cursor and asks again from the start.
- Known gap: duplicates are detected only within the current month's file, so a retry after a lost acknowledgment that crosses Pacific midnight on the 1st can store an event twice. **Clients must de-duplicate by event `id`** (this plan already requires it), and replay is unaffected. Fix if wanted: also check the previous month's file on `POST`.
- Order events by instant with `compareTs` (`registry.mjs`, and `tsMs` in `app/js/time.js`), never as strings (section 4, Time zone).

**Client (Phase A spike).** Sign-in and refresh use `fetch` (`auth.js`); the refresh token is in `localStorage`, the ID token in memory. Sync saves the cursor only after the returned events are stored locally. The spike kept events in `localStorage` as a cache; Phase B replaced that with IndexedDB and the outbox (13a). `ids.js` makes ULIDs and hybrid-clock `ts` values that the server accepts.

## 13a. As built (Phase B)
Built on branch `v1-phase-b` and merged; deployed to the site together with Phase D. The Lambda and `infra/` are unchanged. `test/merge.test.mjs` runs 2-3 devices (the real app store, outbox and sync) against the real Lambda handler over the fake S3.

**Local store.** IndexedDB database `strength` (`events`, `outbox`, `meta`, `rejected`); one transaction per local write (event and outbox entry) and per pull (events and cursor), so the cursor never moves past events that were not stored. Without IndexedDB the app falls back to memory and says so on screen. The IndexedDB adapter cannot run under `node --test`; `test-support/storage-contract.mjs` is the same 13 cases for every adapter, run in Node against memory and in a browser against IndexedDB. The spike's `localStorage` cache is deleted on first start; the first sync refetches from the server.

**Replay** (`store/replay.js`, pure). Order: instant, counter, device id, then event id. Duplicates by id collapse. Results: `sessions`, `sets`, `settings`, `swaps` (`"A:3"` to exercise id), `deloads` (by program week), `skipped` (unknown type or version, unusable ts). The result depends only on which events exist, checked over 300 shuffled orders.

**Sync** (`store/sync.js`, `store/outbox.js`). Push, then pull; a failed push still lets the pull run. One sync at a time (a request during one adds one more pass). Triggers: app open, visible, online, and 2 s after any local write. Batches of at most 200 events and about 200 KB; a 413 halves the batch. Failures that can pass (network, 408, 429, 5xx) retry after 5, 15, 45, 120, then 300 s while the app is open; sign-in, 400/401/403 and storage errors do not retry.

**Choices made where the plan was silent (confirm or change):**
- *A patch beats the event that created its entity, whatever the ts.* Section 4 says last ts wins per field and that an early patch is held until its creating event appears; the two disagree only when a slow clock gave the patch an earlier ts than the creation. A patch is always made after the entity exists, so replay applies creating events first and patches over them.
- *The hybrid clock observes remote events.* A device that has read another device's ts never writes an earlier one (ignoring ts more than 24 h ahead, which the server refuses anyway). Without this, an edit made on a slow clock after reading another device's edit would lose to it.
- *Events the server refuses are set aside.* A 400 that names events removes them from the outbox and the local log, keeps them with the reason (`rejected`, shown on screen), and sends the rest; otherwise one bad event would block every later upload. A 400 that names no event (for example a bad device id) leaves the outbox alone and is shown as an error. There is no retry or discard control yet.
- *Sets need their session.* Sets whose session is missing or deleted are left out of state, so deleting a session removes its sets.
- *Sign-out keeps the local log and outbox,* and the sign-in screen says how many events are waiting.
- *Sync runs after any local write* (debounced 2 s), since the store cannot tell a completed set from another write.
- *`entity.deleted`* only affects sessions and sets; a tombstone for `settings` or an unknown id changes nothing.

**Not settled by the plan or spec (the first three are decided in section 14):**
- `entityId` for `swap.*` and `deload.*` events (only the payload is used by replay today; tests use `swap_A_1`, `deload_12`).
- What `deload.postponed` means for the original week. Replay stores raw records, `deloads[programWeek] = { programWeek, source?, postponedFromWeek? }`; the event carries no `source`, and spec 5.8 ("schedule restarts from it", "once per scheduled deload") needs the engine to say when a scheduled deload is written as an event at all.
- The seed is the v0.2 display data. Spec section 8 wants numeric `repMin`, `repMax`, `loadIncrementLbs`, `startingWeightLbs`, `firstLoadedWeightLbs`, `startingLevel` and `loadsBack`; v0.2 has text (`sets: "3"`, `reps: "8–12"`, `start: "20 lbs per hand"`) and no increments or `loadsBack`. The pushup ladder and TRX level text are present. Phase C needs a structured catalog.
- Two tabs of the app on one device do not see each other's writes until reload (no `BroadcastChannel`); both would upload, and the server de-duplicates.

## 14. Phase C design (engine)
Spec Section 5 is the rulebook and wins over this section; this section fixes what the spec leaves to the implementation. Work on branch `v1-phase-c`; the session's rules from Phase B apply (tests, small commits, ask before any AWS command, don't read `private/`).

**Scope (cut in spec v1.13).** The first Phase C build implemented all of Section 5 (452 tests). The app only needs to show last time's weights, pre-fill an editable suggestion, and prompt a load increase after a few weeks, so the engine was cut down to that. **Removed** (struck through in the spec, code and tests deleted): earned increases and reductions (5.2 rules 1 and 2), all progression for bodyweight-based exercises (5.4: dead bug, back extension, TRX levels, pushup ladder), ramp-up sets (5.5), calibration (5.6), deload weeks (5.8), the back pain gate (5.9), stall detection (5.10), expected pace (5.11). **Kept:** phases and set counts (5.1, 4.3), the base load (5.2), increments (5.3, now 2.5 lb per dumbbell for two-dumbbell exercises and 5 lb for goblet squat and box squat), first-loaded weights (5.4), starting weights (5.6), the scheduled increase (5.12). The first build is in git history (commits up to `f1db902`) if any of it is wanted back.

**Goal.** Pure functions that turn the replayed state (section 4, `store/replay.js`), the bundled seed and "today" into what the session screen needs: per exercise the suggested weight or level, set count, rep range, last session's sets, and when the next scheduled increase is due. No DOM, no storage, no network, no clock: `today` (a Pacific `yyyy-mm-dd`) and everything else are arguments. Phase D only draws these results and writes events.

**Inputs and outputs.**
- Input: `replay(events)` state (`sessions`, `sets`, `settings`, `swaps`), the seed, `today`. Setting keys are in the registry: `programStartDate`, `trapBarWeightLbs`, `scheduledIncreasesEnabled`, `scheduledIncreaseDays`, and per exercise `startingWeight:<id>`, `firstLoadedWeight:<id>`, `loadIncrement:<id>`, `scheduledIncrease:<id>`. Deload records in the log are ignored.
- Output (`app/js/engine/index.js`):
  ```
  suggestExercise(state, { exerciseId, templateCode, slot, today }) ->
  { exerciseId, type,
    progression,                 // load | loadable | bodyweight | ladder | suspension | hold | none
    sets, repMin, repMax, perSide, holdSeconds, targetDistanceM,   // sets null without a slot; reps null for holds and carries
    weightLbs, level,            // the pre-fill for the edit box: weightLbs for loads (null: no weight, or an unseeded swap),
                                 // level for TRX and the pushup ladder
    targetReps,
    source,                      // starting | hold | scheduled | null   (a subset of the registry's suggestionSource)
    fromWeightLbs, fromLevel,    // last session's base load / level, null with no history
    increased,                   // weightLbs is above fromWeightLbs: the "up arrow" highlight, text "Scheduled"
    incrementLbs, firstLoadedWeightLbs,
    hints: [{ code, text }],     // enter-weight, trx-pair
    lastIncreaseDate, nextScheduledDate,   // Pacific yyyy-mm-dd or null
    scheduledIncrease,           // 'on' | 'off' | 'n/a'
    last }                       // { date, sets: [{ weightLbs, reps, levelNumber, distanceM }] } of the last session, or null

  planSession(state, { today, templateCode }) ->
  { templateCode, today, calendar: { programStartDate, programWeek, beforeStart, phase, targetRir: { min, max } },
    exercises: [{ slot, superset, defaultExerciseId, swapped, ...suggestExercise result }] }
  loggedDefaults(suggestion) -> { suggestedWeightLbs, suggestedLevel, suggestionSource }   // fields for set.logged
  ```
  Phase D writes `isRampUp: false` and `isCalibration: false` on every set (the registry still requires them) and `isDeload: false` on sessions. Unused registry surface: `deload.started` / `deload.postponed`, `calibrationFeel`, the suggestion sources `calibration`, `earned`, `reduction`, `deload`, `gated`.
- Layout: `app/js/engine/` has `calendar`, `config` (settings and slot inheritance), `history`, `load`, `suggest`, `session` (`planSession`, `loggedDefaults`), `index`. `app/js/seed/rules.js` is the structured catalog. All day arithmetic is in `app/js/time.js`.

**Decisions.**
1. **Structured catalog.** `app/js/seed/rules.js` holds the numeric fields spec section 8 lists per exercise id, numeric Phase 2 set counts per template slot, the pushup ladder ranges (display) and program constants. `catalog.js` and `program.js` stay untouched. Values come from spec 4.3, 4.5.1, 5.3 and the 5.6 table; `trapBarWeightLbs` is the trap bar's starting weight. `test/rules.test.mjs` reads those tables out of `SPEC-strength.md`.
2. **`entityId` conventions:** `swap_<template>_<slot>` (for example `swap_A_3`) for `swap.*`. Replay does not use them.
3. **History.** A session counts when it has `finishedAt`; its date is the Pacific date of `startedAt`; only working sets (not `isRampUp`, not `completed: false`, with reps or, for a carry, a distance). Order by instant.
4. **Progression uses what was logged.** The base load is the heaviest weight logged in the last completed session. The scheduled timer is the date of the latest session whose base load is above the session before it, else the date of the exercise's first completed session; an increase is due when `today` is at least `scheduledIncreaseDays` after it, and stays due until a heavier weight is logged. Exactly one increment: from 0 the first-loaded weight, otherwise the exercise's increment.
5. **Program week** = `floor(days since programStartDate / 7) + 1`, by calendar-day arithmetic on `yyyy-mm-dd` strings (no offset involved, so daylight saving cannot shift a week). `pacificDate(ms)` is next to `pacificIso` in `time.js`, with a parity test against `lambda/events/time.mjs`.
6. **Bodyweight-based exercises** (progression `loadable`, `bodyweight`, `ladder`, `suspension`) have no progression: the box is pre-filled with the last weight or level used, else the starting value (back extension 0, TRX level 2, pushup level 1, with that level's rep range).

**Tests** (`node --test`, 331 tests; `sam validate --lint` and `sam build` pass; nothing under `lambda/` or `infra/` changed).
- `spec-examples.test.mjs`: the examples of 5.7 and test cases of 5.12 that were not struck (5 + 5), named `5.7 #12: ...`, `5.12 #8: ...`. The number is the bullet's position in the spec, struck ones included. `spec-coverage.test.mjs` reads `SPEC-strength.md` and fails if a live bullet has no test, a struck one still has one, or a bullet was added, removed or edited (each test carries a fingerprint of its bullet's text).
- `rules.test.mjs` (spec tables against `rules.js`), `calendar`, `history`, `suggest` (scheduled-increase edges, increments by exercise, no progression for bodyweight-based exercises, random-history invariants, shuffled and duplicated events), `plan`, `simulation` (26 weeks of a strong and a weak lifter get identical suggestions), `time` (pacificDate and day arithmetic), `engine-purity` (no `Date`, `document`, `window`, `localStorage`, `fetch` or `indexedDB` in `app/js/engine/`).
- `test-support/engine-log.mjs` builds logs from real events and runs each through the server validator.

**Spec questions to raise, not decide.** The engine follows the reading given.
1. *Program week before `programStartDate`:* week 1, with `calendar.beforeStart = true`.
2. *Timer with no increase yet:* the exercise's first completed session (5.12 said the last calibration session; there is no calibration now). Edited in the spec.
3. *Base load* is the heaviest weight in the last session (5.2), so one heavier set at the end sets the base for the next increase.
4. *Alternatives' rep range and sets:* an alternative with no range of its own takes the range, per-side flag, carry distance and set count of its slot. The spec gives ranges only for slot exercises, TRX and (in the catalog) the pallof press, fixed at 10 per side.
5. *Alternatives' increments:* one-dumbbell (goblet squat, box squat, +5) versus two-dumbbell (+2.5): box squat is treated as goblet-style, the split squats and step-up as two dumbbells. Barbell types +10 (landmine press too), machine/cable +10 (leg press too, although plates are 25 per side), carries +5 per hand as before.
6. *Swapped-in alternative with no seeded weight:* no pre-fill and an `enter-weight` hint; a `startingWeight:<id>` setting wins over the seed, and a setting cleared to null falls back to the seed.
7. *Hold target reps* (not defined): one more than the weakest set at the base load, inside the range; the bottom of the range after an increase and for a first session.
8. *A session with fewer sets than prescribed* counts; sets with `completed: false` or with nothing recorded are ignored.
9. *Pushup level 0* (incline pushup, in the 5.4 reference table) cannot be logged: the registry accepts `levelNumber` and `suggestedLevel` from 1 to 5 only. Not blocking now (the ladder has no progression), but Phase D's pushup level picker cannot offer level 0 until the registry allows it.
10. *Sets and phases:* the deload set halving is gone, so week 11 has the normal Phase 2 set counts.

## 15. Phase D design (workout logging UI)
**Changed after the first test on the phone: see 15b** (v0.2 carousel look, full set counts in weeks 1-4, first-loaded pre-fill, no RIR). Where 15 and 15a mention RIR, two sets in Phase 1 or the grouped session layout, 15b wins.

Spec milestone 4 on the Phase B store and the Phase C engine. Spec 6.2, 6.3, 4.1, 4.5, 4.5.1, 4.6 and 9 are the rulebook (struck text is not built); this section fixes what they leave to the implementation. Branch `v1-phase-d`. No history, settings, export or service worker (Phase E). Nothing under `lambda/` or `infra/` changes: every event below is already in the registry.

**Shape.** Everything that decides something is a pure function over `replay(events)` state, the seed, and arguments (`today`, `nowMs`, ids). The DOM layer only draws view models and forwards taps to `actions`. No `Date`, `document`, `localStorage` or `fetch` in the pure modules; the clock and id generator are passed in (`logging-purity` test, like `engine-purity`).

### Screens
Hash routes, so refresh and the back button work and a refresh during a workout returns to it.

| Route | Screen |
|---|---|
| `#/` | **Home.** Resume card(s) for any unfinished session. Otherwise the next workout (A, B or C by rotation) with an exercise preview, the week and phase, the no-consecutive-days warning if it applies, an optional back-pain-before row (0-10, one tap, skippable) and **Start**. On a recovery day (Tue/Thu by default) the recovery card comes first and the workout card follows ("start a workout anyway"). Link to the recovery routine and, at the bottom, the Phase B sync panel (kept until Phase E gives it a home in settings). |
| `#/session/<id>` | **Session.** Header with workout, program week, phase and target RIR. Exercises grouped by superset, one card each: name (tap for cues), swap, sets x reps, suggestion with its source, "Last: ..." line, increase badge, hints, then one row per set. Sticky rest timer. Bottom: notes, Finish (back pain after, notes, save) and Discard. |
| `#/summary/<id>` | **Summary** of a finished session: total working sets, duration, the "weight increase next time" callouts, back to Home. |
| `#/recovery` | **Recovery routine** (spec 4.6): eight guidance cards (name, prescription, cue, demo image). Nothing is checked, logged or synced. |

The header shows a one-line save state ("All saved on this device", "3 events waiting to upload"), since the person is at the gym with a phone that may be offline.

**Set row.** Weight box with -/+ (steps by the exercise's increment) for `load` and `loadable`; level stepper 1-5 for TRX and the pushup ladder (tap the level for its description); reps box with -/+; distance box for carries; nothing but Done for holds. Optional RIR select (0-5). **Done** logs the set and starts the rest timer. A done row shows its values with **Edit** (inline, Save/Cancel) and **Undo**. A "changed from X" note appears when the weight or level differs from the suggestion. The increase highlight is a header/box accent plus the text "↑ +5 lbs from 25 · Scheduled" (never colour alone), shown for that session only because the next plan is recomputed from what was logged.

### Actions to events
| Person does | Events written (all through `events.append`, so local first) |
|---|---|
| Start | `session.started` (entity `sess_<ulid>`): `templateCode, startedAt, programWeek, phase, isDeload:false, backPainBefore?`. Week and phase come from `planSession(...).calendar`. |
| Done on a row | `set.logged` (entity `set_<ulid>`): `sessionId, exerciseId, setNumber, isRampUp:false, isCalibration:false, completed:true`, the values (`weightLbs, reps, levelNumber, distanceM, rir` as they apply) and `loggedDefaults(suggestion)` (`suggestedWeightLbs, suggestedLevel, suggestionSource`). Also starts the rest timer (draft). |
| Save after Edit | `set.edited` on the set entity with only the fields that changed (none changed: no event). |
| Undo | `entity.deleted { entityType: 'set' }` on the set entity. Tombstones are final, so Done afterwards makes a new set entity with the same `setNumber`. |
| Swap | `swap.set { templateCode, slotNumber, exerciseId }`, or `swap.cleared` when the default is chosen (entity `swap_<template>_<slot>`). |
| Notes | `session.notes` when the text changed (on blur and on finish). |
| Finish | `session.notes` (if changed) then `session.finished { finishedAt, backPainAfter? }`. |
| Discard | `entity.deleted { entityType: 'session' }` (replay drops the session and its sets). |

### Draft safety
Two layers. (1) Everything worth keeping is an event, written to IndexedDB before the UI moves on, so a refresh, app switch or dropped Wi-Fi loses no logged set, and the session screen is rebuilt from `replay` alone. Sync runs 2 s after each write (Phase B), which is the "opportunistically during the session" upload. (2) What is not an event yet lives in a small local draft (`localStorage`, one key, ignored if it belongs to another session or fails to parse): values typed into rows that are not done, rows being edited, notes text, back pain after, extra sets added, and the rest timer (`restStartedAtMs`, `restSec`). Losing the draft (cleared storage) loses only unsaved typing, never a logged set.

### Rules
- **Rotation (spec 4.1).** Next = the successor of the template of the latest *finished* session (order by `startedAt` instant; `finishedAt` alone does not count), A when there is none. Unfinished and deleted sessions are ignored.
- **No consecutive days.** A finished session whose Pacific start date is yesterday (by `pacificDate`, so a 9 pm session is "yesterday" the next morning even though UTC has moved on) gives a non-blocking warning on Home; the button stays enabled.
- **Recovery day.** The Pacific weekday of `today` (`weekdayOf` in `time.js`, 0 = Sunday) is in the `recoveryDays` setting, default `[2, 4]`.
- **Set rows and pre-fill.** Rows are numbered 1..N (N = the slot's set count for the phase, plus extra sets added). A row's weight (and level) is, in order: what the person typed into it, else the value of the row before it (logged or typed), else the suggestion. So changing set 1 pre-fills sets 2 and 3, changing set 2 pre-fills set 3 only, and a value never flows backwards. Reps, distance and RIR are never pre-filled (see the questions). A row can be logged when every input it shows has a valid value; weight 0 is valid.
- **Rest timer.** `remaining = restSec - (now - restStartedAtMs)`, computed from timestamps on every tick and on `visibilitychange`, so a locked screen or a background tab cannot make it drift. Default 90 s (`restTimerDefaultSec` setting when present); -15/+15 s buttons change the length for the rest of the session (15 to 600 s); Skip clears it. When it reaches zero it says so and vibrates where the browser allows.
- **Swap.** Options are the slot's default, alternatives and TRX alternatives (spec 4.5, 4.5.1), from the seed. Disabled once any set of that slot is logged in the session (undo them first).
- **Plans use the session's own date.** A session started at 11 pm and finished after midnight keeps the suggestions it started with: `planSession` is called with the Pacific date of `startedAt`.
- **Program week and phase** on `session.started` and the session header come from the engine's calendar; before the program start date the week is 1 (engine question 1).

### Pure modules (`app/js/logging/`, all tested with `node --test`)
| Module | Contents |
|---|---|
| `rotation.js` | finished/in-progress sessions, `nextTemplate`, `consecutiveDayWarning`, `isRecoveryDay` |
| `home.js` | `homeView(state, today)`: resume list, next workout preview, warning, recovery-first flag |
| `input.js` | parse and step typed numbers (`parseWeight`, `parseReps`, `stepValue`) |
| `rows.js` | `buildRows`: set rows with pre-fill carry-over, done/editing/todo, `canLog`, changed-from |
| `rest-timer.js` | `restStatus(draft, nowMs, defaultSec)`, `startRest`, `adjustRest` |
| `draft.js` | draft shape, `parseDraft` (rejects garbage), field updates, pruning |
| `session-events.js` | payload builders for every event above; tests run each through the server validator |
| `session-view.js` | `sessionView(state, sessionId, draft, nowMs)`: everything the session screen draws |
| `summary.js` | working sets, duration, next-time callouts |
| `actions.js` | `createActions({ events, draft, now, newId })`: the UI-to-event mapping above, over the real event store |
| `ui/session-text.js` | pure strings: last time, increase badge, source labels, dates and times |

Tests use the real event store over memory storage, the real replay and engine, and `validateEvent` on every event written; one test logs a full Workout A offline and syncs it through the real Lambda handler over the fake S3 (the Phase D done-when). The DOM code (`ui/*-screen.js`, `router.js`, `dom.js`, `draft-store.js`) has no logic worth a test of its own; it is checked in the browser pane at phone width.

### Spec questions to raise, not decide
The build follows the reading given.
1. *Reps and distance pre-fill.* Spec 6.3 pre-fills weight only. Reps, carry distance and RIR are empty with the target as placeholder (+/- from empty starts at the target), so a set is never logged with a number the person did not confirm.
2. *Rest timer "adjustable".* Read as -15/+15 s for the rest of the session, default from the `restTimerDefaultSec` setting (Phase E edits it). No sound.
3. *Swap after sets are logged in the slot.* Blocked until those sets are undone.
4. *Undo a set and add an extra set.* Spec is silent; both are provided (a mis-tap at the gym is likely, and a fourth set happens).
5. *Back pain before* is asked on Home and written in `session.started`; it cannot be changed afterwards (the registry has no separate event).
6. *Same-day second workout.* Spec 4.1 warns only for the day after; the same warning, worded for "earlier today", also shows for a second session on the same day.
7. *`recoveryDays` numbering.* 0 = Sunday assumed (registry says only 0-6); default Tue/Thu = `[2, 4]`.
8. *"Weight increase next time" callouts* (spec 6.3) are the exercises whose suggestion would be higher if the same workout were planned 7 days after this session (A, B, C each recur weekly on three days a week). Pending increases the person did not take show here too.
9. *Session left open.* No auto-finish. Home keeps offering Resume (and Discard); a new workout cannot be started while one is open; `finishedAt` is the moment Finish is tapped, so a session finished the next morning has a long duration. A session with no logged set cannot be finished, only discarded.
10. *Only the next workout in rotation can be started.* No picker for A/B/C.
11. *Holds* (TRX plank, weighted bird dog) log completion only: the registry has no seconds field.
12. *Pushup level 0* (incline) cannot be logged (registry allows 1-5); the picker offers 1-5 (engine question 9).
13. *Superset order.* Cards are grouped by superset and listed slot by slot; the app does not interleave the rounds.

## 15a. As built (Phase D, first pass; 15b changes parts of it)
Built on branch `v1-phase-d`, merged to `main` and deployed. Nothing under `lambda/` or `infra/` changed. Tests at the end of the first pass: 467 (331 before Phase D); `sam validate --lint` and `sam build` pass. The pure modules and the actions run against the real event store, replay, engine and the server's own validator (`validateEvent` on every event written), including a full Workout A logged with the network down and synced afterwards through the real Lambda handler over the fake S3 (`test/logging-actions.test.mjs`). The screens were checked in the browser pane at 375 px wide, dark and light, with the network calls to AWS made to fail (a scratch server outside the repo injected the stub): Home on a Tuesday, Start with back pain, typing and the +/- buttons, carry-over, Done and the rest timer, a reload in the middle of a workout, Edit/Save, Undo, Swap to a TRX exercise with the level description, the increase highlight, a carry row, cues with the demo image, Finish with notes and back pain after, the summary, discard, and the recovery routine. Not checked: an installed iPhone home-screen app (the person's step, BUILD.md step 7).

**Differences from the design above.**
- The text helpers are `app/js/logging/text.js` (pure, tested with the view models), not `ui/session-text.js`. Extra UI files: `ui/dom.js` (element builder, two-tap confirm, back pain chips), `ui/router.js`, `ui/screens.js` (mounts the screen for the route and redraws it on every change to the log).
- `ui/draft-store.js` was not needed: `main.js` hands `localStorage` (or nothing, if blocked) to `createDraftStore` in `logging/draft.js`, which falls back to memory.
- Rows are keyed by set id when done and by `<exercise>:<set number>` otherwise. A logged set can be in three states on screen: done (summary, Edit, Undo), editing (boxes, Save, Cancel) and todo.

**Choices made where the design was silent (confirm or change).**
- *Steps.* Weight +/- steps by the exercise's increment (5 lbs if it has none), reps by 1, carry distance by 5 m, level by 1 (1-5).
- *RIR* is a select with 0-5 (the registry accepts 0-10); reps accept 0-500 like the registry.
- *A done row that was logged with a different weight* shows "weight changed from X" against the suggestion stored on that set, not against today's suggestion.
- *Start is hidden while a workout is open* (Resume and Discard instead); Discard needs two taps, Undo one.
- *Sets logged for an exercise that left the plan* (a swap made on another device after logging) stay visible in a "Logged under another exercise" group and still count.
- *The Phase B sync panel* stays on Home inside a "Sync and this device" block (test note, Sync now, Sign out, the event list), hidden on the other screens. The header shows the save state on every screen ("All saved", "N events saved on this device, not uploaded yet", "Sign in to sync").
- *Errors* from a button are shown in the notice at the top of the page and scrolled into view; the notice is cleared when the route changes.
- *A weight of 0* reads "no added weight" (an empty sled, an empty bar or bodyweight, depending on the exercise); in "Last:" lines it is written `0`.
- *Level exercises* say "Starting level" where weight exercises say "Starting weight".
- *Pushups:* the target range follows the level chosen in the row (spec 5.4 table), and the info panel lists all six levels including 0, which cannot be logged (registry).
- *Callouts on the summary* look 7 days ahead (`NEXT_TIME_DAYS` in `logging/summary.js`).
- *Demo images* load only when a card's info is opened (or on the recovery screen), directly from the GIF hosts the CSP already allows; offline they fall back to the placeholder.

**More spec questions found while building** (continuing the list in section 15).
14. *Which day a workout that crosses midnight belongs to.* The Pacific date of its start. That date decides the plan, the "yesterday" warning and the history date; the spec only says "the date of a session" is Pacific.
15. *The pushup target reps* shown as the placeholder are the bottom of the chosen level's range (10 at level 1, 8 above), which matches spec 5.6 ("target 10 reps per set to start") only at level 1.
16. *Rest timer at the end of the workout.* It starts after every Done including the last set, and disappears when the workout is finished.

**Known limits.** No service worker yet, so the app needs the network to load (Phase E); once loaded, logging works offline. Two tabs of the app on one device do not see each other's typing (and, as in Phase B, not each other's writes until reload). The demo images are hotlinked. Stale unfinished sessions are never closed automatically (question 9).

## 15b. Changes after the first phone test (spec v1.14)
The owner deployed Phase B, C and D to `strength.logbook.me` on 2026-09-29 and asked for four changes. Spec and code follow; 475 tests pass.

1. **The v0.2 look on the session screen.** One horizontal scroll-snap carousel, one card per exercise with the neighbours peeking (spec 0.B.1), a left-edge colour per superset (1 green, 2 indigo, 3 amber, finisher none) and the chip "Superset 1 · 1 of 2", the meta block "3 × 8-12 / Sets × Reps", the form GIF with its credit, the cue with "Alternate with <partner>", tags, and the **Options** (cyan) and **TRX** (fuchsia) buttons with counts opening a list with a thumbnail and **Use this** per exercise. A swapped card shows "Swapped from X · Revert". The last card of the carousel is Finish (notes, back pain after, Save and finish, Discard). The header (Strength and the save state) is sticky; the status line reads "Workout B · 2/6 done · 5/17 sets". The v0.2 palette (dark and light, both follow the device) is now the app's palette, Home's exercise preview carries the superset colours, and the summary, recovery and Home cards use the v0.2 card style.
   - *Kept from Phase D, not from v0.2:* the sets sit directly under the card header and the GIF and cues below them, so logging is not pushed below the fold; swap is blocked while sets of the slot are logged; the rebuild after a tap keeps the carousel where it was; a swipe to the next card scrolls the page back to the top.
   - v0.2 had a Prev/Next-free, dot-free carousel with a counter in the header ("x/6 done"); the status line does the same. The manual theme button is not brought back: the app follows the device.
   - The "tap the exercise name for cues" panel is gone (spec 6.3): the cues are on the card.
2. **Full set counts in weeks 1-4** (spec 5.1, 5.7 examples #5 and #28, 4.3 table header). Phase 1 and Phase 2 have the same sets; they differ only in target effort. `PROGRAM.phase1Sets` is gone and `setsFor` ignores the phase. This replaces the "Phase 1 is 2 sets" rule of section 14 and the first design of the engine tests.
3. **No zero pre-fills.** With no history an exercise whose seeded start is 0 and that has a first-loaded weight now pre-fills it (leg press 50, hip thrust 45, reverse lunge 10); back extension and dead bug stay at 0. A weight logged last time still wins, including a logged 0, and a `startingWeight:<id>` setting still overrides the seed (spec 5.6). The scheduled-increase rules are unchanged (from a logged 0 the increase still goes to the first-loaded weight).
4. **RIR is gone from the screen.** No select on the rows, none in the done line, no RIR in the data written; the target effort is said in plain words ("Phase 1 · stop each set with about 3 reps left"). The registry, replay and the engine's `targetRir` still exist and are unused, so old events remain valid.

Also from this pass: the header notice and errors are unchanged; `logging/session-view.js` now returns `chipText`, `ssClass`, `partnerName`, `optionGroups` (alternatives and TRX), `swappedFromName`, `done` per card and `exercisesDone` / `exerciseCount` for the status line.

### 15b-2. Second pass (owner's requests after the first look, spec 6.2 and 6.3 updated)
Six changes; the design above (the v0.2 carousel and colours) stays, with these on top.
1. **Home is the v0.2 page.** No Start card and no session screen: the header (one slim line: the status, for example "Wed · Workout B · 0/6 done", a dot for whether the work is saved with the count of events not yet uploaded, and the theme button System / Light / Dark) opens to the day pills Monday to Sunday, the save state as a sentence, the back pain rating for the workout about to start, and the sign-out icon after Sunday (two taps). Scrolling down or picking a day closes it. The pills show the recovery days indigo, Monday, Wednesday and Friday green, the rest grey; a recovery day shows the routine cards (with a last card, "Show the workout"); any other day shows the next workout. `#/session/...` and `#/recovery` open Home; `#/summary/<id>` remains. `logging/day-view.js` builds it; `ui/app-header.js`, `ui/day-screen.js`, `ui/theme.js` and `js/theme-boot.js` (a plain script that sets the theme before the first paint) draw it. `home-screen.js`, `session-screen.js` and `recovery-screen.js` are gone.
2. **The header is one line high when closed** (44 px) instead of a title row plus a status row.
3. **The GIF is the hero again**, then the cue with "Alternate with ...", the muscles and the Options and TRX lists, as in v0.2; the logging is at the bottom where the viewer had the done checkbox.
4. **One tick per exercise, weights on barrel dials** (the owner picked "option 3, as a barrel dial, in 2.5 notches"; the three layouts sketched in the conversation were rejected). Per set one dial for the weight (level for TRX and pushups), one shared dial for the reps (or metres for a carry), one tick. Each dial shows one value, already at the suggested weight and the recommended reps; drag up for one notch (or more on a flick) up, down for down, or tap the upper or lower half; a mouse can drag or use the wheel. A dial changed on one set carries to the sets after it (rules, `logging/rows.js`). The tick writes every set of the exercise (`actions.saveExercise`); a set with its box cleared is left out. After the tick the card shows a summary line with Edit (the dials reopen; Save writes `set.edited` for what changed, and can add a set that was left out) and Undo (two taps; deletes the exercise's sets). Weight notches are 2.5 lbs for every exercise, whatever its own increment.
5. **The workout starts by itself.** The cards on Home are the next workout's preview; the first tick writes `session.started` (with the back pain rating from the header) and then the sets. What was turned before that lives in a draft under the id `pending` and moves to the new session first, so the screen never redraws with empty dials. A rest timer starts after each tick. The last card of a started workout is Finish (notes, back pain after, Save and finish, Discard).
6. **`scripts/deploy-app.sh`** (and `scripts/aws-env.sh`, to source): one command redeploys the site. See BUILD.md step 7.

**Bug found and fixed on the way.** When the carousel was rebuilt, the old dials were no longer in the page but their pending timers still fired, read a scroll position of 0 and wrote the first notch (0 lbs, 1 rep) into the draft. Dials are now disposed on every rebuild, ignore anything while detached, and report only changes that follow a touch, tap, wheel, key or mouse drag.

**Spec questions, updated.** *1* (reps pre-fill) is settled by the owner: reps start at the recommendation. *4* (undo a set, add a set): Undo is now for the whole exercise; there is no "add a set" control (a fourth set is not offered; say if it is wanted). *5*: back pain before is chosen in the opened header and written when the first exercise is ticked. *9*: a session is started by the first tick, so an empty session can no longer exist; an old unfinished one is listed above the cards with Discard. *10*: only the next workout in rotation is shown; a day pill on a recovery day switches to the routine, not to another workout. New: *17. Rest timer.* It starts after each tick, not each set. *18. Sets done.* One tick logs the planned number of sets at the dial values. To log fewer, tap a set's small caption ("set 3") to skip it (dimmed and struck through; tap again to bring it back); that is a control the spec does not mention.

## 15c. Phase D2 design (edit a finished workout, spec v1.15)
**Why.** `Save and finish` locks a workout: `actions.openSession` throws "That workout is finished", and nothing on screen leads back to a finished session (Home shows the open workout or the next by rotation; the summary is shown once). A missed tick (Workout B, 2026-09-30, pushups) therefore could not be added. Branch `v1-edit-finished` (merged). Nothing under `lambda/` or `infra/` changes: `set.logged`, `set.edited` and `entity.deleted` already exist and are accepted whatever the state of the session.

**Shape.** The same cards as Home, bound to a finished session instead of the open one. No new event types, no new storage.

| Piece | Change |
|---|---|
| Route | `#/workout/<id>` (added to `ui/router.js`; `parseRoute` accepts the same id pattern as `summary`). Mounts `mountDay` in edit mode for that session. A missing or deleted id goes to Home. |
| `logging/day-view.js` | `dayView` also returns `finishedRecent`: finished sessions whose Pacific date is within the last 7 days of `today`, newest first, each `{ sessionId, label, dateText, exercisesDone, exerciseCount }`. New `editView(state, { sessionId, today, nowMs, draftFor })`: `buildView` for that session (plan from the session's own date, swaps as they are), `mode: 'edit'`, status line "Workout B · Wed 30 Sep · editing", no finish card, no warning, no rest timer, no swap buttons. |
| `logging/actions.js` | `saveExercise` and `undoExercise` accept an open or a finished session (`editableSession`; a deleted or missing one still throws). `swap`, `saveNotes`, `finish` and `discard` keep `openSession` and still refuse a finished one. A tick in a finished session does not start the rest timer. `finishedAt`, notes and back pain are never touched. |
| `ui/day-screen.js` | Edit mode draws `editView`: cards as in Workout mode; a "Back" link to Home at the top. Home draws the "Finished workouts" card (`finishedRecent`) under the cards, each row with an Edit button that navigates to `#/workout/<id>`. |
| `ui/summary-screen.js` | An "Edit workout" button next to "Back to Home". |

**Rules.**
- *Rotation and the warning are unchanged.* `nextTemplate` and `consecutiveDayWarning` already count only `finishedAt`, which editing never changes.
- *Next suggestions follow the edit.* History is rebuilt from sets by session (section 14, decision 3), so a set added to a finished session counts in "Last: ..." and in the scheduled-increase timer (the base load of the last session is its heaviest weight, so a corrected weight moves it).
- *Dials on a reopened workout* start at what was suggested for the session's date (`planSession` with the session's Pacific date, as in section 15) and carry down the sets as usual (`logging/rows.js`).
- *No rest timer, no swap, no Finish, no Discard* in edit mode. Deleting a finished workout is not offered.
- *Drafts* use the session id like an open session's (`draft.js`), so a refresh keeps typed values; the draft is cleared when the tick is saved, as now.

**Tests** (`node --test`, same style as `logging-actions.test.mjs` and `logging-view.test.mjs`): tick, edit and undo on a finished session write the right events and all pass `validateEvent`; `swap`, `finish`, `discard` and `saveNotes` on a finished session still throw; `finishedAt`, notes and back pain are unchanged after editing; `nextTemplate` and the warning do not change; a set added to a finished session changes the next suggestion for that exercise; `finishedRecent` lists only finished sessions inside 7 Pacific days, newest first, and not open or deleted ones; `editView` has no finish card and no swap controls; `parseRoute` for `#/workout/<id>`. `logging-purity` still applies. The screens are checked in the browser pane at phone width, including reopening a Workout B and ticking the pushups.

**Spec questions to raise, not decide.** *19. Seven days* is the window of "Finished workouts" on Home; older workouts wait for the Phase E history screen. *20. Notes and back pain after* are not editable on a finished workout (only the tick and set values are); say if they should be.

**As built.** Branch `v1-edit-finished`; 504 tests pass (493 before; 11 new in `test/logging-edit-finished.test.mjs`, and one in `logging-actions.test.mjs` changed, since a finished workout now takes ticks). Nothing under `lambda/` or `infra/` changed. Checked in the browser pane at 375 px wide (a scratch page outside the repo with a memory store and a Workout B finished without its pushups): the "Finished workouts" card on Home, Edit opening the workout with five cards done and the pushups open, no Options/TRX/swap, finish card or rest bar; the tick writing three `set.logged` events into the workout with its finish time, notes and back pain untouched; Home then reading 6/6; the summary's Edit workout button; Undo (two taps) and a stale `#/workout/<id>` returning to Home.
- *Differences from the design above.* `finishedRecent` is also on the recovery-day page. The "Last: ..." line and the dials of a reopened workout are planned from the sessions that started before it (`stateBefore` in `logging/day-view.js`), so they show what the person saw that day; planning from the whole log would have shown the workout's own sets (or a later workout's) as "last time". The 7 days are today and the six before (`FINISHED_DAYS`).
- *Not done, by design.* No edit of notes or back pain on a finished workout, no swap, no delete (question 20 above).

## 15d. Back pain rating removed (spec v1.16)
The owner asked for the back pain rating to go from the header "and anywhere else". Like RIR in 15b, it leaves the screens and the data written, and stays in the event registry and replay so events already in the log (`backPainBefore` on `session.started`, `backPainAfter` on `session.finished`) remain valid. Branch `v1-no-back-pain`; nothing under `lambda/` or `infra/` changes.

- **Screens.** The "Back pain right now" row in the header panel, the "Back pain after" row on the finish card and the two lines on the summary are gone (`ui/app-header.js`, `ui/day-screen.js`, `ui/summary-screen.js`; `painChips` in `ui/dom.js` and the `.bp` styles are deleted).
- **Logic.** `startSession`, `saveExercise` and `finish` take no back pain; `setBackPainAfter` and the draft's `backPainAfter` are deleted (an old saved draft that still has the field is read with it ignored); `sessionStarted` and `sessionFinished` write no back pain; the session view and the summary no longer return it.
- **Kept.** Registry validation (0-10), replay, and the `engine-log` test builder's `backPainBefore` option, so old events are still accepted and replayed. Nothing ever used the value to change a suggestion.
- **Earlier sections** (15, 15a, 15b, 15b-2 and the event tables above) describe the rating as it was built; 15d wins. Sessions already logged keep their values in the log; they are not shown anywhere.

**As built.** 504 tests pass (503 after the removals, plus one for a session logged before v1.16). Checked in the browser pane at 375 px wide (scratch page, memory store): the header panel holds only the day pills and sign-out, the finish card only notes and Save and finish, and the summary only sets, duration and what was done; no "back pain" text anywhere on the page.

Merged to `main` and deployed on 2026-09-30 with `scripts/deploy-app.sh` (static site only).

## 15e. Phase E design (History, sync-only Settings, export script, service worker; spec v1.17)
Spec 6.2, 6.6, 6.7 and 9 are the rulebook; this section fixes what they leave to the implementation. Mock-ups were agreed first (header icons, History by exercise and by date, Settings = sync). Branch `v1-phase-e`. Nothing under `lambda/` or `infra/` changes: no new events. No change to the engine.

### Screens and routes
| Route | Screen |
|---|---|
| `#/history` | **History, by exercise.** Switch at the top (By exercise / By date). Rows under Workout A, B, C. |
| `#/history/date` | **History, by date.** Finished workouts newest first, grouped by week and month, each with Edit. |
| `#/history/exercise/<id>` | **Exercise detail:** stats, chart (Top set / Volume), sessions table. |
| `#/settings` | **Settings:** the sync panel (status, last sync, waiting, counts, storage, set-aside list, recent events, Sync now, Add test note). |
| `#/workout/<id>` | The edit view of a finished workout (15c). Its "Back" link now goes to `#/history/date`. |
| `#/summary/<id>`, `#/` | As before. Unknown routes are Home. |

**Header.** `ui/app-header.js` adds two icon buttons, History and Settings, after the day pills and before sign-out, behind a thin divider, on every screen (`handlers.onNavigate(hash)`; the screens set the status line: "History", "Settings", the exercise name). The pills row wraps on a narrow phone. **Home** loses the "Finished workouts" card (15c): `finishedRecent` and `FINISHED_DAYS` are deleted from `logging/day-view.js`, with their tests.

### Pure module `logging/history-view.js` (no DOM, tested with `node --test`)
- `historyByExercise(state, today)` -> `[{ templateCode, label, rows: [{ exerciseId, name, superset, lastText, lastDate, due }] }]`. Rows are each slot's current exercise (swaps included, via the engine's `exerciseForSlot`), then any other exercise logged in a session of that template. `lastText` is "Mon, Sep 28 · 25 lbs × 10, 10, 9" (from `text.js`) or "Not logged yet"; `due` is `suggestExercise(...).increased`.
- `exerciseDetail(state, exerciseId, today)` -> `{ exerciseId, name, kind: 'weight' | 'level' | 'distance' | 'done', stats: { lastIncreaseDate, nextScheduledDate, scheduledText }, points: [{ sessionId, date, templateCode, sets, top, volume, increase }], rows: newest first with `setsText` }`. A session counts when it is finished and has working sets of the exercise (not ramp-up, not `completed: false`); holds (no reps, no distance) count as "done". `top` is the base load (`weight`), the highest level (`level`) or the longest distance (`distance`); `volume` is the sum of (weight, or 1 when there is none) x (reps, or distance); `increase` is true when `top` is above the previous session's (the engine's definition, 5.12). `scheduledText`: "Off" when the exercise's scheduled increase is off, "Not used" for bodyweight-based exercises, else the date.
- `historyByDate(state, today)` -> `[{ label: 'This week' | 'Last week' | 'September' | ..., rows: [{ sessionId, templateCode, dateText, exercisesDone, exerciseCount, missing, sets, durationText }] }]`. Finished sessions, newest first by instant. Weeks start on Monday (Pacific dates, `time.js`); months carry the year only when it is not the current one. `missing = max(0, slots of the template - exercises with working sets)`.

### UI files (`app/js/ui/`)
`history-screen.js` (switch plus both lists), `exercise-screen.js` (stats, chart switch, table), `settings-screen.js` (the heading; the sync panel element is shown under it), `chart.js` (inline SVG line chart, no library: axis labels, dots, a green dashed line and label at each increase, `role="img"` with an `aria-label` that says the range). `ui/screens.js` mounts them by route; `ui/router.js` parses `history` (`view`, optional exercise id) and `settings`.

**Settings and the sync panel.** `index.html`'s `#device` block becomes a plain card (no `<details>`), shown only on `#/settings`. Its Sign out button goes (the header has it); the rest stays: status, waiting, events, replayed state, storage, cursor, last round trip, set-aside list, events list, Sync now and Add test note.

### Export script
`scripts/export-data.mjs <email> [out-dir]` (out-dir defaults to `private/export/`, git-ignored): asks for the PIN (hidden, as `post-events.mjs`), signs in, pages through `GET /events` until `more` is false, and writes `strength-events-<date>.json` (`{ exportedAt, count, events }`, as stored) and `strength-sets-<date>.csv` (one row per logged working set of a finished or open session, after replay, so edits and deletes are applied). The pure part is `scripts/export-lib.mjs` (`eventsToCsv(events)`), tested over `makeLog` events. CSV columns: `date, workout, programWeek, phase, sessionId, exerciseId, exercise, setNumber, weightLbs, levelNumber, reps, distanceM, suggestedWeightLbs, suggestionSource, setId`. Read-only: nothing is sent to the API but the two GETs. BUILD.md gets a step for it.

### Service worker (`app/sw.js`)
Offline load, not offline sync (sync is unchanged). Install caches the shell (index, css, manifest, icons, every module under `js/`; the list is in `sw.js`, and a test fails if it differs from the files in `app/`). Fetch for same-origin GETs is **network first, cache fallback**: online you always get the deployed files (so `deploy-app.sh` still takes effect on the next load), offline you get what was cached; each successful response refreshes the cache. Cross-origin requests (Cognito, the API, the GIF hosts) are never handled. `skipWaiting` and `clients.claim`, and old caches are deleted on activate. `main.js` registers it after load (skipped without `navigator.serviceWorker`). CSP gets `worker-src 'self'`. A bad worker cannot strand the page while online, since the network answer wins.

### Tests
`history-view` (by exercise rows and due badge, detail kinds weight, level, distance and done, increase marks, volume, by-date grouping across a week and a month boundary, missing counts, empty states), `router` (history and settings routes), `app-header` has no test (DOM) but the screens are checked in the browser pane at phone width, `export-lib` (CSV escaping, edits and deletes applied, order), `sw` (shell list matches `app/`). The Home tests lose the finished-workouts cases.

### Spec questions to raise, not decide
*21. Volume for a carry* is weight x distance (so it grows with both). *22. Holds* show "done" rows and no chart. *23. Months* only appear for sessions older than last week. *24. Nothing in Settings changes a setting*; the old keys stay in the registry.

**As built (Phase E).** Branch `v1-phase-e`; 525 tests pass (504 before). Nothing under `lambda/` or `infra/` changed. Checked in the browser pane at 375 px wide on a scratch page (memory store, seven workouts over two weeks, one Workout B with the pushups unticked): the header panel with History, Settings and sign-out; By exercise; an exercise with its chart, the Top set / Volume switch and the increase lines; By date with "This week", "Last week", "October" and "September" groups and the "1 missing" tag; Edit opening the workout, ticking the missing exercise, and the Back link returning to By date with the tag gone; Settings showing the sync panel. The service worker was checked on the real `app/` folder: it installs, caches 60 files, and with the dev server stopped the page still loads and renders.
- *Differences from the design above.* The exercise kinds are `weight`, `level`, `distance`, `reps` (no added weight, such as the dead bug: top is best reps) and `done` (no chart). The header's three icons are one group, so on a 375 px phone they wrap together onto their own line under the day pills; beside the pills on a wider screen. The Settings card keeps the old panel's extra rows (replayed state, cursor, last round trip) as well as the ones in the mock-up. `statusText` and Back link of the edit view now say History.
- *Checked afterwards by the owner.* The installed iPhone home-screen app (offline load, the header icons) and `scripts/export-data.mjs` against the real API.
- *Deploy.* `scripts/deploy-app.sh` as before. `sw.js` is uploaded with `no-cache` like every other file, and the next load installs it.
