# Self-hosting guide

How to run your own copy of Strength Training Tracker. This is the page the **Host** tag on the [project landing page](https://kathishah.github.io/strength/) opens, and it is the only setup document: everything you need to run, deploy, check, back up and remove your copy is here.

Contents: [1. Pick how to run it](#1-pick-how-to-run-it) · [2. Local only](#2-local-only-no-aws) · [3. Before you deploy to AWS](#3-before-you-deploy-to-aws) · [4. Deploy in four commands](#4-deploy-in-four-commands) · [5. Optional custom domain](#5-optional-custom-domain) · [6. Check it works](#6-check-it-works) · [7. Day to day](#7-day-to-day) · [8. Tear down](#8-tear-down) · [9. Troubleshooting](#9-troubleshooting)

## 1. Pick how to run it

There are three ways to use the app. They keep their data apart from each other, and none of them uses the project owner's private instance at `strength.logbook.me`, which is not a demo and not a service for forks.

| | Where your data lives | Setup |
|---|---|---|
| **Public demo** | A made-up lifter's data, in your browser's own demo storage. Nothing is uploaded. | None: open the [demo](https://kathishah.github.io/strength/demo/). |
| **Local only** | Your own workouts, in one browser on one device. You export a JSON backup from Settings. | Fork and clone, then serve `app/` or publish your fork with GitHub Pages. No account, no AWS. [Section 2](#2-local-only-no-aws). |
| **Your own AWS copy** | Your workouts, in a private S3 bucket in your AWS account, synced between your devices. One owner per stack, signed in with Cognito. | An AWS account and four commands. [Sections 3 to 6](#3-before-you-deploy-to-aws). |

Pick the AWS copy only if you want your workouts on more than one device. Everything else about the app works the same in all three.

## 2. Local only (no AWS)

1. **Fork and clone** the repository.
2. **Serve `app/`**, either on your machine:

   ```bash
   python3 -m http.server 4173 --directory app
   ```

   and open <http://localhost:4173>, or publish your fork with GitHub Pages (Settings, Pages, deploy from the `main` branch root) and open `https://<you>.github.io/<repo>/app/`.
3. **Use it.** The checked-in `app/js/config.js` holds no sync settings, so the app opens straight on the workout home page in local-only mode, with no sign-in and no network requests. The header says "On this device".

Your workouts are saved in that browser's own storage, for that site address only. A different browser, a different device or a different address starts empty.

- **Back up:** Settings, **Export backup** downloads `strength-events-<date>.json`. Keep a copy somewhere safe: clearing browser data, or **Clear data on this device** in Settings, deletes the workouts. There is no in-app import.
- **If the browser cannot store data** (some private windows), the app says so at the top of every screen: workouts last until the page closes, so export before you leave.

**To move to AWS later:** export a backup from Settings, deploy a stack ([section 4](#4-deploy-in-four-commands)), then upload the backup:

```bash
node scripts/post-events.mjs ~/Downloads/strength-events-2026-10-22.json you@example.com
```

It shows the stack, the site address and the event count, asks before sending, asks for your PIN, and uploads in batches of 200. Workouts waiting in the browser upload by themselves only when the synced app runs at the same address as the local-only one, which is not the usual case; use the backup.

## 3. Before you deploy to AWS

Read this before you create anything. It lists what you need, what the deployment creates in your account, and what it is expected to cost.

### What you need

- **Node 22.** The tests and the Lambda build use it.
- **AWS CLI v2**, able to reach your account.
- **AWS SAM CLI**, which builds and deploys the stack.
- **An AWS account you control** and permissions for the services listed below. The stack is created inside your account and nothing leaves it.
- **Nothing else.** A custom domain is optional ([section 5](#5-optional-custom-domain)); without one the app is served at a CloudFront address such as `https://d1234abcd.cloudfront.net`.

### What gets created

One CloudFormation stack, named by you, with:

- a private **S3 bucket for the site** (the app's files), served only through CloudFront;
- a **CloudFront distribution** that redirects HTTP to HTTPS and adds security headers;
- a **Cognito user pool** with self-signup off and one app client. You create the single owner account yourself;
- an **HTTP API (API Gateway)** and one **Lambda function** (Node 22) that stores and returns events, plus its IAM role and a CloudWatch log group that keeps logs for 14 days;
- a private, encrypted, versioned **S3 bucket for your workout data**, under `u/<your Cognito sub>/events/`. The Lambda answers only the owner whose Cognito `sub` you give the stack.

`sam deploy --resolve-s3` also creates a small bucket, managed by SAM, that holds the packaged Lambda code.

The data bucket and the user pool are kept when the stack is deleted, so deleting the stack never deletes your workouts or your login. The site bucket is not kept. Several stacks can share one AWS account, because every resource name comes from the stack name.

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
- ACM, read access only, to find the certificate for a custom domain

The easiest route for the first deploy is a profile with administrator access. If you want a narrower policy, write one from the services above. The repository does not ship a ready-made IAM policy.

### Images are optional

The default deployment contains no exercise images. Where an image is missing the app shows its built-in placeholder, and everything else works. The 58 third-party image sources listed in `scripts/image-sources.json` do not have documented redistribution rights, so they are not included, and the deploy never downloads images. Read the [media rights audit](MEDIA-RIGHTS-AUDIT.md) before you add any image of your own, and only add files you have the right to use. To publish images you have the rights to, put them in `app/img/` (git-ignored) and run `scripts/deploy-app.sh --include-images`.

### Where your settings live: `private/`

The scripts keep everything that belongs to your deployment in a git-ignored `private/` folder: `private/deploy.env` (the settings below), your own notes, workout files and the exports. None of it is in git, so none of it is backed up by the repository. Keep a copy elsewhere (a private repository, a password manager, cloud storage), especially of `deploy.env`.

## 4. Deploy in four commands

Run these from the repository root, in order. Every one is safe to run again, and you use them again later for updates. Nothing has a built-in stack name, region or domain: they all read `private/deploy.env`, and stop with a clear message if it is missing or incomplete.

If you use AWS named profiles, you choose the profile in the first command; you do not need to export `AWS_PROFILE` yourself.

### 4.1 `scripts/init-deploy.sh`

```bash
scripts/init-deploy.sh
```

- **Asks** for a stack name (it suggests `strength-<your name>`), the AWS region, an AWS profile (empty uses your default credentials) and an optional custom domain. With a domain it looks for an issued ACM certificate in `us-east-1`, or explains how to request one ([section 5](#5-optional-custom-domain)).
- **Changes** only `private/deploy.env`. It shows the file and asks before overwriting an existing one.
- **Success** is the file shown back to you. The variables are `STACK`, `AWS_REGION`, `AWS_PROFILE`, `DOMAIN`, `CERT_ARN` and, after step 4.3, `OWNER_SUB`. Bucket names and the distribution id are never stored; the scripts read them from the stack each time.

### 4.2 `scripts/deploy-stack.sh`

```bash
scripts/deploy-stack.sh
```

- **Does** what you would otherwise type by hand: `npm ci` for the Lambda (the AWS SDK and esbuild), `sam validate --lint`, `sam build` and `sam deploy`, always passing every template parameter from `private/deploy.env`, so an update can never drop the domain or the owner by leaving it out.
- **Shows the change set** and asks before applying it. The first run creates the stack, which takes a few minutes (CloudFront is the slow part).
- **Success** is `sam deploy` reporting the stack created or updated, with its outputs: `CloudFrontDomain`, `DistributionId`, `SiteUrl`, `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `SiteBucketName`, `DataBucketName`. Until the next step, a signed-in request gets 403 from the Lambda, and a request without a sign-in gets 401, by design. The site address shows an "Access denied" page until `deploy-app.sh` has uploaded the app.

### 4.3 `scripts/create-owner.sh <email>`

```bash
scripts/create-owner.sh you@example.com
```

- **Asks** for a 6-digit PIN at a hidden prompt (twice). The PIN is not echoed, not put on a command line and not saved. It must be exactly 6 digits: Cognito's password policy cannot go below 6 characters, and the sign-in form accepts 6 digits. A 6-digit PIN is far weaker than a password, so treat it as a convenience for a personal app.
- **Changes** the stack's user pool (one user, self-signup off, permanent password so the page needs no password-change step), writes the user's Cognito `sub` to `private/deploy.env` as `OWNER_SUB`, and reruns `deploy-stack.sh` so the API accepts that user.
- **Success** is the redeploy finishing. A pool that already has a different user is refused (one stack, one owner). Run it again for the same email to set a new PIN.

### 4.4 `scripts/deploy-app.sh`

```bash
scripts/deploy-app.sh --dry-run     # list what would change; nothing is uploaded or deleted
scripts/deploy-app.sh
```

- **Does** run the tests, copy `app/` into a git-ignored staging folder (`.deploy/site/`), write `js/config.js` there from your stack's outputs, upload the staged copy to the site bucket and refresh CloudFront. A deployment can only ever receive its own stack's settings.
- **Dry run:** it still stages the copy locally and runs no tests; it only skips the upload, the deletes and the CloudFront refresh.
- **Options:** `--skip-tests`; `--include-images` makes the site's `img/` match your local `app/img/`, deletions included (skipped, deleting nothing, if `app/img/` is missing or empty). Without it, images already on the site are left alone. The deploy never downloads images.
- **Success** is `Deployed to https://…`: the address of your site. Open it; the CloudFront refresh can take a minute or two to finish, though the new files usually show sooner.

To keep the stack's values in your terminal for your own `aws` commands, run `source scripts/aws-env.sh`. It sets `SITE_BUCKET`, `DIST_ID`, `SITE_URL`, `API_URL`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID` and `DATA_BUCKET`.

All of this works with no custom domain.

## 5. Optional custom domain

A custom domain is not needed to finish section 4. To add one:

1. **Request a certificate** in `us-east-1` (CloudFront only accepts certificates from there) and validate it by DNS:

   ```bash
   aws acm request-certificate --region us-east-1 --domain-name strength.example.com --validation-method DNS
   ```

   Add the validation CNAME that ACM shows (in the console, under the certificate) at your DNS provider, and wait until the certificate is **Issued**. Keep that CNAME; ACM needs it to renew the certificate.
2. **Rerun `scripts/init-deploy.sh`** and enter the domain. It finds the issued certificate and records it.
3. **Rerun `scripts/deploy-stack.sh`**, then **`scripts/deploy-app.sh`**, so the stack and the app's allowed origin know the new address.
4. **Add a CNAME** at your DNS provider: the name you chose (for example `strength`) pointing at the `CloudFrontDomain` output (`dxxxxxxxxxxxxx.cloudfront.net`). Delete any existing record with the same name first; a CNAME cannot share a name with another record. The CloudFront address keeps working throughout, and your domain works once the record has propagated.

## 6. Check it works

1. **Sign in and log a set.** Open the site address printed by `deploy-app.sh`, sign in with the email and PIN from step 4.3, and log a set on Home. The header dot shows the set is saved on the device and then uploaded.
2. **Second device.** Open the same address on another device (or browser) and sign in. The set arrives within a few seconds. To install the app on a phone: Share, Add to Home Screen.
3. **Isolation check.** Your data bucket should hold exactly one prefix, your own:

   ```bash
   source scripts/aws-env.sh
   aws s3 ls "s3://$DATA_BUCKET/u/"
   echo "$OWNER_SUB"
   ```

   The listing shows one prefix (`PRE <sub>/`), equal to `OWNER_SUB`.

### Optional full check

Run this once after setting up a new stack, on two devices (the installed phone app is the real test). The sync panel is on the Settings screen (the gear icon in the header).

**Sync.** Press **Add test note** on one device: within a few seconds it shows on that device as uploaded. Open the app on the other device (or press **Sync now**) and the same note appears there. Turn on airplane mode, add a note, and it stays in **Waiting to upload** until you are back online. **Last round trip** shows the cold-start time. Test notes are real, permanent log entries.

**Logging a workout** (airplane mode is the real test):

1. Home is the day's cards under a slim header (B after the loaded Workout A; the recovery routine on Tuesday and Thursday). Tap the status line to open the day pills, the History and Settings icons, and the save state. A note above the cards warns if you did a workout yesterday.
2. On an exercise card, turn the dials (each set's weight is already the suggestion, the reps the recommendation), then tap the tick. Swipe sideways to the next exercise. The rest timer runs after each tick; lock the screen and unlock it and it is still right.
3. Swipe the app away and reopen it in the middle of the workout: the exercises you ticked are still done and any dial you had turned is where you left it.
4. Turn on airplane mode, log a whole workout, then on the last card tap **Save and finish**. The dot in the header turns amber with a count of events saved on this device; turn the network back on and it turns green within a few seconds. Open the other device: the workout is there.
5. Open the header and pick Tuesday or Thursday: the recovery routine cards.

**History, Settings and offline:**

1. Header, History icon: **By exercise** lists Workouts A, B and C with each exercise's last session (a green "↑ due" when a scheduled increase is pending). Tap an exercise: last and next increase, the chart (**Top set** / **Volume**, a green line at each increase) and its sessions.
2. **By date** lists every finished workout newest first. One with an exercise you did not tick has an amber "1 missing" tag. **Edit** opens it; tick what is missing, go back: the tag is gone.
3. Header, Settings icon: the sync panel (**Sync now**, **Add test note**, what is waiting, recent events). Sign out is the last icon in the header.
4. Offline load: open the installed app once online, then turn on airplane mode, swipe the app away and open it again. It opens, and you can log a workout (it uploads when you are back online).
5. Turn the phone sideways: the image, title, dials and tick should all show without scrolling.

**The tests.** `node --test` needs no installs. The IndexedDB adapter cannot run in Node; its 13 cases (`test-support/storage-contract.mjs`) also run against the memory adapter there, and have to be run in a browser to check IndexedDB itself.

## 7. Day to day

- **Update the app:** `scripts/deploy-app.sh`. After a deploy, hard-reload (Cmd+Shift+R on desktop) or swipe the installed app away and reopen it to get the new files.
- **Update the stack** (the Lambda or the template): `scripts/deploy-stack.sh`, then read the change set before you confirm.
- **Keep it patched:** your stack runs the Lambda dependencies in `lambda/events/package-lock.json`. Watch this repository's releases or enable Dependabot alerts on your fork, and run `scripts/deploy-stack.sh` after an update. Security problems in the project itself are reported as described in [SECURITY.md](../SECURITY.md).
- **Back up your workouts:**

  ```bash
  node scripts/export-data.mjs you@example.com
  ```

  It signs in (the PIN prompt does not echo), reads every event with `GET /events` (read-only), and writes two files into `private/export/`: `strength-events-<date>.json` (`{ exportedAt, count, events }`, the log as stored; replaying it rebuilds everything) and `strength-sets-<date>.csv` (one row per logged working set, with edits applied and deleted sets left out). Keep a copy of `private/`, including `deploy.env`, outside the repository.
- **Reset a forgotten PIN:** run `scripts/create-owner.sh you@example.com` again; for an existing user it only sets the PIN again.
- **Read the Lambda logs:**

  ```bash
  source scripts/aws-env.sh
  sam logs --stack-name "$STACK" --region "$AWS_REGION" --tail
  ```

  Logs never contain request bodies.
- **Load a past workout** (optional): describe it in a JSON file under `private/`, turn it into events with `node scripts/build-events.mjs private/workout.json > private/workout.events.json`, then `node scripts/post-events.mjs private/workout.events.json you@example.com`. After a successful upload the script writes `<file>.posted` and refuses to send that file again unless you pass `--force`. Event ids come from the workout's date, device and contents, so re-posting an unchanged file is harmless, but a workout you edit gets new ids for changed sets and adds to what was posted. Corrections belong in `set.edited` events, not a re-post.
- **Install on a phone:** open your site address, then Share, Add to Home Screen.
- **Time zones:** everything uses US Pacific time (`America/Los_Angeles`). The month an event is stored under, the server's `recvAt`, and the app's `ts` all use Pacific dates with an explicit offset such as `2026-09-29T12:30:00.123-07:00`, and months roll over at Pacific midnight.

## 8. Tear down

```bash
scripts/teardown.sh
```

It shows the stack name, the region and the resources it will delete, and asks you to type the stack name. It then offers to export your workouts first (answer yes unless you already have a recent export), empties the site bucket, deletes the stack, and lists what remains.

**What it keeps.** The data bucket (all your workouts, with every object version) and the user pool (the login) stay in your account, by design, so a teardown can never delete your data by accident. The script prints their names; note them down, because once the stack is gone the scripts can no longer look them up. `private/deploy.env` is left as it is.

**To delete those too, by hand.** Only do this once you have an export you have checked. Replace the values with the names teardown printed, and use the same profile and region as in `private/deploy.env`:

```bash
export DATA_BUCKET=<data bucket name>
export POOL_ID=<user pool id>
export AWS_REGION=<region>

# 1. Empty the data bucket: every object version and every delete marker (it is versioned, so a plain "rm" is not enough).
for kind in Versions DeleteMarkers; do
  while :; do
    batch="$(aws s3api list-object-versions --bucket "$DATA_BUCKET" --max-items 1000 \
      --query "{Objects: ${kind}[].{Key: Key, VersionId: VersionId}}" --output json)"
    case "$batch" in *'"Key"'*) ;; *) break ;; esac
    aws s3api delete-objects --bucket "$DATA_BUCKET" --delete "$batch" >/dev/null
  done
done

# 2. Delete the bucket, and only if that worked, the user pool (the login stays until the data is gone).
aws s3api delete-bucket --bucket "$DATA_BUCKET" && aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID"
```

The block works in bash and in zsh (the default shell on a Mac).

If `aws s3api list-object-versions --bucket "$DATA_BUCKET"` still lists anything afterwards, run the loop again. The console's **Empty bucket** button does the same job. The SAM-managed bucket named like `aws-sam-cli-managed-default-…` holds the packaged code of every stack SAM deployed in this account and region. Leave it unless no other stack uses it (check with `aws cloudformation list-stacks`); what your stack left in it is one small template file.

## 9. Troubleshooting

- **A command says `private/deploy.env` is missing or incomplete.** Every AWS script stops until it is complete. Run `scripts/init-deploy.sh`; `OWNER_SUB` is filled in by `create-owner.sh`. If you set a domain, `CERT_ARN` is required too.
- **Every signed-in request fails with 403** (requests without a sign-in get 401, which is normal). The stack's `OwnerSub` is not set yet. Run `scripts/create-owner.sh <email>`, which sets it and redeploys.
- **Sign-in works but sync fails from `localhost`.** By design: the API only accepts requests from your site's own address (the CloudFront address, plus your custom domain if you set one). Local previews show the interface; signing in works, API calls are blocked by CORS.
- **The site still shows old files after a deploy.** Hard-reload, or swipe the installed app away and reopen it. The CloudFront refresh takes a minute or two.
- **"Incorrect email or PIN."** The PIN is exactly six digits. Cognito locks an account temporarily after repeated wrong attempts; wait a minute. To set a new PIN, rerun `scripts/create-owner.sh`.
- **The app opens without a sign-in screen on your AWS site.** The deployed copy of `js/config.js` is empty: it was not written by `deploy-app.sh`. Run `scripts/deploy-app.sh` again and check it prints your site address.
- **A deploy failed before upload.** Nothing was changed: the images already on the site are never deleted by a failed or interrupted deploy.
