# Strength Training Tracker

An open-source strength training tracker. Log sets and reps on your phone, see how each lift moves, and start every session from your own numbers. The frontend is plain HTML, CSS and JavaScript modules; the optional sync backend uses AWS Cognito, API Gateway, Lambda and private S3 storage.

Project page: <https://kathishah.github.io/strength/>

**Status and stance.** In use and maintained (last reviewed October 2026). A solo project shared for reuse: read it, fork it, self-host it, or port it to another platform. Issues are welcome; pull requests for fixes, docs and ports are welcome after an issue, and changes to the product itself belong in your fork ([CONTRIBUTING.md](CONTRIBUTING.md)). Report vulnerabilities privately ([SECURITY.md](SECURITY.md)). MIT licensed, no warranty.

## Three ways to use it

1. **Public demo.** A fictional lifter's data in a browser sandbox: no account, no server sync, nothing leaves your browser. Open the [demo](https://kathishah.github.io/strength/demo/); "Reset demo" restores the sample history.
2. **Local only.** Your own workouts in one browser on one device, with no AWS and no account. This is what the app does when no sync settings are configured, so a fresh fork opens this way. Settings has a JSON backup export and a confirmed "Clear data on this device".
3. **Your own AWS copy.** A private, single-user stack in your own AWS account, with sync between your devices. It needs no custom domain.

Setup for all three is in the [self-hosting guide](docs/SELF-HOSTING.md). Sync runs on AWS today; to run it on Vercel, Cloudflare or another platform, see the [porting guide](docs/PORTING.md).

## Limits

- One fixed training program (workouts A, B and C) and weights in pounds. Dates, program weeks and the monthly event files use US Pacific time. None of this is configurable.
- One user per deployment. Sign-in is an email and a 6-digit PIN, which is weak by design for a single-user app (see [SECURITY.md](SECURITY.md)).
- Sync needs an AWS account (the only supported backend). Local-only data lives in one browser on one device; there is no in-app import of a backup.
- Exercise images are not included because their rights are not cleared; the app shows a placeholder.

**The instance at `strength.logbook.me` is the project owner's private copy.** It is not the public demo and not a service for forks: it is not an open signup service, its workout data requires sign-in, and this repository contains no user data or credentials. Run your own copy instead.

## Local preview

The app's own exercise images (`app/img/`) are third-party media and are not included; the app uses a built-in placeholder when local image files are absent. The demo and the landing page use original animations in `demo/media/`. To preview the app in local-only mode:

```sh
python3 -m http.server 4173 --directory app
```

Then open <http://localhost:4173>. See [the media rights audit](docs/MEDIA-RIGHTS-AUDIT.md) before using the optional image downloader or deploying local media.

## Tests

Requires Node.js 22 (`.nvmrc`). Tests use Node's built-in test runner and have no root-level dependencies. They run offline, and CI runs the same command on every push:

```sh
node --test
```

## Architecture

- `app/`: static progressive web app and workout logic. One local event log; it runs in local-only mode, or in synced mode when the deployed config holds sync settings.
- `demo/`: the public demo's entry page, sample history and its own exercise art (`demo/media/`), built on the same app code.
- `index.html`, `landing/`: the project landing page (GitHub Pages).
- `lambda/events/`: authenticated event API. Its storage sits behind a small interface, so another store can be swapped in.
- `infra/template.yaml`: AWS SAM infrastructure.
- `scripts/`: AWS setup, deploy and teardown scripts, plus export, import and image utilities.
- `docs/SELF-HOSTING.md`: setup, deployment, backup and teardown.
- `docs/SPEC-strength.md`: product behavior and training-program specification.
- `docs/API-CONTRACT.md`: the sync API, auth and storage contracts between the app and a backend.
- `docs/PORTING.md` and `ports/`: how to run it on another platform, and where a port goes.
- `docs/SHOWCASE-AND-SELF-HOST-SPEC.md`: design of the landing page, demo, local-only mode and self-hosting.
- `DEPLOYMENT-PLAN.md`: current high-level hosting and data-flow notes.
- `CONTRIBUTING.md`, `SECURITY.md`: how to contribute, and how to report a vulnerability.
- `journal/`: dated log of issues, evaluations, plans and results (rules in `journal/README.md`).
- `archive/`: retired prototype and completed planning records.

Per-deployment settings live in a git-ignored `private/` folder, so the repository's scripts and docs stay generic.

## License

The original code and documentation in this repository are licensed under the [MIT License](LICENSE). This license does not grant rights to third-party exercise images, trademarks, or other external assets (the original animations in `demo/media/` are part of the MIT-licensed repository); those remain subject to their respective rights holders and terms. Exercise media is skipped by default; see [the media rights audit](docs/MEDIA-RIGHTS-AUDIT.md). The landing page's fonts have their own licenses, in `landing/fonts/`.
