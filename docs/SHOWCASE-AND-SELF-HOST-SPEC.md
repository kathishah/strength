# Showcase and self-hosting specification

**Status:** Implemented in spec v1.20: the landing page, interactive demo, local-only mode and self-hosting guide are in the repository. Section 9 is the delivery order that was followed, kept for reference. Section 8 stays the acceptance checklist for changes to these features, and its last item (record media rights before adding any media) is a standing rule.

**Purpose:** Make Strength Training Tracker easy to try as a project showcase and practical for another person to fork and run for themselves. The public demo is synthetic and isolated from the existing private deployment.

## 1. Product goals

1. Let a visitor understand the app and try its main workout logging and history flows without creating an account.
2. Keep the demo safe to publish: it contains fictional data and sends no workout or authentication requests to the production backend.
3. Let a person run a personal copy from a fork, first in a browser on one device and optionally with sync in their own AWS account.
4. Keep the existing private production account and its stored data separate from the public demo and all self-hosted copies.

## 2. Public project landing page

The repository's GitHub Pages site, `https://kathishah.github.io/strength/`, is the project landing page. It is served from the repository root's `index.html` on `main`. Before this work that file redirected to `strength.logbook.me`; it is now a responsive landing page. The page accompanies the code: it is the public entry point for the repository and for links from the project showcase website.

`strength.logbook.me` stays the project owner's private hosted copy and is unchanged by this work. Opening it shows the sign-in page when no one is signed in and the workout home page when someone is. The landing page does not redirect or link visitors to it as a demo.

It must include:

- A short description of Strength Training Tracker and what a visitor can try. It lives in the page metadata for search engines and link previews and is not displayed; the product name and screens carry the page.
- A clear **Demo** link, a **Fork on GitHub** link, and a **Self-host** link.
- A few representative screenshots or a short recording made with synthetic data.
- A concise architecture summary: static web app, local event log, and optional personal AWS sync stack.
- A visible note that demo data is fictional and the hosted private instance is separate.
- Links to the README, product spec, and self-hosting instructions.

The page must not show personal workout or health information, production credentials, or private account details. Avoid third-party analytics in the initial release.

### Chosen design: Gym Whiteboard

The landing page is designed as a gym's dry-erase board in an aluminium frame, written in marker. The reference implementation is `mockups/landing-whiteboard.html` on the `landing-mockups` branch, preserved by the tag `landing-mockups-2026-10`. That branch also holds two other directions, Motion Study and Loaded Bar, for reference only. `mockups/` is not merged to `main`, so none of the mockups are published on GitHub Pages.

**Banner.** The page opens with a banner across the top of the board: a thick printed bar along the top edge and the title **Strength Training Tracker** lettered in the board's marker font. There is no separate navigation bar, category line or tagline. Faint "ghost" writing from earlier workouts (for example "LEG DAY") shows through behind the banner and elsewhere on the board.

**Primary actions.** Two paper tags taped to the right side of the banner, stacked vertically and pinned close to the board's frame at every width:

- **Demo →** (red) opens the public demo. Until the demo is published, the tag reads **Demo · coming soon** and is not a link.
- **Host** with GitHub's fork icon opens the self-hosting guide, which starts with forking the repository.

The **Fork on GitHub** link is the GitHub marker in the footer tray.

The banner keeps about 140 px clear on its right for the tags. On desktop the title fits on one line; on tablets and phones it wraps, and the tags sit in the space beside the shorter lines. Each tag is at least 44 px tall.

**Hero.** Below the banner, four elements show what the app does, all with synthetic data:

1. **Today: Workout A**: the six Workout A lifts with their sets × reps, written in marker. A hand-drawn red circle marks the exercise the phone is showing, and finished lifts are crossed out as the preview moves on.
2. **Workout screen**: a phone held by magnets, showing the real workout card at actual app size. It rotates among the first three Workout A exercises with each exercise's image slot (see Media below), keeps the Options and TRX alternatives expanded, and scrolls slowly to show the weight and rep dials. On desktop a marker arrow points from the circled lift to this phone.
3. **Useful Loop**: a hand-drawn cycle (log it → see it → add 5 lb) with "Useful Loop" and "every session" at its centre. It replaces the separate loop section and needs no step text.
4. **History screen**: a second phone showing the exercise history for the same exercise (last increase, top-set chart with increases marked, past sessions), changing with the workout phone.

