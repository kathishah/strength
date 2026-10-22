# Self-hosting guide

How to run your own copy of Strength Training Tracker. This is the page the **Host** tag on the [project landing page](https://kathishah.github.io/strength/) opens.

> **Status: first version.** This guide has sections 1 and 3 so far. The scripted AWS setup is not written yet, so for now **the AWS setup follows [BUILD.md](../BUILD.md) and needs a custom domain** (a hostname you control, plus a certificate for it). The missing sections are listed at the end, and each one is added when the work behind it lands. Nothing below describes a script that does not exist yet.

## 1. Pick how to run it

There are three ways to use the app. They keep their data apart from each other, and none of them uses the project owner's private instance at `strength.logbook.me`, which is not a demo and not a service for forks.

| | Where your data lives | Setup | Status |
|---|---|---|---|
| **Public demo** | A made-up lifter's data, in your browser's own demo storage. Nothing is uploaded. | None: open the link. | Coming soon. The landing page's Demo tag becomes a link when it is published. |
| **Local only** | Your own workouts, in one browser on one device. You export a JSON backup from Settings. | Fork and clone, then serve `app/` or publish your fork with GitHub Pages. No account, no AWS. | Coming soon. The app does not have a local-only mode yet; see [section 2](#2-local-only-no-aws). |
| **Your own AWS copy** | Your workouts, in a private S3 bucket in your AWS account, synced between your devices. One owner per stack, signed in with Cognito. | An AWS account and the tools in [section 3](#3-before-you-deploy-to-aws). | Possible today by following [BUILD.md](../BUILD.md), with a custom domain. A scripted setup that needs no custom domain is coming. |

Pick the AWS copy only if you want your workouts on more than one device. Everything else about the app works the same in all three.

## 2. Local only (no AWS)

Coming. This section will cover forking and cloning, serving `app/` locally or on GitHub Pages, exporting a backup and clearing local data from Settings, and moving to AWS later by uploading a backup. It waits for the local-only mode in the app.

## 3. Before you deploy to AWS

Read this before you create anything. It lists what you need, what the deployment creates in your account, and what it is expected to cost.

### What you need

- **Node 22.** The tests and the Lambda build use it.
- **AWS CLI v2**, signed in to your account (set `AWS_PROFILE` first if you use named profiles).
- **AWS SAM CLI**, which builds and deploys the stack.
- **An AWS account you control.** The stack is created inside it and nothing leaves it.
- **A custom domain, for now.** The current template serves the site only on a hostname you own, with an ACM certificate for that hostname in `us-east-1` (a CloudFront requirement) and a DNS record pointing at the distribution. Making the domain optional, so a deployment works at the plain CloudFront address, is part of the coming scripted setup.
- **Your own values, everywhere.** [BUILD.md](../BUILD.md) is currently written around the project owner's own deployment, and `scripts/aws-env.sh` and the template default to the owner's stack name, region and domain. When you follow BUILD.md, set `STACK`, `AWS_REGION` and `DOMAIN` to your own values in every shell and never run a command against `strength-prod`. The checked-in `app/js/config.js` also holds the owner's API settings; you replace them with your stack's outputs (BUILD.md step 6) before you deploy the app.

### What gets created

One CloudFormation stack, named by you, with:

- a private **S3 bucket for the site** (the app's files), served only through CloudFront;
- a **CloudFront distribution** that redirects HTTP to HTTPS and adds security headers, using your domain and certificate;
- a **Cognito user pool** with self-signup off and one app client. You create the single owner account yourself;
- an **HTTP API (API Gateway)** and one **Lambda function** (Node 22) that stores and returns events, plus its IAM role and a CloudWatch log group that keeps logs for 14 days;
- a private, encrypted, versioned **S3 bucket for your workout data**, under `u/<your Cognito sub>/events/`. The Lambda answers only the owner whose Cognito `sub` you give the stack.

`sam deploy --resolve-s3` also creates a small bucket, managed by SAM, that holds the packaged Lambda code.

The data bucket and the user pool are kept when the stack is deleted, so deleting the stack never deletes your workouts or your login. The site bucket is not kept.

### What it costs

There are no always-on servers. S3 storage, CloudFront transfer, Lambda and API Gateway requests, and Cognito sign-ins for one person are expected to stay within or near the AWS free tier, with no fixed monthly charge. This is an estimate, not a quote: prices and free-tier rules change, and a custom domain has its own cost at your DNS provider. See the AWS pricing pages for S3, CloudFront, Lambda, API Gateway and Cognito, and set a billing alert if you want a safety net.

### Permissions

Deploying needs permission to manage:

- CloudFormation
- S3
- CloudFront
- Cognito
- API Gateway
- Lambda
- IAM roles (the deploy passes `CAPABILITY_IAM`)
- CloudWatch Logs
- ACM, read access only, to find the certificate for your custom domain

The easiest route for the first deploy is a profile with administrator access. If you want a narrower policy, write one from the services above. The repository does not ship a ready-made IAM policy.

### Images are optional

The default deployment contains no exercise images. Where an image is missing the app shows its built-in placeholder, and everything else works. The 58 third-party image sources listed in `scripts/image-sources.json` do not have documented redistribution rights, so they are not included, and the deploy never downloads images. Read the [media rights audit](MEDIA-RIGHTS-AUDIT.md) before you add any image of your own, and only add files you have the right to use.

## What comes next in this guide

These sections are added as the work behind them lands. Until then, BUILD.md is the setup document.

- **2. Local only (no AWS).** Waits for the local-only mode.
- **4. Deploy in four commands.** Waits for the setup scripts (`init-deploy.sh`, `deploy-stack.sh`, `create-owner.sh`, `deploy-app.sh`).
- **5. Optional custom domain.** Waits for the template to make the domain optional.
- **6. Check it works.** Sign in, log a set, see it on a second device, and check that the data bucket holds only your own prefix.
- **7. Day to day.** Updating, backups, a forgotten PIN, logs, installing on a phone.
- **8. Tear down.** What the teardown keeps, and how to delete the rest by hand.
- **9. Troubleshooting.**
