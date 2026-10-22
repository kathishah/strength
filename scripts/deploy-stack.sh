#!/usr/bin/env bash
# Step 2 of 4 for an AWS copy (also used for every later infrastructure update): builds the Lambda and creates or updates your stack.
#
#   scripts/deploy-stack.sh
#
# It acts only on the stack named in private/deploy.env and stops if that file is missing or incomplete. It runs npm ci for the Lambda,
# sam validate, sam build and sam deploy, and always passes every template parameter from the file (DomainName, CertificateArn,
# OwnerSub), so an update can never drop the domain or the owner by leaving them out. sam deploy shows the change set and asks before
# applying it. Safe to rerun; with nothing to change it does nothing.
# Needs Node 22, npm, AWS SAM CLI and the AWS CLI. Next: scripts/create-owner.sh <email>, then scripts/deploy-app.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
esac

STRENGTH_SKIP_OUTPUTS=1
# shellcheck source=scripts/aws-env.sh
source scripts/aws-env.sh
unset STRENGTH_SKIP_OUTPUTS

for tool in node npm sam aws; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool is not installed or not on your PATH (see the prerequisites in the self-hosting guide)." >&2; exit 1; }
done

echo "Installing the Lambda's dependencies..."
(cd lambda/events && npm ci)

sam validate --lint --template-file infra/template.yaml --region "$AWS_REGION"
sam build --template-file infra/template.yaml

if [ -z "$OWNER_SUB" ]; then
  echo "OWNER_SUB is empty: the API will answer 403 to every request until scripts/create-owner.sh has run."
fi
# The values are quoted for sam, which does not accept an empty parameter value unquoted (DomainName= fails, DomainName="" works).
echo "Deploying stack $STACK to $AWS_REGION (domain: ${DOMAIN:-none, the CloudFront address})."
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$STACK" --region "$AWS_REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 --confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides "DomainName=\"$DOMAIN\"" "CertificateArn=\"$CERT_ARN\"" "OwnerSub=\"$OWNER_SUB\""

echo
echo "Stack $STACK is up to date."