On desktop the list sits above the loop on the left, with both phones to the right. On tablets the list and the loop sit side by side above the two phones. On phones (720 px and narrower) the four elements become a horizontal swipe carousel in the order above, with snap scrolling, dots that can be tapped, and a handwritten label for the current slide.

**Lower sections.** "Three ways to run it" compares the public demo, local-only use and a personal AWS copy in a table drawn in marker. "How it's built" sketches the static app, the local event log, and the optional AWS stack drawn as a dashed cloud. The footer is the board's marker tray: the README, product spec, self-hosting guide and GitHub links are drawn as markers, and the tray holds the note that all numbers are fictional and that the private instance is separate.

**Visual system.** Permanent Marker for the title and headings, Kalam for handwritten text, and Atkinson Hyperlegible for running copy. The phone previews keep the app's system font and colours. In light mode the page is a white board; in dark mode it becomes a black glass board with bright markers. Motion respects `prefers-reduced-motion`.

**Decisions for the first release.**

- **Media:** an exercise listed in `DEMO_MEDIA` (`demo/media.js`) shows its original animation from `demo/media/<id>.gif`; every other image slot shows the app's built-in placeholder (`PLACEHOLDER_GIF` in `app/js/seed/catalog.js`). The page requests no third-party or `app/img/` image, so it looks the same on GitHub Pages and on a developer's machine. The three rotating lifts (goblet squat, dumbbell bench press, dumbbell Romanian deadlift) all have art.
- **Description:** "An open-source strength training tracker: log sets and reps on your phone, see how each lift moves, and start every session from your own numbers." It is not shown on the page. It goes in the `<meta name="description">` tag (the snippet under the title in search results), the Open Graph and Twitter card description (shared-link previews), and JSON-LD `SoftwareApplication` structured data. It is not hidden text in the page body.
- **Fonts:** served from the site itself rather than Google Fonts, so the page makes no third-party requests. Kalam and Atkinson Hyperlegible use the SIL Open Font License; Permanent Marker uses the Apache License 2.0. Each license text ships beside the font files in `landing/fonts/`.
- **Page metadata:** the title is **Strength Training Tracker**, with a canonical URL and a favicon.
- **Link-preview image:** a 1200×630 screenshot of the page's hero: the marker banner with its taped tags, the Today list with the red circle, and the two phones, showing the demo's exercise animations and synthetic data. Regenerate it whenever the hero changes.
- **Files:** the root `index.html`, plus a `landing/` folder for the page's script and styles (including the phone preview, which the demo can reuse later), self-hosted fonts and the preview image.

**Before launch.**

- Publish the self-hosting guide; the Host tag links to it.
- Point the README, product spec and GitHub markers at their files in the repository.
- Tag the `landing-mockups` branch as `landing-mockups-2026-10`, and leave `mockups/` out of the merge to `main`.
- Make sure the GitHub Pages build succeeds with the landing page's files.

## 3. Interactive demo

Publish a no-login demo at a stable public URL linked from the landing page. It should use the same core screens and logging logic as the app where practical, with an isolated demo entry point and fixture data.

### App modes (shared by the demo and local-only use)

The app runs in one of three modes. All three use the same screens, logging actions, engine and event log; they differ only in where events are stored and whether anything goes over the network.

| Mode | Entry point | Chosen when | Local storage | Network |
|---|---|---|---|---|
| **Synced** | `app/index.html` | The sync settings in the app config are complete | IndexedDB `strength`; `localStorage` keys `strength.*` (unchanged from today) | Cognito and the events API, as today |
| **Local only** | `app/index.html` | The sync settings are missing or incomplete | Same as synced: IndexedDB `strength`, keys `strength.*` | None |
| **Demo** | `demo/index.html` | Always, for that entry point | IndexedDB `strength-demo`; keys `strength-demo.*` | None |

