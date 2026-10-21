# Deployment architecture

The current app is a static PWA in `app/`, served from an S3 bucket through CloudFront. The root `index.html` redirects visitors to the hosted app. The frontend uses plain ES modules without a build step.

Sign-in uses an Amazon Cognito user pool. Authenticated requests go to an API Gateway HTTP API with a JWT authorizer, then to the Node.js Lambda in `lambda/events/`. The Lambda stores the append-only event log in a private, versioned S3 bucket. The client keeps a local IndexedDB event log and syncs through an outbox, so workout logging can continue offline.

`infra/template.yaml` defines the AWS stack. See [BUILD.md](BUILD.md) for prerequisites and current build, deploy, and local-preview commands. The exercise images are third-party media listed in `scripts/image-sources.json`; download them with `node scripts/fetch-images.mjs` before a full local preview or deployment. The former detailed implementation plan is preserved in `archive/DEPLOYMENT-PLAN-history.md` for historical context.
