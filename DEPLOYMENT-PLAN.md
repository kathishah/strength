# Deployment architecture

**Status:** Current (October 2026). The wire contract between the app and the backend is in [docs/API-CONTRACT.md](docs/API-CONTRACT.md); adding another deployment target is covered in [docs/PORTING.md](docs/PORTING.md).

The current app is a static PWA in `app/`, served from an S3 bucket through CloudFront. The root `index.html` is the public project landing page, served by GitHub Pages; it does not redirect to any deployment. `strength.logbook.me` is the project owner's private copy and is not part of what a fork deploys. The frontend uses plain ES modules without a build step.

Sign-in uses an Amazon Cognito user pool. Authenticated requests go to an API Gateway HTTP API with a JWT authorizer, then to the Node.js Lambda in `lambda/events/`. The Lambda stores the append-only event log in a private, versioned S3 bucket. The client keeps a local IndexedDB event log and syncs through an outbox, so workout logging can continue offline.

`infra/template.yaml` defines the AWS stack. See [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) for prerequisites and the build, deploy, backup and teardown steps. Third-party exercise media is skipped by default; the app uses placeholders when local files are absent. Review [docs/MEDIA-RIGHTS-AUDIT.md](docs/MEDIA-RIGHTS-AUDIT.md) before downloading or deploying any image. The former detailed implementation plan is preserved in `archive/DEPLOYMENT-PLAN-history.md` for historical context only; its API and data sections now live in [docs/API-CONTRACT.md](docs/API-CONTRACT.md).