- **Startup.** Today's `app/js/main.js` becomes a shared `startApp({ mode })` in `app/js/boot.js`. `main.js` calls it with `synced` or `local` depending on `isConfigured()`, replacing today's "Not configured yet" message. The demo's entry script calls it with `demo`.
- **No network outside synced mode.** `store/auth.js`, `store/api.js` and `store/sync.js` are loaded with a dynamic `import()` only in synced mode, so local-only and demo pages never load the code that talks to Cognito or the API. The sign-in screen, the sign-out button and the sync panel exist only in synced mode.
- **Storage names.** `startApp` passes a storage profile (`{ dbName, keyPrefix }`) to `openStorage`, `getDeviceId` and `createDraftStore`, which today hard-code `strength` and `strength.`. The refresh-token key is used only by `store/auth.js`, so local-only and demo pages never read it. The theme preference (`strengthTheme`) is shared, since it is a display choice, not data.
- **Moving from local only to synced.** Browser storage belongs to one site address, so how local workouts reach a new stack depends on where the synced app runs:
  - **Usual case, a different address.** Local-only use is typically at `localhost` or the fork's GitHub Pages, and a new stack serves the app at its CloudFront address or a custom domain. The new site cannot see the old site's storage. The owner exports a backup from local-only Settings and uploads it to the new stack with `scripts/post-events.mjs` (section 5).
  - **Same address.** Local-only and synced use the same storage, so events logged locally stay in the upload queue. When sync settings are added at that address, the sign-in screen says how many events are waiting, and they upload on first sign-in.
- **The demo cannot reach real data.** The demo is served from GitHub Pages, a different origin from any synced deployment. It also uses its own storage names, so a reset or a fixture write cannot touch `strength` or `strength.*` even on the same origin.

### Behavior

- Start with a fictional user and a small, realistic event history that demonstrates Home, exercise history, completed sessions, and progression suggestions.
- Let visitors interact with the workout UI in a sandbox so they can tick exercises, edit values, and explore history.
- Provide a prominent **Reset demo** action that restores the original sample state.
- Keep demo changes local to that browser and demo namespace. They are disposable and are never uploaded.
- Do not require email, password, PIN, Cognito, or an AWS account.

### Isolation and privacy

- The demo entry point must not call the production API, Cognito, or any user-data endpoint.
- Do not reuse the production refresh-token key, local database, drafts, or device/account identifiers for demo state.
- Use only fictional sample data. Do not copy real user events, health measurements, credentials, or identifiers into fixtures, screenshots, logs, or demo assets.
- Do not collect analytics or transmit demo interaction data in the initial release.
- Label the app clearly as a demo and explain that reset clears the sandbox.

### Fallback behavior

The demo must remain usable if exercise media is unavailable. Each image slot needs a local fallback, and the demo must not fail to load because a third-party media host is offline.

### Demo design

**Location.** `https://kathishah.github.io/strength/demo/`, served by GitHub Pages from a top-level `demo/` folder with `index.html` and a small entry script. It loads `../app/css/app.css` and `../app/js/boot.js`, so it runs the same code as the app. `demo/` is outside `app/`, so `scripts/deploy-app.sh` never uploads it to a synced deployment. The demo has no web app manifest and registers no service worker; it is not meant to be installed or used offline.

**Sample history.** On first open, and after each reset, the demo writes a fixture into its own storage: four weeks of the A/B/C rotation for a fictional lifter, three sessions a week, 12 finished sessions in all. The dates are counted back from the day the demo is opened, so the history always looks recent; the last session is the day before. The history is made by running the real logging actions with a fixed clock and seeded random numbers, so every event is valid and the same start date always gives the same events. It includes:

- at least two exercises with an increase marked on their history chart;
- one exercise whose scheduled increase is due in today's workout, so its card shows the increase note;
- one finished session that used an alternative exercise;
- one finished session with an exercise left unticked, so History by date shows its "missing" tag.

Today's workout is the next one in the rotation, with nothing logged yet.

**Demo label and reset.** A strip above the app header on every screen reads "Demo · a fictional lifter · changes stay in this browser" and holds a **Reset demo** button. Reset uses the app's two-tap armed button (`armedIconButton`): the first tap shows "Tap again to reset", the second deletes the `strength-demo` database and `strength-demo.*` keys, rebuilds the fixture, and reloads the page. The header's save chip reads "Demo" instead of a sync state. Settings shows a short explanation of the demo, the same Reset button, and a link back to the landing page.

