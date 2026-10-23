#!/usr/bin/env bash
# Deploys the app (app/) to your stack's site bucket and refreshes CloudFront. Run from anywhere:
#
#   scripts/deploy-app.sh                         run tests, stage app/, upload the staged copy, refresh
#   scripts/deploy-app.sh --dry-run               list what would change (nothing is downloaded, uploaded or deleted)
#   scripts/deploy-app.sh --include-images        also make the site's img/ match your local app/img/ (deletions included)
#   scripts/deploy-app.sh --skip-tests
#
# It acts on the stack named in private/deploy.env (scripts/init-deploy.sh writes it) and stops if that file is missing or incomplete.
# app/ is copied to .deploy/site/ (git-ignored) and js/config.js there is written from the stack's outputs, so a deployment always
# gets its own API and sign-in settings and never another stack's. The staged copy is what gets uploaded. To keep the stack's values in
# your terminal too, run: source scripts/aws-env.sh
# Images: the deploy never downloads them. Without --include-images the images already on the site are left alone. With it, the site's
# img/ is made to match app/img/; if app/img/ is missing or empty the image sync is skipped and nothing is deleted. Use it only when
# you have redistribution rights for every file in app/img/. scripts/fetch-images.mjs is an optional downloader, not part of this deploy.
# This changes only the static site. The Lambda, Cognito and the data bucket are never touched (that is scripts/deploy-stack.sh).

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
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# Everything up to the uploads is local: a failure here cannot change the site or its images.
stage=.deploy/site
rm -rf "$stage"
mkdir -p "$stage"
(cd app && tar cf - --exclude ./img --exclude .DS_Store .) | (cd "$stage" && tar xf -)
sync_images=0
if [ "$include_images" = 1 ]; then
  if [ -d app/img ] && [ -n "$(find app/img -type f ! -name .DS_Store -print -quit)" ]; then
    mkdir -p "$stage/img"
    cp -R app/img/. "$stage/img/"
    find "$stage/img" -name .DS_Store -delete
    sync_images=1
  else
    echo "app/img/ is missing or empty: skipping the image sync. Nothing on the site is deleted."
  fi
fi
node scripts/stack-config.mjs site-config "$stage/js/config.js"
echo "Staged $stage with the sign-in and API settings of stack $STACK."

dry_flag=()
if [ "$dry" = 1 ]; then
  echo "Dry run: nothing is downloaded, uploaded, or deleted."
  dry_flag=(--dryrun)
fi

# The site files. --exclude 'img/*' also keeps --delete away from the images already on the site.
aws s3 sync "$stage" "s3://$SITE_BUCKET" --delete ${dry_flag[@]+"${dry_flag[@]}"} --exclude 'img/*' --cache-control no-cache
if [ "$sync_images" = 1 ]; then
  # Images never change under the same name, so they may be cached for a week.
  aws s3 sync "$stage/img" "s3://$SITE_BUCKET/img" --delete ${dry_flag[@]+"${dry_flag[@]}"} --cache-control 'public, max-age=604800'
elif [ "$include_images" = 0 ]; then
  echo "Leaving the images on the site as they are."
fi

if [ "$dry" = 1 ]; then exit 0; fi

aws s3 cp "$stage/manifest.webmanifest" "s3://$SITE_BUCKET/manifest.webmanifest" \
  --content-type application/manifest+json --cache-control no-cache
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.[Id,Status]' --output text

echo
echo "Deployed to $SITE_URL. The refresh takes a minute or two."
echo "Desktop: hard reload (Cmd+Shift+R). iPhone app: swipe it away and reopen it."
