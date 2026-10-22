# Deployment architecture

The current app is a static PWA in `app/`, served from an S3 bucket through CloudFront. The root `index.html` currently redirects visitors to the hosted app; the showcase spec calls for replacing it with a public landing page. The frontend uses plain ES modules without a build step.

Sign-in uses an Amazon Cognito user pool. Authenticated requests go to an API Gateway HTTP API with a JWT authorizer, then to the Node.js Lambda in `lambda/events/`. The Lambda stores the append-only event log in a private, versioned S3 bucket. The client keeps a local IndexedDB event log and syncs through an outbox, so workout logging can continue offline.

`infra/template.yaml` defines the AWS stack. See [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) for prerequisites and the build, deploy, backup and teardown steps. Third-party exercise media is skipped by default; the app uses placeholders when local files are absent. Review [docs/MEDIA-RIGHTS-AUDIT.md](docs/MEDIA-RIGHTS-AUDIT.md) before downloading or deploying any image. The former detailed implementation plan is preserved in `archive/DEPLOYMENT-PLAN-history.md` for historical context.