**Images.** The demo has its own exercise art: original animated GIFs (male and female musculature, worked muscles in red) in `demo/media/<exercise id>.gif`, listed in `DEMO_MEDIA` in `demo/media.js`, drawn for this project and released under the repository's MIT license. The page's copy of the catalog points each listed exercise at its file; every other image slot shows the app's placeholder (`PLACEHOLDER_GIF`) with a line under it, "No animation for this exercise in the demo. Get the full app", that links to the landing page's "three ways to run it" section (`markPlaceholders` in `demo/demo-ui.js`). Options and TRX lists stay complete; their small thumbnails show art or the placeholder without a line. No third-party image path or art credit appears. The list lives in `demo/media.js`, which the landing page's phone previews share. The files are outside `app/`, so the app's deploy and service worker never include them.

**Tests.**

- A static check: following the static `import` statements from the demo's entry script never reaches `store/auth.js`, `store/api.js` or `store/sync.js`.
- A boot test in demo mode with `fetch` replaced by a function that fails the test if called, through logging a set and resetting.
- Fixture tests: replaying the fixture gives 12 finished sessions, the increases, the alternative, the missing exercise and an increase due today, and the same start date always gives the same events.
- Storage tests: the demo writes only `strength-demo` and `strength-demo.*`, and reset leaves `strength` and `strength.*` untouched.

## 4. Personal use without cloud services

Provide a local-only mode for a fork owner who wants to use the app on one browser and device without configuring AWS.

- Workout events persist in that browser's IndexedDB.
- The app clearly indicates that local-only data does not sync to other devices.
- Local-only mode never attempts Cognito sign-in or API synchronization.
- Provide an in-app export of the local event data as JSON so the user can make a backup.
- Provide a way to clear local data, with a confirmation step.
- If browser storage is unavailable, explain that the session is temporary and data may be lost when the page closes.

The public demo and personal local-only mode must use separate storage namespaces so demo reset cannot delete personal workouts and personal sign-in state cannot enter the demo.

### Local-only design

**Turning it on.** Local-only mode needs no setting: the app uses it whenever the sync settings in its config are missing or incomplete (see App modes in section 3). A fresh fork therefore opens straight into local-only mode once the checked-in config holds no deployment values, which section 5 already requires. Until that section 5 change lands, the checked-in `app/js/config.js` still holds the project owner's values, so a fork opens in synced mode.

**What the person sees.**

- No sign-in screen. The app opens on the workout home page.
- The header's save chip reads "On this device" instead of a sync state. Opening the header panel shows "Saved in this browser only. Not synced to other devices."
- The first time the app opens in local-only mode, Home shows a one-time note: "Your workouts are saved in this browser only. Export a backup from Settings." Dismissing it sets `strength.localNoticeSeen`.
- If IndexedDB is unavailable (the memory fallback in `store/open.js`, where `persistent` is false), a notice stays at the top of every screen: "This browser isn't saving your workouts. They will be lost when you close the page. Export a backup before you leave."
- No sign-out button.

**Settings.** In local-only mode, Settings replaces the sync panel with:

- **Storage:** whether data is saved on this device, and how many events and finished workouts it holds.
- **Export backup:** downloads `strength-events-<date>.json` in the same format as `scripts/export-data.mjs` (`{ exportedAt, count, events }`), using the browser's file download. There is no in-app import in this release.
- **Clear data on this device:** a two-tap armed button whose first tap reads "Tap again to delete all workouts on this device. Export first if you want a copy." The second tap deletes the `strength` database and the `strength.*` keys (the theme preference stays) and reloads into an empty app.

**Moving to AWS.** Settings shows one line under Export: "Moving to your own AWS deployment? Export a backup, then upload it with `scripts/post-events.mjs` (see the self-hosting guide)." The exported file is the input that script expects.

**Tests.**

- A boot test in local-only mode with `fetch` replaced by a function that fails the test if called, through logging and finishing a workout.
- The exported file replays to the same state as the live event log, and matches the `scripts/export-data.mjs` format.
- Clear needs two taps, removes the events and `strength.*` keys, and keeps `strengthTheme`.
- Events logged in local-only mode stay in the upload queue, and a later synced boot at the same address reports them as waiting.

**Product spec changes when this ships.** Section 6.7 of `docs/SPEC-strength.md` describes Settings as sync only and export as a script. When local-only mode ships, add a changelog entry and amend 6.7: synced mode is unchanged, local-only Settings has Storage, Export backup and Clear, and demo Settings has Reset.

## 5. Optional AWS sync for a self-hosted copy

