# Build and deploy (v1, through Phase D)

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

No dependencies to install for tests. The IndexedDB adapter cannot run in Node; its 13 cases (`test-support/storage-contract.mjs`) also run against the memory adapter here, and have to be run in a browser to check IndexedDB itself.

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

Self-signup is off, so create the single user yourself. `private/create-user.sh` (git-ignored; it holds the email and PIN, so keep it out of git) does all of this in one go. The commands below are the same steps done by hand, with the PIN read from a no-echo prompt.

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

Already done for the deployed `strength-prod` stack (and the CSP pins its API host). Redo this only if the stack is recreated. Replace the two values with the stack outputs:

```js
userPoolClientId: '<UserPoolClientId output>',
apiUrl: '<ApiUrl output>',        // https://<id>.execute-api.us-west-2.amazonaws.com
```

Neither is a secret, so committing them is fine.

`app/index.html` pins the API host in its Content-Security-Policy; update it to the new `ApiUrl` host if the stack is recreated.

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

Then open `SiteUrl` and sign in. The page syncs on open.
For the Phase D check (workout logging), see the list after this paragraph. The Phase B two-device check below still works: the sync panel is under **Sync and this device** at the bottom of Home.
For the Phase B check, use two devices (say the desktop and the phone, ideally the installed home-screen app): press **Add test note** on one, and within a few seconds it shows on that device as uploaded; open the app on the other (or press **Sync now**) and the same note appears there. Turn on airplane mode, add a note, and it stays in **Waiting to upload** until you are back online. To install on the iPhone: Share, Add to Home Screen. **Last round trip** shows the cold-start time.
Phase D check, on the installed phone app (airplane mode is the real test):
1. Home shows the next workout (B after the loaded Workout A), a recovery card first on Tuesday and Thursday, and a warning if you did a workout yesterday.
2. Pick a back pain number if you like, tap **Start**, set a weight on set 1 (the later sets follow), type reps, tap **Done**, then swipe sideways to the next exercise (the left edge of each card is colour-coded by superset). The rest timer runs; lock the screen and unlock it and it is still right.
3. Swipe the app away and reopen it in the middle of the workout: Home offers **Resume** and the sets you logged and the numbers you typed are back.
4. Turn on airplane mode, log a whole workout, **Finish**. The header says how many events are saved on this device; turn the network back on and it changes to **All saved** within a few seconds. Open the desktop: the workout is there.
5. The **Recovery routine** page opens from Home (its demo images need a connection).

The first start after this update discards the Phase A spike's `localStorage` copy of the events (it was only a cache) and downloads them again into IndexedDB.

## 8. Load Monday's workout (optional, once the API works)

Your workout lives in `private/` (git-ignored, because the repo is public). `private/2026-09-28-workout-a.json` describes it and `scripts/build-events.mjs` turns it into events; the reps are recorded as the bottom of the ranges you gave, so edit the JSON if you want different numbers, then rebuild:

```bash
node scripts/build-events.mjs private/2026-09-28-workout-a.json > private/2026-09-28-workout-a.events.json
node scripts/post-events.mjs private/2026-09-28-workout-a.events.json "$EMAIL"     # asks for the PIN, then for y/N
```

The PIN prompt does not echo. After a successful post the script writes `<file>.posted` and refuses to send that file again unless you pass `--force`. Event ids are derived from the workout's date, device and contents, so rebuilding an unchanged workout gives identical ids and the server de-duplicates a re-post; a workout you *edit* (different reps, say) gets new ids for changed sets and would add to, not replace, what was posted. Corrections belong in `set.edited` events, not a re-post.

## Notes

- Test notes are real, permanent log entries (`session.notes` on an entity whose id starts with `spike_`; no session ever refers to it).
- After a code-only change to the Lambda: `sam build` and the same `sam deploy` command as in step 5. After an app-only change: step 7.
- Logs: `sam logs --stack-name "$STACK" --region "$AWS_REGION" --tail`. They never contain request bodies.
