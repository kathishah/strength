#!/usr/bin/env bash
# Step 3 of 4 for an AWS copy: creates the stack's single Cognito user, sets its PIN, records the user's id as OWNER_SUB in
# private/deploy.env and redeploys the stack so the API accepts that user (until then it answers 403 to every request).
#
#   scripts/create-owner.sh you@example.com
#
# The pool allows no self-signup, so this is the only way to get a login. The PIN is six digits and is typed at a hidden prompt: it is
# not echoed, not put on a command line and not saved anywhere. Safe to rerun: for an existing user it only sets the PIN again, which
# is also how you reset a forgotten PIN. A pool that already has a different user is refused (one stack, one owner).
# Needs the stack from scripts/deploy-stack.sh. Next: scripts/deploy-app.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") echo "usage: scripts/create-owner.sh <email>" >&2; exit 2 ;;
esac
email="$1"
if [ "$#" -ne 1 ] || ! printf '%s' "$email" | grep -Eq "^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"; then
  echo "usage: scripts/create-owner.sh <email>   (one plain email address)" >&2
  exit 2
fi

# shellcheck source=scripts/aws-env.sh
source scripts/aws-env.sh

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# One stack, one owner: stop if the pool already holds someone else.
others=""
existing="$(aws cognito-idp list-users --region "$AWS_REGION" --user-pool-id "$USER_POOL_ID" \
  --query "Users[].Attributes[?Name=='email'].Value[]" --output text)"
for other in $existing; do
  if [ "$(lower "$other")" != "$(lower "$email")" ]; then others="$others $other"; fi
done
if [ -n "$others" ]; then
  echo "The user pool of stack $STACK already has a different user:$others" >&2
  echo "A stack has one owner. Use another stack for another person." >&2
  exit 1
fi

PIN="$(node scripts/ask-pin.mjs)" || exit 1

get_user="$(aws cognito-idp admin-get-user --region "$AWS_REGION" --user-pool-id "$USER_POOL_ID" --username "$email" 2>&1)" && found=1 || found=0
if [ "$found" = 1 ]; then
  echo "User exists; setting the PIN again."
elif printf '%s' "$get_user" | grep -q UserNotFoundException; then
  aws cognito-idp admin-create-user --region "$AWS_REGION" --user-pool-id "$USER_POOL_ID" --username "$email" \
    --user-attributes "Name=email,Value=$email" Name=email_verified,Value=true --message-action SUPPRESS >/dev/null
  echo "User created."
else
  echo "Could not look up the user: $get_user" >&2
  exit 1
fi

# The PIN goes to the AWS CLI in a private temporary file, not on its command line (where other programs could read it).
params="$(mktemp)"
trap 'rm -f "$params"' EXIT
printf '{"UserPoolId":"%s","Username":"%s","Password":"%s","Permanent":true}\n' "$USER_POOL_ID" "$email" "$PIN" > "$params"
unset PIN
aws cognito-idp admin-set-user-password --region "$AWS_REGION" --cli-input-json "file://$params"
rm -f "$params"
echo "PIN set (permanent)."

sub="$(aws cognito-idp admin-get-user --region "$AWS_REGION" --user-pool-id "$USER_POOL_ID" --username "$email" \
  --query "UserAttributes[?Name=='sub'].Value | [0]" --output text)"
if ! printf '%s' "$sub" | grep -Eq '^[A-Za-z0-9-]{1,64}$'; then
  echo "Could not read the user's id (got: $sub)." >&2
  exit 1
fi

file=private/deploy.env
new="$(mktemp)"
grep -v '^OWNER_SUB=' "$file" > "$new" || true
echo "OWNER_SUB=$sub" >> "$new"
cp "$new" "$file"
rm -f "$new"
if [ -n "$OWNER_SUB" ] && [ "$OWNER_SUB" != "$sub" ]; then echo "OWNER_SUB changed from the value that was in $file."; fi
echo "OWNER_SUB=$sub saved in $file."

echo "Updating the stack so the API accepts this user..."
scripts/deploy-stack.sh
echo
echo "Done. Next: scripts/deploy-app.sh"