A fork owner may deploy a private, single-user copy into their own AWS account. The first self-hosting release remains single-user per stack; it does not create a shared multi-user service.

### Requirements

- Preserve the current architecture: static PWA, Cognito user pool, API Gateway HTTP API, Lambda, and private S3 event storage.
- Keep event storage isolated to the self-hosted user's Cognito `sub`, using the existing `u/<sub>/events/` layout and JWT claims. Never use the public demo or production stack for a fork's workout data.
- Keep the current admin-created owner model for a personal stack; no public signup service is part of self-hosting.
- Make the custom domain optional. A fresh deployment should work at the CloudFront-generated domain; custom domain and certificate configuration can be documented as an optional setup.
- Replace the manual edits to `app/js/config.js` with a repeatable setup step that reads stack outputs and writes a local, git-ignored deployment config. The checked-in defaults must not point to the project owner's production API.
- Make the stack name, AWS region, and AWS profile explicit inputs. Deployment and cleanup commands must target only that fork owner's named stack.
- Document AWS resources created, account permissions required, image prerequisites, expected operational costs at a high level, backup/export, and stack teardown. Retain or export user data before destructive teardown.
- Keep image deployment failure-safe: the deploy never downloads images, a missing local image folder never deletes the remote images, and dry-run must not download or upload files.

### Setup experience

The quick-start should let a technically comfortable user:

1. Fork and clone the repo.
2. Install documented prerequisites.
3. Choose local-only mode or AWS sync mode.
4. For AWS mode, build and deploy a uniquely named stack with one documented command or short guided sequence.
5. Create the owner account, configure the app from stack outputs, and open the returned site URL.
6. Verify that a sample workout syncs and that only their own stack contains their data.

A custom domain must not be required to complete these steps.

### Self-hosting design

**Deployment settings file.** Every AWS script reads one file, `private/deploy.env`. The `private/` folder is git-ignored, so each person's copy names their own deployment: the repository's scripts and docs stay generic, and whoever's `private/deploy.env` is present decides which stack a command acts on. No script has built-in defaults for a stack, region or domain, and every script stops with a clear message if `private/deploy.env` is missing or incomplete. Bucket names and the distribution ID are never stored; scripts read them from the stack's outputs each time.

| Variable | Required | Set by |
|---|---|---|
| `STACK` | yes | `init-deploy.sh` |
| `AWS_REGION` | yes | `init-deploy.sh` |
| `AWS_PROFILE` | no (empty uses the default credentials) | `init-deploy.sh` |
| `DOMAIN` | no (empty means the CloudFront address) | `init-deploy.sh` |
| `CERT_ARN` | only with `DOMAIN` | `init-deploy.sh` (looked up in ACM, us-east-1) |
| `OWNER_SUB` | after `create-owner.sh` | `create-owner.sh` |

`scripts/aws-env.sh` sources `private/deploy.env` and adds the stack outputs: `SITE_BUCKET`, `DIST_ID`, `SITE_URL`, `API_URL`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID` and `DATA_BUCKET`. The Node scripts that call the API (`export-data.mjs`, `post-events.mjs`) read the same values through a small `scripts/stack-config.mjs`, instead of importing `app/js/config.js`.

**Setup commands.** Four scripts, each safe to rerun on its own and used again for later updates:

1. `scripts/init-deploy.sh` asks for the stack name (it suggests `strength-<your name>`), region, AWS profile, and an optional custom domain. If a domain is given, it finds an issued ACM certificate for it in us-east-1 or explains how to request one. It writes `private/deploy.env`, showing the file and asking before it overwrites an existing one.
2. `scripts/deploy-stack.sh` runs `npm ci` for the Lambda, then `sam validate`, `sam build` and `sam deploy`, always passing every parameter from `private/deploy.env`, so an update can never drop the domain or `OwnerSub` by leaving them out. It shows the change set before applying it.
3. `scripts/create-owner.sh <email>` creates the single Cognito user with self-signup off, asks for the 6-digit PIN without echoing it, makes the password permanent, writes the user's `sub` to `private/deploy.env` as `OWNER_SUB`, and reruns `deploy-stack.sh`. Until then the Lambda answers 403 to every request, as it does today.
4. `scripts/deploy-app.sh` runs the tests, copies `app/` into a git-ignored staging folder (`.deploy/site/`), writes `js/config.js` there from the stack outputs, uploads the staged copy, and refreshes CloudFront. It prints `SITE_URL` at the end.

**App config written at deploy time.** The checked-in `app/js/config.js` holds no deployment values, so a fork, a local preview and the GitHub Pages copy all open in local-only mode (section 4). Only the staged copy uploaded by `deploy-app.sh` contains a deployment's values, taken from its own stack outputs every time, so a deployment can never ship another stack's config. The app code and the service worker's file list are unchanged.

**Stack template changes** (`infra/template.yaml`):

- `DomainName` and `CertificateArn` default to empty. The condition `HasDomain` is true when `DomainName` is set, and a template rule requires `CertificateArn` whenever `DomainName` is set.
- The CloudFront distribution uses the domain alias and ACM certificate only under `HasDomain`; otherwise it uses CloudFront's own certificate and address.
- The API's CORS origins always include `https://<CloudFront domain>`, plus `https://<DomainName>` under `HasDomain`. The distribution does not depend on the API, so the API can refer to the distribution's address in the same deploy; there is no second deploy for CORS.
- The `SiteUrl` output is the custom domain under `HasDomain`, otherwise the CloudFront address.
- The template description no longer mentions a single production stack or a particular DNS provider.
- Resource names already derive from the stack name, so several stacks can share one AWS account.

