# Build and deploy (v1, Phase 0 + Phase A spike)

Everything here is run by you, from the repo root. Nothing in this repo deploys itself.
Stack region is `us-west-2`; the CloudFront certificate must be in `us-east-1` (it already is).

Prerequisites: Node 22, [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html), AWS CLI v2 with credentials for the account (`export AWS_PROFILE=...` if you use profiles).

There is one stack, `strength-prod`. Shell variables used below (set them once per terminal; nothing here is a secret). The certificate ARN is looked up, so it never has to be written into the repo:

```bash
export AWS_REGION=us-west-2
export STACK=strength-prod
export DOMAIN=strength.logbook.me
export CERT_ARN=$(aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN' && Status=='ISSUED'].CertificateArn | [0]" --output text)
echo "$CERT_ARN"          # must print an arn:aws:acm:us-east-1:... value, not "None"
```

Time zone: everything uses US Pacific time (`America/Los_Angeles`, so PDT in summer and PST in winter). The month file an event lands in, the server's `recvAt`, and the app's `ts` all use Pacific dates with an explicit offset such as `2026-09-29T12:30:00.123-07:00`. Months roll over at Pacific midnight. Offsets change with daylight saving, so order timestamps by instant (`compareTs` in `lambda/events/registry.mjs`), never as plain strings.

## 1. Test

```bash
node --test
```

No dependencies to install for tests.

## 2. Build the Lambda

```bash
(cd lambda/events && npm ci)                # AWS SDK + esbuild, bundled by sam build
sam validate --lint --template-file infra/template.yaml
sam build --template-file infra/template.yaml
```

`sam build` bundles the Lambda into one file with esbuild and writes `.aws-sam/` (git-ignored).

## 3. First deploy

`OwnerSub` is left out on purpose (it defaults to empty): until step 5 the Lambda answers 403 to everything.

```bash
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$STACK" --region "$AWS_REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 --confirm-changeset \
  --parameter-overrides DomainName="$DOMAIN" CertificateArn="$CERT_ARN"
```

Read the outputs (you need them in the next steps):

```bash
aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
```

Outputs: `CloudFrontDomain`, `DistributionId`, `SiteUrl`, `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `SiteBucketName`, `DataBucketName`.

The data bucket and the user pool have `DeletionPolicy: Retain`: deleting the stack never deletes workout data or the login.
The site bucket does not, and must be emptied before the stack can be deleted.

## 4. DNS at GoDaddy

Add one record in the `logbook.me` zone:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `strength` | the `CloudFrontDomain` output, e.g. `dxxxxxxxxxxxxx.cloudfront.net` | 1 hour |

- Delete any existing record named `strength` first (GoDaddy's default parking A record, for instance). A CNAME cannot share a name with another record.
- Keep the ACM validation CNAME (`_<hash>.strength.logbook.me`) that validated the certificate; ACM needs it to renew.
- The site is reachable on the CloudFront domain immediately, and on `https://strength.logbook.me` once the CNAME propagates.

## 5. Create the user, then set OwnerSub

Self-signup is off, so create the single user yourself. The password is read from a prompt (no echo) into a shell variable, never a file.

```bash
export POOL_ID=<UserPoolId output>
export EMAIL=you@example.com

aws cognito-idp admin-create-user --region "$AWS_REGION" --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS

printf 'PIN (exactly 6 digits): '; stty -echo; read -r PW; stty echo; printf '\n'
aws cognito-idp admin-set-user-password --region "$AWS_REGION" --user-pool-id "$POOL_ID" \
  --username "$EMAIL" --password "$PW" --permanent
unset PW
```

The "password" is a numeric PIN. Cognito's password policy cannot go below 6 characters and has no maximum, so the PIN must be exactly 6 digits (a 4-digit PIN is rejected); the sign-in form only accepts 6 digits. Cognito locks an account temporarily after repeated wrong attempts, but a 6-digit PIN is far weaker than a password, so treat it as a convenience for a personal test app.

`--permanent` means the account never enters the `NEW_PASSWORD_REQUIRED` state, so the page needs no challenge handling. While the command runs, the password is visible in the process list to other users on this machine; that is acceptable on a personal laptop.

Get the user's `sub` and redeploy with it as `OwnerSub` (repeat every parameter; an omitted one reverts to its default):

```bash
export OWNER_SUB=$(aws cognito-idp admin-get-user --region "$AWS_REGION" --user-pool-id "$POOL_ID" \
  --username "$EMAIL" --query "UserAttributes[?Name=='sub'].Value" --output text)
echo "$OWNER_SUB"

sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$STACK" --region "$AWS_REGION" \
  --capabilities CAPABILITY_IAM --resolve-s3 --confirm-changeset \
  --parameter-overrides DomainName="$DOMAIN" CertificateArn="$CERT_ARN" OwnerSub="$OWNER_SUB"
```

To reset a forgotten password later, run `admin-set-user-password ... --permanent` again.

## 6. Fill in `app/js/config.js`

Replace the two placeholders with the stack outputs:

```js
userPoolClientId: '<UserPoolClientId output>',
apiUrl: '<ApiUrl output>',        // https://<id>.execute-api.us-west-2.amazonaws.com
```

Neither is a secret, so committing them is fine.

Optional hardening: `app/index.html` allows `https://*.execute-api.us-west-2.amazonaws.com` in its Content-Security-Policy because the API id is unknown before the first deploy. Replace that wildcard with your exact API host.

Try the page locally first if you like. It only shows that the form loads: signing in works from `localhost`, but API calls are blocked by CORS, which allows only the site origin.

```bash
python3 -m http.server 4173 --directory app     # http://localhost:4173
```

## 7. Deploy the app

```bash
export SITE_BUCKET=<SiteBucketName output>
export DIST_ID=<DistributionId output>

aws s3 sync app/ "s3://$SITE_BUCKET" --delete --dryrun --exclude '.DS_Store'      # preview
aws s3 sync app/ "s3://$SITE_BUCKET" --delete --exclude '.DS_Store' --cache-control no-cache
aws s3 cp app/manifest.webmanifest "s3://$SITE_BUCKET/manifest.webmanifest" \
  --content-type application/manifest+json --cache-control no-cache
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*'
```

Then open `SiteUrl`, sign in, press **Send test event** and **Sync**.
For the Phase A check, add the page to the iPhone home screen (Share, Add to Home Screen) and repeat from there. The **Last round trip** line shows the cold-start time.

## 8. Load Monday's workout (optional, once the API works)

Your workout lives in `private/` (git-ignored, because the repo is public). `private/2026-09-28-workout-a.json` describes it and `scripts/build-events.mjs` turns it into events; the reps are recorded as the bottom of the ranges you gave, so edit the JSON if you want different numbers, then rebuild:

```bash
node scripts/build-events.mjs private/2026-09-28-workout-a.json > private/2026-09-28-workout-a.events.json
node scripts/post-events.mjs private/2026-09-28-workout-a.events.json "$EMAIL"     # asks for the PIN, then for y/N
```

Posting is safe to repeat (events are de-duplicated by id), but rebuilding generates new ids, so post the same events file each time.

## Notes

- Test events are real, permanent log entries (`session.notes` on an entity whose id starts with `spike_`; no session ever refers to it).
- After a code-only change to the Lambda: `sam build` and the same `sam deploy` command as in step 5. After an app-only change: step 7.
- Logs: `sam logs --stack-name "$STACK" --region "$AWS_REGION" --tail`. They never contain request bodies.
