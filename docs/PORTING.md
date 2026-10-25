# Porting guide: running Strength on another platform

**Status:** Draft guide, October 2026. It was written from reading the code and its tests. **No port exists yet, and nothing here has been built or deployed on Vercel, Cloudflare or any other platform**, so treat the sketches as starting points, not as tested recipes. Corrections from people who try it are welcome (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

This guide is for you if you want to run Strength somewhere other than AWS: Vercel, Cloudflare, another cloud, or your own server. It says what you can reuse, what you must write, how to test it, and where to put it. The shipped deployment is AWS only (`infra/template.yaml`, [SELF-HOSTING.md](SELF-HOSTING.md)).

## 1. Do you need a port at all?

| You want | Port needed? |
|---|---|
| The app in one browser, no sync (local-only mode) | **No.** Serve the `app/` folder from any static host. With the empty `app/js/config.js` the app makes no network requests. |
| The public demo | **No.** Serve the repository root (or `demo/` plus `app/`, which it imports). Everything is static. |
| Sync between your devices | **Yes.** Sync needs a backend: an HTTP API, a store and sign-in. |

Static hosting on Vercel, Cloudflare Pages, Netlify or GitHub Pages should therefore work today with no code changes: no build command, output directory `app`. This has not been tried on those platforms. The AWS stack adds response headers that a static host will not: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` (see `SecurityHeadersPolicy` in `infra/template.yaml`). Add them in your host's header settings.

The rest of this guide is about the sync backend.

## Minimal checklist for a sync port

- [ ] A store that passes `objectStoreCases` (compare-and-swap on one key) - section 3.1
- [ ] An adapter that turns the platform request into the handler's event and the result into a response, answering at `/events` - section 3.2
- [ ] Token verification (signature, issuer, audience, expiry) before the handler, passing only the verified `sub` - section 3.3
- [ ] `OWNER_SUB` set to the owner's `sub` (the handler denies everyone while it is empty) - section 3.3
- [ ] Sign-in: Cognito kept (option A), or your own `auth.js` (option B) - section 3.3
- [ ] CORS for the site origin, or the API on the site's own origin; rate limiting; the security headers of section 1 - sections 1 and 3.2
- [ ] The three `config.js` values written at deploy time, `apiUrl` over `https` - section 3.4
- [ ] The data store private, with only the owner's prefix readable by the function, and versioning or backups - section 4
- [ ] `node --test` green; store contract green; an end-to-end check on the real platform - section 6
- [ ] A `ports/<provider>/README.md` with deploy, teardown, cost and the date last tested - section 8

## 2. What stays the same

A port should not touch these. They are the product, and the tests pin them.

- **The whole client**: screens, logging, the progression engine, replay, the outbox and sync (`app/`). It speaks only the HTTP contract below.
- **The event format and its validation** (`lambda/events/registry.mjs`).
- **The handler logic**: routing, validation, the append-with-retry algorithm, the cursor (`lambda/events/index.mjs`). It runs unchanged on any JavaScript runtime that gives it a request in the right shape and a store.
- **The tests**. `node --test` must stay green, and it is how a reviewer will check a port.

## 3. The contracts you implement

Four things differ per platform. The first two have clean interfaces; the last two do not yet (section 5).

### 3.1 Storage: the `ObjectStore` interface

Defined in `lambda/events/object-store.mjs`, specified in [API-CONTRACT.md](API-CONTRACT.md) section 7:

```
get(key) -> { body, etag } | null
put(key, body, { ifNoneMatch: '*' } | { ifMatch: etag }) -> { etag }     (throws StoreError 404/409/412 on a failed condition)
list(prefix) -> string[]
```

The one hard requirement is **compare-and-swap on a single key** (conditional create and conditional replace). Without it, two devices syncing at the same moment can lose events. A key-value store that only offers unconditional writes does not qualify.

- If your platform has an **S3-compatible bucket with conditional writes**, you may not need a new store at all: `createS3ObjectStore(bucket, { client })` accepts an `S3Client` you construct, including one with a custom `endpoint`. Confirm in the provider's current documentation that `If-Match` and `If-None-Match` on `PUT` are honoured, then run the contract suite (section 6).
- Otherwise implement the three methods on your store and run the same suite. Map a failed condition to a `StoreError` (import it from `object-store.mjs`).

### 3.2 The HTTP API

Two routes, `POST /events` and `GET /events`, with the bodies, status codes and error shapes in [API-CONTRACT.md](API-CONTRACT.md). The client needs nothing else.

The reference handler is `createHandler({ env, store, now, sleep, random })` in `lambda/events/index.mjs`. It takes an **API Gateway HTTP API v2 event** and returns `{ statusCode, headers, body }`. It reads only these fields:

| Input field | Meaning |
|---|---|
| `requestContext.authorizer.jwt.claims.sub` | the verified user id (see 3.3) |
| `requestContext.http.method` | `GET` or `POST` |
| `rawPath` | must equal `/events` (a trailing slash is ignored) |
| `queryStringParameters` | `since` and `limit` |
| `body`, `isBase64Encoded` | the request body |

So the smallest port is an **adapter**: turn the platform's request into that event, call the handler, turn the result into a platform response. Sketch only, not tested:

```js
// Illustrative. `verifyJwt` is yours (section 3.3). The handler is the repository's, unchanged.
import { createHandler } from '../../lambda/events/index.mjs';
const handle = createHandler({ env: { OWNER_SUB: ENV.OWNER_SUB }, store: myObjectStore });

export async function onRequest(request) {
  const claims = await verifyJwt(request.headers.get('authorization'));   // null when invalid
  const url = new URL(request.url);
  const res = await handle({
    requestContext: { authorizer: { jwt: { claims: claims ?? {} } }, http: { method: request.method } },
    rawPath: url.pathname,                 // must be "/events"
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: await request.text(),
    isBase64Encoded: false,
  });
  return new Response(res.body, { status: res.statusCode, headers: res.headers });
}
```

Things the adapter must also do, because the AWS stack does them outside the handler:

- **CORS**, if the API is on a different origin from the site: answer `OPTIONS` preflights and allow only your site's origin, the headers `Authorization` and `Content-Type`, and the methods `GET`, `POST`, `OPTIONS`. Serving the API on the same origin as the site (`apiUrl` equal to the site's origin) avoids CORS.
- **Path**: the client requests `new URL('/events', apiUrl)`, so the API must answer at `/events` on the root of `apiUrl`. If your platform puts functions under `/api`, rewrite the path before calling the handler, or serve `/events` through a rewrite rule.
- **Throttling**: the reference stack limits the API to 10 requests per second (burst 20). Use your platform's rate limiting.
- **Runtime**: `index.mjs` uses `Buffer` and, by default, `process.env`. On Cloudflare Workers that means the Node.js compatibility flag. Pass `env` explicitly as in the sketch.
- **Bundling**: `object-store.mjs` imports the AWS SDK lazily (only when `createS3ObjectStore` is used), but a bundler will still follow that import. Mark `@aws-sdk/client-s3` as external or exclude it if you do not use S3.

### 3.3 Authentication

Two halves, and only one is cleanly separated.

**Server half (required).** Verify the bearer token (signature, issuer, audience, expiry) **before** calling the handler, and pass only the verified `sub`. The reference Lambda has no verification code because API Gateway does it. Two traps follow from that:

- If your adapter does not verify the token and just decodes it, anyone can forge a `sub`. The handler's `OWNER_SUB` check is defence in depth and does not protect you.
- The handler answers `403` to everyone when `OWNER_SUB` is empty, which is the right default. Keep it.

**Client half (not yet pluggable).** The app signs in through `app/js/store/auth.js`, which is written for Amazon Cognito (`InitiateAuth` over `fetch`). The rest of the app uses only `signIn(email, password)`, `signOut()`, `getIdToken({ force })` and `hasRefreshToken()`. The sign-in form accepts exactly six digits (`app/js/ui/auth-screen.js`, `app/index.html`) because that is Cognito's shortest possible password. There is no setting to swap this module. That leaves two honest options:

| Option | What you do | Cost |
|---|---|---|
| **A. Keep Cognito for sign-in** | Create the Cognito user pool and app client in an AWS account (a small stack, or by hand). Host everything else on your platform, and verify Cognito's ID tokens with the pool's public keys (JWKS). Issuer: `https://cognito-idp.<region>.amazonaws.com/<pool id>`. Audience: the app client id. | No client changes. You still need an AWS account, but nothing else runs there. This is the smallest port. |
| **B. Replace the identity provider** | Provide your own `app/js/store/auth.js` with the same four exports, your own sign-in form rules, and a deploy step that copies them over the app files. Then set the three config keys (below) to something non-empty. | Real work, and it is not supported by an upstream hook today. Propose the seam first (section 7). |

### 3.4 Configuration

`app/js/config.js` has three keys: `region`, `userPoolClientId`, `apiUrl`. The app runs in synced mode only when all three are non-empty strings that do not start with `REPLACE_`; otherwise it is local-only. `scripts/deploy-app.sh` fills them in from CloudFormation outputs through `scripts/stack-config.mjs` (`injectSiteConfig` rewrites the `config` object and requires an `https://` `apiUrl`). Your deploy step must write the same three values. With option A they keep their Cognito meaning; with option B `region` and `userPoolClientId` are free-form placeholders.

## 4. What is specific to AWS today

These are the parts you replace, not reuse:

| AWS piece | Where | Your equivalent |
|---|---|---|
| S3 + CloudFront site, security headers | `infra/template.yaml` | Your static host and its header settings |
| API Gateway HTTP API (routing, CORS, throttling, JWT check) | `infra/template.yaml` | Your adapter (section 3.2) |
| Lambda packaging with esbuild | `infra/template.yaml`, `lambda/events/package.json` | Your function bundler |
| S3 data bucket (versioned, private, 90-day old-version expiry) | `infra/template.yaml` | Your store, with versioning or backups if you want them |
| Cognito user pool, one owner, self-signup off | `infra/template.yaml`, `scripts/create-owner.sh` | Your identity setup, with signup off and one owner |
| Deploy, teardown, config injection scripts | `scripts/*.sh`, `scripts/stack-config.mjs` | Your deploy tooling. Note the scripts have no per-provider layout yet |
| CLI import and export | `scripts/post-events.mjs`, `scripts/export-data.mjs`, `scripts/cognito.mjs` | They sign in to Cognito and read CloudFormation outputs. They work unchanged with option A; otherwise adapt `scripts/cognito.mjs` and `scripts/stack-config.mjs` |

## 5. Coupling that is not behind a seam

Be aware of these before you start. They are why a port is real work rather than a configuration change.

1. The handler mixes routing, the owner check and HTTP encoding, and expects the API Gateway v2 event shape. Adapters have to imitate that shape (section 3.2).
2. Token verification lives in API Gateway, not in code. A port must supply it.
3. Sign-in is Cognito-specific on the client and in the CLI scripts, and the 6-digit PIN rule leaks into the UI.
4. `config.js` requires `region`, `userPoolClientId` and `apiUrl`, all non-empty.
5. Infrastructure and deploy scripts are a flat, AWS-only setup with no per-target folder convention. This guide proposes one (section 8).
6. The time zone (US Pacific) and the single built-in program are product scope, not configuration. A port does not change them.

## 6. Testing a port

Do these in order. The first three need no cloud account.

1. **The existing suite stays green.** `node --test` from the repository root.
2. **Your store passes the ObjectStore contract.** `test-support/object-store-contract.mjs` exports `objectStoreCases`. Run it against your implementation the way `test/object-store-contract.test.mjs` runs it against the in-memory fake:

   ```js
   import { test } from 'node:test';
   import assert from 'node:assert/strict';
   import { objectStoreCases } from '../../../test-support/object-store-contract.mjs';

   for (const [name, run] of objectStoreCases) {
     test(name, () => run({ make: () => makeMyStore() }, assert));   // a store that is empty for these keys
   }
   ```

   Stores that talk to a real service should prefix every key with a fresh random string in `make()` so runs do not collide. Keep such tests out of the default `node --test` run (section 8).
3. **Your adapter passes the handler's behaviour.** `test/events-api.test.mjs` shows the pattern: build the handler with a store, send requests, check status codes and bodies. Repeat the cases that matter for your adapter (auth failures, a wrong path, a body over 256 KB, a cursor round trip) through your adapter function with a fake `verifyJwt`.
4. **End to end on the real platform**, adapted from [SELF-HOSTING.md](SELF-HOSTING.md) section 6: sign in, log a set, open a second device and see the set arrive, and check that a different user's token gets `403`. Then confirm that the stored objects are private and that the data of one `sub` is under its own prefix only.

## 7. Seam work upstream could do (not done, not promised)

These changes would make ports cheaper. They change shared code, so they are the owner's decision and each needs its own issue:

- Split `lambda/events/index.mjs` into a platform-neutral core (`handleEvents({ method, path, query, body, sub })`) and a thin API Gateway adapter.
- Give the client an auth module setting (a documented hook for `auth.js`) and move the PIN rule out of the shared UI.
- Make `config.js` validation per-target instead of requiring the three Cognito-shaped keys.

## 8. Where a port goes, and how to contribute one

**Directory convention.** One folder per target, under `ports/`:

```
ports/<provider>/
  README.md        what it deploys, status, last tested date, prerequisites, deploy and teardown commands, cost notes
  adapter/         the function or worker entry that wraps lambda/events (section 3.2)
  infra/           the provider's own configuration (wrangler.toml, vercel.json, Terraform, ...)
  scripts/         deploy, teardown and config-injection scripts
  tests/           *.test.mjs that need no cloud account and no installs (they run in the root `node --test`);
                   put anything that needs credentials or the provider's tooling in *.live.mjs files instead
```

`ports/README.md` lists existing ports, and `ports/_template/README.md` is a stub to copy. Do not edit files in `app/`, `lambda/events/`, `infra/` or `scripts/` as part of a port unless you must; if you must, put that change in its own commit and explain it.

The root `node --test` runs every `*.test.mjs` file in the repository, including yours. Keep `*.live.mjs` files out of any directory called `test`, because Node runs everything under such a directory.

**What upstream accepts.** This is the intended policy; the maintainer confirms it on the first port proposal.

- In scope: a self-contained `ports/<provider>/` folder that follows the layout above, passes `node --test` and the store contract, and documents deploy and teardown including cost and permission notes, as the AWS guide does.
- Marked as community-maintained and experimental, with the date and platform versions it was last tested on. The maintainer does not run your cloud account and cannot promise to keep a port working. A port that goes stale may be marked unmaintained or moved out.
- Out of scope upstream: changes to the product (the program, the progression rules, the time zone) and ports that weaken the security model (unverified tokens, public data stores, open signup). Those belong in your fork.
- You do not need permission to run a port in your own fork. Open an issue before sending one upstream so the scope can be agreed first.

**Steps.**

1. Fork, then read [API-CONTRACT.md](API-CONTRACT.md) and sections 2 to 5 above.
2. Open an issue titled `Port: <provider>` with the plan: which store, which identity option (3.3 A or B), which hosting.
3. Copy `ports/_template/` to `ports/<provider>/` and fill in the README first.
4. Implement the adapter and store; pass sections 6.1 to 6.3 offline; then run 6.4 on the real platform.
5. Open a pull request with the folder, the test results, and a line in `ports/README.md`.
