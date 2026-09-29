# Deployment & Implementation Plan (v1)

Companion to `SPEC-strength.md` (v1.12). Covers how v1 is hosted, authenticated, stored, and built. The spec says *what* the app does; this says *how it runs*.

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
v1 on S3 + CloudFront (app/); GitHub Pages keeps the frozen v0.2 viewer
```
- **Hosting:** two sites, side by side.
  - **GitHub Pages** keeps serving the root `index.html` (the v0.2 viewer), frozen: bug fixes only.
  - **v1** lives in `app/` and is deployed to a private S3 bucket behind CloudFront (Origin Access Control, HTTPS only). Deploy with `aws s3 sync app/ s3://<site-bucket> --delete` followed by a CloudFront invalidation.
  - Pages also publishes `app/` at `/strength/app/`, since it serves the whole repo. That is harmless (no data, and the Cognito pool id and API URL are not secrets), but if it bothers you, switch Pages to a workflow that publishes only `index.html`.
  - v1 is served at **https://strength.logbook.me** (a CloudFront alias). DNS is at GoDaddy, so a CNAME points the name at the CloudFront domain (no Route 53), and the ACM certificate lives in `us-east-1`. The installed PWA, `localStorage` (refresh token) and IndexedDB are tied to the origin, so changing the domain later means reinstalling and signing in again.
- **Auth:** Cognito **User Pool only** (no Identity Pool; the browser never holds AWS credentials). Self-signup disabled, one user who signs in with email and a **single permanent 6-digit PIN**, no MFA (for now). The page signs in with plain `fetch` to Cognito (`InitiateAuth` with `USER_PASSWORD_AUTH`, then `REFRESH_TOKEN_AUTH`), so there is no SDK and no redirect (avoids the iOS standalone-PWA redirect problem). The ID token is the bearer token.
  - The app client must explicitly enable `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` (password auth is not in the defaults).
  - The PIN is the Cognito "password". Cognito's password policy cannot go below 6 characters and has no maximum, so the policy is minimum length 6 with no character-class rules, and the sign-in form accepts exactly 6 digits (a 4-digit PIN is not possible). Cognito's built-in lockout after repeated wrong attempts is the main brute-force defence; a 6-digit PIN is much weaker than a password, which is acceptable for this single-user test app and should be revisited before wider use (see section 12).
  - The user is created with `admin-create-user` and then `admin-set-user-password --permanent`, so the account is never in the `NEW_PASSWORD_REQUIRED` state. The page therefore handles no auth challenges; if Cognito returns one, it shows "sign-in unavailable" instead.
  - A forgotten PIN is reset by an admin with `admin-set-user-password` (no email-based reset flow).
  - Google/Apple sign-in is a possible later addition (redirect-based, riskier on iOS home-screen apps); see section 12.
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
- Page: a Content-Security-Policy meta tag allowing only self, the Cognito and API origins, and the GIF publishers; no third-party scripts or analytics.
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
index.html                # FROZEN v0.2 viewer, served by GitHub Pages (bug fixes only)
app/                      # v1, deployed to S3 + CloudFront
  index.html, manifest.webmanifest, css/app.css, icons/     # sw.js arrives in Phase E
  js/
    config.js auth.js api.js ids.js time.js main.js         # Phase A spike, as built (flat)
    engine/               # pure progression functions (spec Section 5), no DOM       (planned)
    store/                # events, outbox, replay, sync, auth                          (planned)
    ui/                   # screens (home, session, history, settings, recovery)        (planned)
    seed/                 # catalog, templates, recovery routine, ladder, alternatives  (planned)
lambda/events/            # index.mjs (both endpoints), registry.mjs (types + validators),
                          # object-store.mjs (S3 interface + adapter), time.mjs (Pacific time)
infra/template.yaml       # SAM template
scripts/                  # build-events.mjs, post-events.mjs, prompt.mjs (see BUILD.md step 8)
test/                     # node --test: lambda, registry, time, app modules, scripts
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
| C. Engine | 3 | Pure functions for Section 5 with tests for every 5.7 and 5.12 example | All example tests pass |
| D. Logging | 4 | Session screen, ramp sets, calibration, rest timer, draft safety, swaps, rotation, recovery guidance cards | A full Workout A is logged offline and syncs later |
| E. History and polish | 5 | Exercise history, settings, export, deload controls, PWA manifest and service worker | Spec Section 11 acceptance criteria all pass |

Phase C can start in parallel with A and B, since the engine has no dependencies.

**Status (2026-09-29):** Phase 0 and Phase A are built and deployed as `strength-prod` at `https://strength.logbook.me` (section 13). The owner confirmed a sign-in, a test event, and a sync round trip; cold-start timings and the installed home-screen check were not recorded. Phases B to E are not started.

## 10. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Login in an iOS standalone PWA | In-page PIN form, no redirects; Phase A tests it on the phone |
| Offsets change at daylight saving, so string order of `ts` is wrong for about an hour each fall | Order by instant (`compareTs`); the offset is always explicit |
| A 6-digit PIN is guessable | Cognito lockout; single-user test data; revisit before wider use (section 12) |
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
- The v0.2 viewer stays on GitHub Pages, frozen; v1 is built in `app/` on S3 + CloudFront.
- Cognito User Pool only, one permanent 6-digit PIN, no MFA, no Identity Pool.
- One stack (`strength-prod`); no dev stack for now.
- The v1 site is served at `https://strength.logbook.me` (CloudFront alias, DNS at GoDaddy, ACM certificate in `us-east-1`).
- All dates and times are US Pacific (`America/Los_Angeles`) with explicit offsets, including the month of each event file.
- The exercise catalog is fixed; no custom exercise events.

## 12. Open decisions
1. **Stronger sign-in later:** replace the 6-digit PIN with a longer password or passkey before the app holds anything beyond personal test data or is shared with anyone else.
2. **Google/Apple sign-in later:** only if the PIN form becomes a nuisance. It would need a hosted-UI redirect (test on the installed iPhone app first), a way to keep unknown Google accounts out, and a fixed data owner instead of one prefix per `sub`.

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

**Client (Phase A spike).** Sign-in and refresh use `fetch` (`auth.js`); the refresh token is in `localStorage`, the ID token in memory. Sync saves the cursor only after the returned events are stored locally. The spike keeps events in `localStorage` as a cache; Phase B replaces that with IndexedDB and the outbox. `ids.js` makes ULIDs and hybrid-clock `ts` values that the server accepts.
