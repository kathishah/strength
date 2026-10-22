#!/usr/bin/env bash
# Redeploys the app (app/) to the site bucket and refreshes CloudFront. Run from anywhere:
#
#   scripts/deploy-app.sh                         run tests, upload app files, refresh
#   scripts/deploy-app.sh --dry-run               list app files (nothing changes)
#   scripts/deploy-app.sh --include-images        also upload authorized files already in app/img/
#   scripts/deploy-app.sh --skip-tests
#
# It exports AWS_REGION, STACK, DOMAIN, SITE_BUCKET and DIST_ID (scripts/aws-env.sh) for its own commands. To keep them in your
# terminal too, run: source scripts/aws-env.sh
# Third-party exercise images are not downloaded or uploaded by default. --include-images uploads local files from app/img/;
# use it only when you have redistribution rights for every included asset. scripts/fetch-images.mjs is an optional downloader,
# not part of this deployment path.
# This changes only the static site. The Lambda, Cognito and the data bucket are never touched (that is BUILD.md steps 2 to 5).

set -euo pipefail
cd "$(dirname "$0")/.."

dry=0
tests=1
include_images=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    --skip-tests) tests=0 ;;
    --include-images) include_images=1 ;;
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
  if [ "$include_images" = 1 ] && [ -d app/img ]; then
    aws s3 sync app/img "s3://$SITE_BUCKET/img" --delete --dryrun --exclude '.DS_Store'
  elif [ "$include_images" = 1 ]; then
    echo "No local images found; nothing to sync."
  else
    echo "Skipping optional exercise media."
  fi
  exit 0
fi

aws s3 sync app/ "s3://$SITE_BUCKET" --delete --exclude '.DS_Store' --exclude 'img/*' --cache-control no-cache
if [ "$include_images" = 1 ] && [ -d app/img ]; then
  # Images never change under the same name, so they may be cached for a week.
  aws s3 sync app/img "s3://$SITE_BUCKET/img" --delete --exclude '.DS_Store' --cache-control 'public, max-age=604800'
elif [ "$include_images" = 1 ]; then
  echo "No local images found; skipping image sync."
fi
aws s3 cp app/manifest.webmanifest "s3://$SITE_BUCKET/manifest.webmanifest" \
  --content-type application/manifest+json --cache-control no-cache
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.[Id,Status]' --output text

echo
echo "Deployed to $SITE_URL. The refresh takes a minute or two."
echo "Desktop: hard reload (Cmd+Shift+R). iPhone app: swipe it away and reopen it."
