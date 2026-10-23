#!/usr/bin/env bash
# Deletes your stack: the website, CloudFront distribution, API and Lambda. Your workouts are NOT deleted: the data bucket and the user
# pool are kept by design (the stack template marks them Retain), and the script lists them at the end.
#
#   scripts/teardown.sh
#
# It acts only on the stack named in private/deploy.env and stops if that file is missing or incomplete. It shows what will be deleted
# and asks you to type the stack name, offers to export your workouts first (scripts/export-data.mjs), empties the site bucket and deletes
# the stack. Deleting the data bucket and the user pool afterwards is a manual step; the self-hosting guide explains it.

set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
esac

# shellcheck source=scripts/aws-env.sh
source scripts/aws-env.sh

# The resources the template keeps when the stack is deleted (DeletionPolicy: Retain).
RETAINED_RESOURCES="DataBucket DataBucketPolicy UserPool"

resources="$(aws cloudformation list-stack-resources --stack-name "$STACK" --region "$AWS_REGION" \
  --query "StackResourceSummaries[?ResourceStatus!='DELETE_COMPLETE'].[LogicalResourceId,ResourceType]" --output text)"

echo
echo "Stack:  $STACK"
echo "Region: $AWS_REGION"
echo
echo "These will be deleted:"
while IFS=$'\t' read -r id type; do
  [ -n "$id" ] || continue
  case " $RETAINED_RESOURCES " in *" $id "*) continue ;; esac
  echo "  $id ($type)"
done <<EOF
$resources
EOF
echo "  everything in the site bucket $SITE_BUCKET"
echo
echo "These are kept, and still hold your data and login:"
echo "  data bucket $DATA_BUCKET"
echo "  user pool   $USER_POOL_ID"
echo
printf 'Type the stack name (%s) to delete it, or anything else to cancel: ' "$STACK"
IFS= read -r typed || typed=""
if [ "$typed" != "$STACK" ]; then
  echo "Cancelled. Nothing was deleted."
  exit 1
fi

printf 'Export your workouts to private/export/ first? [Y/n] '
IFS= read -r reply || reply=""
case "$reply" in
  n|N|no|NO) echo "Skipping the export. Your workouts stay in the data bucket $DATA_BUCKET." ;;
  *)
    printf 'Email address of the owner: '
    IFS= read -r owner_email || owner_email=""
    if [ -z "$owner_email" ] || ! node scripts/export-data.mjs "$owner_email"; then
      echo "The export did not finish, so the stack was not deleted. Fix that, or run again and answer n to skip the export." >&2
      exit 1
    fi
    ;;
esac

echo "Emptying the site bucket $SITE_BUCKET..."
aws s3 rm "s3://$SITE_BUCKET" --recursive --region "$AWS_REGION"
echo "Deleting stack $STACK (CloudFront takes a few minutes)..."
aws cloudformation delete-stack --stack-name "$STACK" --region "$AWS_REGION"
aws cloudformation wait stack-delete-complete --stack-name "$STACK" --region "$AWS_REGION"

echo
echo "Stack $STACK is deleted. Still in your account (nothing deletes these automatically):"
echo "  data bucket $DATA_BUCKET  (all your workouts; it keeps every object version)"
echo "  user pool   $USER_POOL_ID  (the login)"
echo "To remove them too, follow the teardown steps in the self-hosting guide, which includes emptying every version in the data bucket."
echo "private/deploy.env is unchanged."