**Media.** The deploy never downloads images. Without `--include-images`, the images already uploaded to a stack are left untouched. With it, the stack's `img/` is made to match the local `app/img/`, including deletions; a missing local folder skips the image sync instead of deleting anything.

**Verifying isolation.** After signing in and logging a set, listing `s3://$DATA_BUCKET/u/` shows exactly one prefix, equal to `OWNER_SUB`. The guide gives the command.

**Backup and teardown.** `scripts/export-data.mjs <email>` exports from the stack named in `private/deploy.env`. `scripts/teardown.sh`:

1. shows the stack name, region and the resources it will delete, and asks you to type the stack name;
2. offers to run the export first;
3. empties the site bucket and deletes the stack;
4. lists the resources that remain: the data bucket and the user pool, which the template keeps when a stack is deleted. The guide explains how to delete them by hand, including emptying every version in the data bucket.

**Uploading a backup** (`scripts/post-events.mjs <file> <email>`). This moves local-only workouts to a new stack, and it also loads workouts written with `scripts/build-events.mjs`.

- It accepts any file with an `events` array, including the local-only export (`{ exportedAt, count, events }`) and the `build-events.mjs` output.
- It reads the API and Cognito settings from `private/deploy.env` and the stack outputs, and shows the stack name, `SITE_URL` and the event count before asking to send.
- It sends the events in batches of at most 200, the API's limit per request (`MAX_EVENTS_PER_REQUEST` in `lambda/events/registry.mjs`), in replay order, and reports progress and the accepted and duplicate counts after each batch.
- The API skips events it already has, so rerunning after a failure is safe. A failed batch stops the run with a message saying how many events were sent and that the same command can be rerun.
- It writes the `<file>.posted` marker only after every batch succeeds.
- Tests: a file of more than 200 events goes out in several batches with none over 200; a failure partway stops without writing the marker; a rerun sends the same events again and the server counts them as duplicates.

**Costs and permissions (for the guide).** The stack has no always-on servers: S3 storage, CloudFront transfer, Lambda and API calls, and Cognito sign-ins for one person are expected to stay within or near the AWS free tier, with no fixed monthly charge. The guide states this as an estimate and points to AWS pricing. Deploying needs permission to manage CloudFormation, S3, CloudFront, Cognito, API Gateway, Lambda, IAM roles (`CAPABILITY_IAM`) and CloudWatch Logs, plus ACM read access when a custom domain is used. The guide recommends an administrator profile for the first deploy, and lists these services for anyone writing a narrower policy. The repository does not ship a ready-made IAM policy, so there is nothing to keep in step with the template.

**Moving the project owner's stack to this setup.**

- Create `private/deploy.env` for `strength-prod`: `us-west-2`, `strength.logbook.me`, its certificate, and the current `OWNER_SUB`.
- Run `deploy-stack.sh` and check the change set. Expect only the template description and the extra CORS origin to change, with no resource replaced.
- Clear the deployment values from the checked-in `config.js` in the same change that adds staged deploys, then run `deploy-app.sh`.
- `create-owner.sh` replaces the git-ignored `private/create-user.sh`.
- Move the owner's personal notes from BUILD.md into `private/OPERATIONS.md` and retire BUILD.md (section 7).

