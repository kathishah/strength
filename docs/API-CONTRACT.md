# Sync API contract

**Status:** Current as of October 2026. This is the wire contract between the app's sync code (`app/js/store/`) and a backend. The reference backend is `lambda/events/` on AWS. It replaces sections 2 to 4 and 13 of the [archived deployment plan](../archive/DEPLOYMENT-PLAN-history.md), which stay there as history only. When this file and the code disagree, the code wins: `lambda/events/registry.mjs` is the source of truth for event validation, and `test/events-api.test.mjs` is the executable form of everything below.

Read this first if you are building a backend for another platform ([PORTING.md](PORTING.md)).

## 1. Overview

The backend stores one append-only event log per user and exposes two routes:

| Route | Purpose |
|---|---|
| `POST /events` | Append a batch of events. Idempotent by event `id`. |
| `GET /events?since=<cursor>&limit=<n>` | Read events after a cursor, oldest first. |

Nothing else is exposed. There is no update or delete route: an edit is a new event on the same `entityId`, and a delete is a tombstone event (`entity.deleted`), both sent through `POST /events`. The app is local first: every action is written to the browser's own event log and an outbox, and a background sync pushes the outbox and pulls new events. Logging never waits for the network.

All bodies are JSON (`application/json`). Responses carry `cache-control: no-store`.

## 2. Authentication contract

- Every request carries `Authorization: Bearer <ID token>`, a JWT from the identity provider.
- **The backend must verify the token** (signature, issuer, audience, expiry) before the handler logic runs, and pass the token's `sub` claim to it. The reference Lambda contains no verification code: API Gateway's JWT authorizer does it and the handler reads `requestContext.authorizer.jwt.claims.sub`. A port that skips verification serves anyone who can forge a token.
- **One owner per deployment.** The handler compares `sub` with the `OWNER_SUB` setting and answers `403` to any other user, and to everyone when `OWNER_SUB` is unset. Treat this as defence in depth, not as the check that replaces verification.
- On `401` the client refreshes its token once and retries the request once.
- CORS: allow only the site's own origin, the headers `Authorization` and `Content-Type`, and the methods `GET`, `POST` and `OPTIONS`. The reference stack sets `MaxAge` to 3600.
- Throttling lives outside the handler in the reference stack (10 requests per second, burst 20, set on the HTTP API). A throttled request is a `429` the handler never sees; the client retries `429`.

How the client signs in is a separate contract (section 8).

## 3. Errors

Every error the handler produces has the shape `{ "error": "<code>", "message": "<text>" }`, plus `errors` for validation failures.

| Status | `error` | When |
|---|---|---|
| 400 | `bad_json` | The body is not JSON. |
| 400 | `validation` | The batch is invalid. Nothing was stored. `errors` lists up to 100 entries of `{ index, id?, field, reason }`. |
| 400 | `bad_cursor` | `since` is not `<yyyy-mm>:<index>`. |
| 400 | `bad_limit` | `limit` is not a positive integer. |
| 401 | `unauthorized` | No `sub` reached the handler. |
| 403 | `forbidden` | `sub` is not the owner. |
| 404 | `not_found` | Any other path or method. |
| 413 | `too_large` | The request body is over 256 KB. |
| 500 | `internal` | Anything unexpected. The handler logs the error, never the request body (it is health data). |
| 503 | `busy` | Concurrent writers won six attempts in a row. Sent with `retry-after: 1`; the client retries later. |

The client treats a request that never reached the server (status 0), `408`, `429` and every `5xx` as retryable and backs off (5 s, 15 s, 45 s, 2 min, 5 min). Other statuses are shown to the user.

## 4. `POST /events`

Request:

```json
{
  "deviceId": "d_7f3a",
  "events": [
    { "id": "01J9Z...ULID", "ts": "2026-09-30T17:42:11.120-07:00-0003-d_7f3a",
      "v": 1, "type": "set.logged", "entityId": "s_01J9...",
      "payload": { "sessionId": "...", "exerciseId": "goblet-squat", "setNumber": 1,
                   "weightLbs": 25, "reps": 12 } }
  ]
}
```

Response `200`: `{ "accepted": 1, "duplicates": 0 }`.

- **Idempotent by `id`.** An event whose `id` is already stored counts as a duplicate, not an error, so the client can resend its whole outbox safely. A batch of only duplicates writes nothing.
- **All or nothing validation.** One bad event rejects the whole batch with `400`. Limits: 1 to 200 events and 256 KB per request, a known `type` and `v`, a ULID `id`, the required payload fields for the type, value ranges, a `ts` that is not more than one day in the future, and no unknown payload fields (a new field or type is a registry change, plus a new `v` if the meaning changes). The exact rules are in `lambda/events/registry.mjs`.
- **`recvAt`.** The server stamps every stored event with `recvAt`, the server time in US Pacific time with an explicit offset (for example `2026-09-29T12:30:00.123-07:00`). Clients never send it. Its `yyyy-mm` decides which month file the event goes into (section 7).
- **No cursor in the response.** Only `GET /events` moves a client's sync position, so one device can never skip events another device wrote.

## 5. `GET /events`

Response `200`:

```json
{ "events": [ { "...": "as stored, including recvAt" } ], "cursor": "2026-10:37", "more": false }
```

