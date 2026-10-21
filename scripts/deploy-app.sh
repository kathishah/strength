#!/usr/bin/env bash
# Redeploys the app (app/) to the site bucket and refreshes CloudFront. Run from anywhere:
#
#   scripts/deploy-app.sh              run the tests, fetch any missing images, upload, refresh
#   scripts/deploy-app.sh --dry-run    only list what would be uploaded or deleted (nothing changes)
#   scripts/deploy-app.sh --skip-tests
#
# It exports AWS_REGION, STACK, DOMAIN, SITE_BUCKET and DIST_ID (scripts/aws-env.sh) for its own commands. To keep them in your
# terminal too, run: source scripts/aws-env.sh
# The exercise images (app/img/, not in git) are downloaded by scripts/fetch-images.mjs if missing, and uploaded with the app.
# This changes only the static site. The Lambda, Cognito and the data bucket are never touched (that is BUILD.md steps 2 to 5).

set -euo pipefail
cd "$(dirname "$0")/.."

dry=0
tests=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    --skip-tests) tests=0 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

# shellcheck source=scripts/aws-env.sh
source scripts/aws-env.sh

if [ "$tests" = 1 ] && [ "$dry" = 0 ]; then
  echo "Running the tests..."
  node --test >/dev/null || { echo "Tests failed: not deploying. Run 'node --test' to see why, or pass --skip-tests." >&2; exit 1; }
  echo "Tests pass."
fi

if [ "$dry" = 1 ]; then
  echo "Dry run: nothing is downloaded, uploaded, or deleted."
  aws s3 sync app/ "s3://$SITE_BUCKET" --delete --dryrun --exclude '.DS_Store' --exclude 'img/*'
  if [ -d app/img ]; then
    aws s3 sync app/img "s3://$SITE_BUCKET/img" --delete --dryrun --exclude '.DS_Store'
  else
    echo "Images are not present locally; image sync would require downloading them first."
  fi
  exit 0
fi

# Fetch before either --delete sync. Any failed download stops deployment and preserves the remote image set.
node scripts/fetch-images.mjs

aws s3 sync app/ "s3://$SITE_BUCKET" --delete --exclude '.DS_Store' --exclude 'img/*' --cache-control no-cache
# Images never change under the same name, so they may be cached for a week.
aws s3 sync app/img "s3://$SITE_BUCKET/img" --delete --exclude '.DS_Store' --cache-control 'public, max-age=604800'
aws s3 cp app/manifest.webmanifest "s3://$SITE_BUCKET/manifest.webmanifest" \
  --content-type application/manifest+json --cache-control no-cache
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.[Id,Status]' --output text

echo
echo "Deployed to $SITE_URL. The refresh takes a minute or two."
echo "Desktop: hard reload (Cmd+Shift+R). iPhone app: swipe it away and reopen it."
