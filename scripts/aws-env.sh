# shellcheck shell=bash
# Loads one deployment's settings from private/deploy.env (written by scripts/init-deploy.sh) and the values the AWS commands need,
# read from that stack's outputs each time (nothing but the settings file is stored).
#
#   source scripts/aws-env.sh        keeps them in your terminal (do this before running aws commands by hand)
#
# Variables from private/deploy.env: STACK, AWS_REGION, AWS_PROFILE, DOMAIN, CERT_ARN, OWNER_SUB.
# Added from the stack outputs:      SITE_BUCKET, DIST_ID, SITE_URL, API_URL, USER_POOL_ID, USER_POOL_CLIENT_ID, DATA_BUCKET.
#
# There are no built-in defaults. Anything already exported in your terminal under those names is discarded, so the file alone decides
# which stack a command acts on. If the file is missing or incomplete this stops with a message (and returns 1 when sourced).
# Scripts that run before the stack exists set STRENGTH_SKIP_OUTPUTS=1 first, to load only the settings.

_strength_src="${BASH_SOURCE[0]:-}"
if [ -z "$_strength_src" ] && [ -n "${ZSH_VERSION:-}" ]; then _strength_src="$(eval 'printf %s "${(%):-%x}"')"; fi
[ -n "$_strength_src" ] || _strength_src="$0"
STRENGTH_ROOT="$(cd "$(dirname "$_strength_src")/.." && pwd)"
unset _strength_src

_strength_fail() {
  echo "$1" >&2
  [ -z "${2:-}" ] || echo "$2" >&2
}

_strength_load() {
  local file="$STRENGTH_ROOT/private/deploy.env"
  if [ ! -f "$file" ]; then
    _strength_fail "private/deploy.env is missing: no stack is selected." "Run scripts/init-deploy.sh to create it."
    return 1
  fi

  unset STACK AWS_REGION AWS_PROFILE DOMAIN CERT_ARN OWNER_SUB \
    SITE_BUCKET DIST_ID SITE_URL API_URL USER_POOL_ID USER_POOL_CLIENT_ID DATA_BUCKET
  # shellcheck disable=SC1090
  . "$file"

  local missing=""
  [ -n "${STACK:-}" ] || missing="$missing STACK"
  [ -n "${AWS_REGION:-}" ] || missing="$missing AWS_REGION"
  if [ -n "${DOMAIN:-}" ] && [ -z "${CERT_ARN:-}" ]; then missing="$missing CERT_ARN(required with DOMAIN)"; fi
  if [ -n "$missing" ]; then
    _strength_fail "private/deploy.env is incomplete; missing:$missing" "Run scripts/init-deploy.sh to fix it."
    return 1
  fi

  if [ -n "${AWS_PROFILE:-}" ]; then export AWS_PROFILE; else unset AWS_PROFILE; fi
  export STACK AWS_REGION
  DOMAIN="${DOMAIN:-}"; CERT_ARN="${CERT_ARN:-}"; OWNER_SUB="${OWNER_SUB:-}"
  export DOMAIN CERT_ARN OWNER_SUB
  return 0
}

_strength_outputs() {
  local out k v
  if ! out="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output text 2>&1)"; then
    _strength_fail "Could not read the outputs of stack $STACK in $AWS_REGION:" "$out"
    echo "Check the AWS credentials (AWS_PROFILE in private/deploy.env) and that scripts/deploy-stack.sh has created the stack." >&2
    return 1
  fi
  while IFS=$'\t' read -r k v; do
    case "$k" in
      SiteBucketName) SITE_BUCKET="$v" ;;
      DistributionId) DIST_ID="$v" ;;
      SiteUrl) SITE_URL="$v" ;;
      ApiUrl) API_URL="$v" ;;
      UserPoolId) USER_POOL_ID="$v" ;;
      UserPoolClientId) USER_POOL_CLIENT_ID="$v" ;;
      DataBucketName) DATA_BUCKET="$v" ;;
    esac
  done <<EOF
$out
EOF
  local missing=""
  [ -n "${SITE_BUCKET:-}" ] || missing="$missing SiteBucketName"
  [ -n "${DIST_ID:-}" ] || missing="$missing DistributionId"
  [ -n "${SITE_URL:-}" ] || missing="$missing SiteUrl"
  [ -n "${API_URL:-}" ] || missing="$missing ApiUrl"
  [ -n "${USER_POOL_ID:-}" ] || missing="$missing UserPoolId"
  [ -n "${USER_POOL_CLIENT_ID:-}" ] || missing="$missing UserPoolClientId"
  [ -n "${DATA_BUCKET:-}" ] || missing="$missing DataBucketName"
  if [ -n "$missing" ]; then
    _strength_fail "Stack $STACK in $AWS_REGION has no output for:$missing" "Run scripts/deploy-stack.sh to finish or update the stack."
    return 1
  fi
  export SITE_BUCKET DIST_ID SITE_URL API_URL USER_POOL_ID USER_POOL_CLIENT_ID DATA_BUCKET
  return 0
}

if _strength_load && { [ "${STRENGTH_SKIP_OUTPUTS:-0}" = 1 ] || _strength_outputs; }; then
  unset -f _strength_fail _strength_load _strength_outputs
  echo "STACK=$STACK AWS_REGION=$AWS_REGION AWS_PROFILE=${AWS_PROFILE:-(default credentials)}"
  if [ "${STRENGTH_SKIP_OUTPUTS:-0}" != 1 ]; then echo "SITE_URL=$SITE_URL"; fi
  return 0 2>/dev/null || true
else
  unset -f _strength_fail _strength_load _strength_outputs
  return 1 2>/dev/null || exit 1
fi
