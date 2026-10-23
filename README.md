# Strength Training Tracker

An open-source strength training tracker. Log sets and reps on your phone, see how each lift moves, and start every session from your own numbers. The frontend is plain HTML, CSS and JavaScript modules; the optional sync backend uses AWS Cognito, API Gateway, Lambda and private S3 storage.

Project page: <https://kathishah.github.io/strength/>

## Three ways to use it

1. **Public demo.** A fictional lifter's data in a browser sandbox: no account, no server sync, nothing leaves your browser. Open the [demo](https://kathishah.github.io/strength/demo/); "Reset demo" restores the sample history.
2. **Local only.** Your own workouts in one browser on one device, with no AWS and no account. This is what the app does when no sync settings are configured, so a fresh fork opens this way. Settings has a JSON backup export and a confirmed "Clear data on this device".
3. **Your own AWS copy.** A private, single-user stack in your own AWS account, with sync between your devices. It needs no custom domain.

Setup for all three is in the [self-hosting guide](docs/SELF-HOSTING.md).

**The instance at `strength.logbook.me` is the project owner's private copy.** It is not the public demo and not a service for forks: it is not an open signup service, its workout data requires sign-in, and this repository contains no user data or credentials. Run your own copy instead.

## Local preview

Exercise images are third-party media and are not included. The app uses a built-in placeholder when local image files are absent. To preview the app in local-only mode:

```sh
python3 -m http.server 4173 --directory app
```

Then open <http://localhost:4173>. See [the media rights audit](docs/MEDIA-RIGHTS-AUDIT.md) before using the optional image downloader or deploying local media.

## Tests

Requires Node.js. Tests use Node's built-in test runner and have no root-level dependencies:

```sh
node --test
```

## Architecture

- `app/`: static progressive web app and workout logic. One local event log; it runs in local-only mode, or in synced mode when the deployed config holds sync settings.
- `demo/`: the public demo's entry page, sample history and its own exercise art (`demo/media/`), built on the same app code.
- `index.html`, `landing/`: the project landing page (GitHub Pages).
- `lambda/events/`: authenticated event API.
- `infra/template.yaml`: AWS SAM infrastructure.
- `scripts/`: AWS setup, deploy and teardown scripts, plus export, import and image utilities.
- `docs/SELF-HOSTING.md`: setup, deployment, backup and teardown.
- `docs/SPEC-strength.md`: product behavior and training-program specification.
- `docs/SHOWCASE-AND-SELF-HOST-SPEC.md`: design of the landing page, demo, local-only mode and self-hosting.
- `DEPLOYMENT-PLAN.md`: current high-level hosting and data-flow notes.
- `archive/`: retired prototype and completed planning records.

Per-deployment settings live in a git-ignored `private/` folder, so the repository's scripts and docs stay generic.

## License

The original code and documentation in this repository are licensed under the [MIT License](LICENSE). This license does not grant rights to third-party exercise images, trademarks, or other external assets; those remain subject to their respective rights holders and terms. Exercise media is skipped by default; see [the media rights audit](docs/MEDIA-RIGHTS-AUDIT.md). The landing page's fonts have their own licenses, in `landing/fonts/`.
