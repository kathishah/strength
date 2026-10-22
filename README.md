# Recomp Tracker

A mobile-first strength-training log for recording gym sessions, tracking exercise history, and getting simple next-session weight suggestions. The frontend is plain HTML, CSS, and JavaScript modules; the optional sync backend uses AWS Cognito, API Gateway, Lambda, and private S3 storage.

The hosted instance is a private, single-user demo. It is not an open signup service, and the source repo does not include any user data or credentials. Static app files may be publicly served, while workout data requires sign-in.

## Local preview

Exercise images are third-party media and are not included in the default preview. The app uses a built-in placeholder when local image files are absent. To preview the interface:

```sh
python3 -m http.server 4173 --directory app
```

Then open <http://localhost:4173>. API sign-in and sync are configured for the hosted origin, so a local preview is primarily for viewing the interface. See [the media rights audit](docs/MEDIA-RIGHTS-AUDIT.md) before using the optional image downloader or deploying local media.

## Tests

Requires Node.js. Tests use Node's built-in test runner and have no root-level dependencies:

```sh
node --test
```

## Architecture

- `app/` — static progressive web app and workout logic.
- `lambda/events/` — authenticated event API.
- `infra/template.yaml` — AWS SAM infrastructure.
- `scripts/` — deployment, image download, import, and export utilities.
- `docs/SPEC-strength.md` — product behavior and training-program specification.
- `BUILD.md` — build and deployment instructions.
- `DEPLOYMENT-PLAN.md` — current high-level hosting and data-flow notes.
- `archive/` — retired prototype and completed planning records.

For deployment prerequisites and operational steps, see [BUILD.md](BUILD.md). The deployment dry run does not download images or modify remote files.

## License

The original code and documentation in this repository are licensed under the [MIT License](LICENSE). This license does not grant rights to third-party exercise images, trademarks, or other external assets; those remain subject to their respective rights holders and terms. Exercise media is skipped by default; see [the media rights audit](docs/MEDIA-RIGHTS-AUDIT.md).