**The `private/` folder.** It holds everything that belongs to one person's deployment and stays out of the public repository:

- `deploy.env`: the deployment settings above.
- `OPERATIONS.md`: the owner's own runbook, such as DNS records at their provider, how they load a past workout, and their backup routine.
- Workout files for `scripts/build-events.mjs` and `scripts/post-events.mjs`, and the `export/` folder written by `scripts/export-data.mjs`.

None of it is in git, so none of it is backed up or versioned by the repository. The guide tells owners to keep a copy elsewhere, such as a private repository, a password manager or cloud storage, especially of `deploy.env`.

## 6. Code and media reuse

Code licensing is resolved. The root [`LICENSE`](../LICENSE) applies the MIT License to original code and documentation, with ArjunTech LLC as the copyright holder. The README states that third-party images, trademarks, and external assets are excluded.

Media publication is resolved for the initial showcase/self-host release by excluding the current third-party image set and using local placeholders by default. The [media rights audit](MEDIA-RIGHTS-AUDIT.md) records the 58 URLs and findings. Do not treat source URLs or attribution as permission. If an asset is proposed for a public demo or distributable image pack later, obtain and record permission or a suitable license for that file first.

The copies of these images already uploaded to the project owner's private site (`strength.logbook.me`) stay for now; whether to remove them or seek permission is deferred, as the media rights audit notes.

## 7. Repository and documentation changes

The README and landing page must distinguish these three experiences:

1. **Public demo:** synthetic data, browser sandbox, no account, no server sync.
2. **Local-only personal use:** a user's own data in one browser, with local export and clear.
3. **AWS self-hosted personal copy:** that user's own AWS resources and optional cross-device sync.

Document that the existing `strength.logbook.me` instance is private and is not the public demo or a service for forks. Keep the detailed workout behavior in `docs/SPEC-strength.md`; put setup steps in a focused self-hosting guide.

### Self-hosting guide outline

The guide is `docs/SELF-HOSTING.md`, and it is what the landing page's **Host** tag opens. It is the only setup document; BUILD.md is retired when the guide is complete (section 9, step 4):

- Its generic content moves into the guide: the Lambda build and deploy steps go into guide section 4, and the Phase B, D and E manual checks become an optional full check in guide section 6.
- Its project-owner content moves into the owner's `private/OPERATIONS.md`: the `strength-prod` values, GoDaddy DNS for `logbook.me`, loading a workout from `private/`, and the export routine.
- Links to BUILD.md in the README, `DEPLOYMENT-PLAN.md`, `app/js/config.js`, `app/js/main.js`, `scripts/deploy-app.sh`, `scripts/export-data.mjs` and `scripts/post-events.mjs` point to the guide instead. Files under `archive/` keep their historical references.

1. **Pick how to run it.** The three experiences from this section, with one line each on where data lives and what setup it needs.
2. **Local only (no AWS).**
   - Fork and clone, then serve `app/` locally (`python3 -m http.server`) or publish your fork with GitHub Pages.
   - Data stays in that browser. Export a backup and clear data from Settings.
   - To move to AWS later: export a backup from Settings, deploy a stack (section 4 of the guide), then upload the backup with `node scripts/post-events.mjs <backup.json> <email>`. Workouts waiting in the browser upload by themselves only when the synced app runs at the same address as the local-only one.
3. **Before you deploy to AWS.**
   - Prerequisites: Node 22, AWS CLI v2, SAM CLI, and an AWS account with the permissions listed in section 5.
   - What gets created, and what it costs (the estimate from section 5).
   - Images are optional, with a link to the media rights audit.
4. **Deploy in four commands.** `init-deploy.sh`, `deploy-stack.sh`, `create-owner.sh <email>`, `deploy-app.sh`. For each: what it asks, what it changes, what success looks like, and that it is safe to rerun.
5. **Optional custom domain.** Request an ACM certificate in us-east-1 and validate it, rerun `init-deploy.sh` with the domain, rerun `deploy-stack.sh` and `deploy-app.sh`, then add a CNAME at your DNS provider pointing to the `CloudFrontDomain` output.
6. **Check it works.**
   - Sign in at `SITE_URL` and log a set.
   - Open the app on a second device and see the set arrive.
   - Run the isolation check: listing `s3://$DATA_BUCKET/u/` shows only your `OWNER_SUB`.
