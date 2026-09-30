# Exports the variables the deploy commands need, read from the strength-prod stack's outputs (nothing is stored in the repo).
#
#   source scripts/aws-env.sh        keeps them in your terminal (do this before running aws commands by hand)
#
# deploy-app.sh sources this file itself. Set AWS_PROFILE first if you use profiles. Override any of the first three by
# exporting them before you source this file.

export AWS_REGION="${AWS_REGION:-us-west-2}"
export STACK="${STACK:-strength-prod}"
export DOMAIN="${DOMAIN:-strength.logbook.me}"

_strength_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

SITE_BUCKET="$(_strength_output SiteBucketName)" || SITE_BUCKET=""
DIST_ID="$(_strength_output DistributionId)" || DIST_ID=""
unset -f _strength_output

if [ -z "$SITE_BUCKET" ] || [ "$SITE_BUCKET" = "None" ] || [ -z "$DIST_ID" ] || [ "$DIST_ID" = "None" ]; then
  echo "Could not read SiteBucketName and DistributionId from stack $STACK in $AWS_REGION." >&2
  echo "Check your AWS credentials (AWS_PROFILE) and that the stack exists." >&2
  unset SITE_BUCKET DIST_ID
  return 1 2>/dev/null || exit 1
fi

export SITE_BUCKET DIST_ID
export SITE_URL="https://$DOMAIN"
echo "AWS_REGION=$AWS_REGION STACK=$STACK"
echo "SITE_BUCKET=$SITE_BUCKET DIST_ID=$DIST_ID"