- **The cursor is a position, not a timestamp.** Format `<yyyy-mm>:<index>`: "in that month's file, everything from this index on, plus every later month's file from the start". Because files are only ever appended to, positions are unique and stable, with no timestamp ties.
- With no `since`, the backend returns everything from the first month file. With a cursor, it returns that month's file from the index, then later months. If nothing is new it returns `events: []` and the same cursor; with no events at all the cursor is `null`.
- `limit` defaults to 2,000 and is capped at 5,000. When more remain, `more` is `true` and the cursor points just past the last event returned, so the client asks again immediately. Pages never skip or repeat events. (The app asks for 500 at a time.)
- The client saves the returned cursor only after it has stored the returned events, and it de-duplicates by event `id` (section 8).
- The first sync when the app opens doubles as the Lambda warm-up. There is no separate ping.

## 6. The event envelope and ordering

Every stored event is `{ id, ts, v, type, entityId, payload, recvAt }`.

- `id` is a ULID. `entityId` is only pattern-checked by the server.
- `ts` is a hybrid logical clock: `<ISO time with Z or +/-hh:mm offset>-<counter>-<deviceId>`. It decides replay order. The app writes US Pacific offsets, and offsets change with daylight saving, so **compare `ts` values by instant, never as plain strings** (`compareTs` in `lambda/events/registry.mjs`, `tsMs` in `app/js/time.js`).
- All dates and times in the product are US Pacific time (`America/Los_Angeles`), including the month boundary of the event files. This is fixed product scope, not configuration.
- State is derived by replaying the events sorted by `ts`. Reducers are field-level: each event carries a patch and the last `ts` wins per field. The server never interprets payloads beyond validation. Event types, payload shapes and reducers are specified in [SPEC-strength.md](SPEC-strength.md) (sections 6.7 and 8) and implemented in `app/js/store/replay.js`.

## 7. Storage contract

The reference backend reaches storage only through the `ObjectStore` interface in `lambda/events/object-store.mjs`:

```
get(key)             -> { body: string, etag: string } | null      null when the key does not exist
put(key, body, cond) -> { etag: string }
    cond = { ifNoneMatch: '*' }   create only; fails 412 if the key exists
    cond = { ifMatch: etag }      replace only; fails 412 on ETag mismatch, 404 if the key is missing
    either may also fail 409 when a concurrent conditional write is in flight
list(prefix)         -> string[]                                    all keys under prefix, any order
```

A failed condition throws `StoreError` with `status` 404, 409 or 412. Anything else propagates as an ordinary error and becomes a `500`.

**Layout.** One JSON array per user per month: `u/<sub>/events/<yyyy-mm>.json`. The month is the **Pacific-time month in which the event was received** (`recvAt`), not the month in `ts`. An offline workout from September uploaded in October lands in October's file, where every device syncing from an October cursor finds it. Months roll over at Pacific midnight, not UTC midnight.

**Append algorithm** (this is what makes concurrent devices safe):

1. `get` the current month file. If it exists, note its ETag; if not, the array is empty.
2. Skip events whose `id` is already in the array; append the rest, stamped with `recvAt`.
3. If nothing is new, return without writing.
4. `put` with `ifNoneMatch: '*'` when the file did not exist, or `ifMatch: <etag>` when it did.
5. On a `StoreError` (404, 409 or 412), start over from step 1. After the first attempt, retry up to 5 times with a short random delay (25 to 100 ms), then answer `503`.

A store therefore needs **compare-and-swap on a single key**: conditional create and conditional replace. Plain key-value stores without conditional writes do not meet the contract, because two devices posting at once would lose events. S3 and Cloudflare R2 support conditional puts. Check the current documentation for any other store before relying on it.

A reusable test for a store lives in `test-support/object-store-contract.mjs` (see [PORTING.md](PORTING.md)).

## 8. Client side of the contract

The sync code calls two functions and nothing else on the network (`app/js/store/api.js`):

- `postEvents(deviceId, events)` and `getEvents({ since, limit })`, each resolving to `{ data, ms }`, rejecting with `ApiError(status, body)`; status 0 means the server was never reached.
- `app/js/store/auth.js` exports `signIn(email, password)`, `signOut()`, `getIdToken({ force })` and `hasRefreshToken()`. The shipped implementation talks to Amazon Cognito with plain `fetch` (`InitiateAuth` with `USER_PASSWORD_AUTH`, then `REFRESH_TOKEN_AUTH`). The ID token stays in memory and only the refresh token is kept in `localStorage`. The sign-in form accepts a 6-digit PIN, which is Cognito's shortest possible password; that rule is in `app/js/ui/auth-screen.js` and `app/index.html`, not in the auth module.
- `app/js/config.js` holds `region`, `userPoolClientId` and `apiUrl`. The app runs in synced mode only when all three are non-empty; otherwise it is local-only. `scripts/deploy-app.sh` writes them from the stack outputs through `scripts/stack-config.mjs`.
- **Clients must de-duplicate by event `id`.** Known gap: the backend detects duplicates only inside the current month's file, so a retry after a lost acknowledgment that crosses Pacific midnight on the 1st can store the same event in two month files. Replay is unaffected because the client de-duplicates, and `test/merge.test.mjs` pins this behavior. A backend may also check the previous month's file on `POST` to close the gap.

## 9. Where things live

| Piece | File |
|---|---|
| Routing, cursor, append algorithm, HTTP encoding | `lambda/events/index.mjs` |
| Event types and validation | `lambda/events/registry.mjs` |
| Storage interface and the S3 implementation | `lambda/events/object-store.mjs` |
| Pacific-time helpers | `lambda/events/time.mjs` |
| In-memory store used by the tests | `test-support/fake-s3.mjs` |
| Executable form of this contract | `test/events-api.test.mjs`, `test/fake-s3.test.mjs`, `test/registry.test.mjs` |
| Client network code | `app/js/store/api.js`, `auth.js`, `sync.js`, `outbox.js` |