7. **Day to day.**
   - Update the app (`deploy-app.sh`) or the stack (`deploy-stack.sh`).
   - Export a backup (`export-data.mjs`), and keep a copy of `private/` outside the repository.
   - Reset a forgotten PIN.
   - Read the Lambda logs.
   - Install the app on a phone's home screen.
8. **Tear down.**
   - Run `teardown.sh`.
   - It keeps the data bucket and the user pool.
   - To delete those too, follow the manual steps, including emptying every object version.
9. **Troubleshooting.**
   - API calls from `localhost` are blocked by CORS by design.
   - Every request gets 403 until `create-owner.sh` has run.
   - A missing or incomplete `private/deploy.env` stops every script.
   - After a deploy, hard-reload or reopen the installed app to get the new files.

## 8. Acceptance criteria

### Landing page

- The repository's root page opens a project landing page rather than redirecting to the private sign-in page.
- The three primary paths (demo, source, self-host) are obvious and work on phone and desktop. Until the demo is published, the Demo tag reads "coming soon".
- All example images and copy use synthetic content.

### Demo

- A visitor can open the demo without signing in and explore the main screens.
- A visitor can make a sample workout edit, see it reflected in the demo, and reset the sandbox.
- Network inspection shows no requests from demo mode to Cognito or the production API.
- Demo state is separate from the normal app database, refresh token, drafts, and local account state.
- Missing media does not prevent the demo from working.

### Local-only mode

- A user can record and revisit workouts after a reload without configuring Cognito, AWS, or an API URL.
- The interface explains the single-browser storage boundary.
- Export produces a usable backup; clear requires confirmation.
- A local-only backup of more than 200 events uploads to a new stack with `scripts/post-events.mjs`, and the stack then replays to the same state as the local-only app.

### AWS self-hosting

- A clean fork can deploy without the project owner's AWS account, production endpoint, or custom domain.
- The setup writes deployment-specific config without committing it.
- A deployment failure before upload cannot delete the remote image set.
- Every AWS script stops when `private/deploy.env` is missing or incomplete, and none has a built-in stack, region or domain.
- A deploy without a custom domain serves the app at the CloudFront address with sign-in and sync working.
- Teardown requires typing the stack name, offers an export first, and keeps the data bucket and user pool.
- The README/self-host guide includes setup, verification, backup, and teardown steps.

### Release hygiene

- Tests cover demo isolation, no-auth behavior, local persistence/export/clear, and per-stack configuration where applicable.
- No real user workout data, health profile, credentials, or production refresh tokens appear in the demo or its fixtures.
- [x] MIT license is added for original code and documentation, and its scope is described in the README.
- [x] The initial public demo and default self-host package exclude the uncleared third-party images and use local placeholders. The [media rights audit](MEDIA-RIGHTS-AUDIT.md) records the source review.
- [ ] Before adding any media to a public demo or distributable image pack, record rights and attribution for each included asset.

## 9. Suggested delivery order

1. Replace the root redirect with the landing page. The Demo tag reads "coming soon". Publish a first version of `docs/SELF-HOSTING.md` with the page, since the Host tag links to it. That version has guide sections 1 and 3, and says the AWS setup currently follows BUILD.md and needs a custom domain until step 4 below. Each later step fills in its own guide section.
2. Build the app modes (section 3), then publish the synthetic interactive demo and turn the Demo tag into a link.
3. Add local-only personal use, including export and clear controls.
4. Make AWS self-hosting independent of the production domain, account, and config (section 5 design), move the project owner's stack to `private/deploy.env` and `private/OPERATIONS.md`, complete and validate the guide on a fresh test stack without a custom domain, and retire BUILD.md.
5. Feature the repo and demo from the project showcase site after the landing page, demo, and self-hosting guide are ready.

## 10. Existing public history

The public Git history was rewritten to remove the former personal profile and body-composition data. This changed commit IDs; existing clones and forks may still contain the old history and should be re-cloned or reset before contributing. Copies already made elsewhere cannot be removed by rewriting this repository.
