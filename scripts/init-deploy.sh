#!/usr/bin/env bash
# Step 1 of 4 for an AWS copy: asks which stack, region, AWS profile and (optionally) custom domain this copy uses, and writes them to
# private/deploy.env. Every other AWS script reads that file and acts only on the stack named in it. Run it again to change the settings;
# it shows the new file and asks before overwriting the old one.
#
#   scripts/init-deploy.sh
#
# With a domain it looks for an issued ACM certificate for it in us-east-1 (CloudFront only accepts certificates from there) and stops
# with instructions if there is none. Without a domain the site is served at its CloudFront address.
# Next: scripts/deploy-stack.sh, then scripts/create-owner.sh <email>, then scripts/deploy-app.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
esac

file=private/deploy.env

# Values from an existing file are offered as defaults; nothing is assumed otherwise.
old_stack="" old_region="" old_profile="" old_domain="" old_owner=""
if [ -f "$file" ]; then
  # shellcheck disable=SC1090
  eval "$(
    unset STACK AWS_REGION AWS_PROFILE DOMAIN OWNER_SUB
    # shellcheck disable=SC1090
    . "$file" >/dev/null 2>&1 || true
    printf 'old_stack=%q old_region=%q old_profile=%q old_domain=%q old_owner=%q\n' \
      "${STACK:-}" "${AWS_REGION:-}" "${AWS_PROFILE:-}" "${DOMAIN:-}" "${OWNER_SUB:-}"
  )"
fi

ask() { # ask <prompt> <default>; the answer is left in $answer
  local prompt="$1" default="${2:-}"
  if [ -n "$default" ]; then printf '%s [%s]: ' "$prompt" "$default"; else printf '%s: ' "$prompt"; fi
  IFS= read -r answer || answer=""
  [ -n "$answer" ] || answer="$default"
}

who="$(id -un 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed 's/^-*//; s/-*$//')"
suggest_stack="${old_stack:-${who:+strength-$who}}"
suggest_region="${old_region:-$(aws configure get region 2>/dev/null || true)}"
suggest_profile="${old_profile:-${AWS_PROFILE:-}}"

echo "This stack holds one person's workouts. Its name becomes part of the names of its AWS resources."
ask "Stack name" "$suggest_stack"
stack="$answer"
if ! printf '%s\n' "$stack" | grep -Eq '^[A-Za-z][A-Za-z0-9-]{0,62}$'; then
  echo "A stack name starts with a letter and has only letters, digits and hyphens (up to 63)." >&2
  exit 1
fi

ask "AWS region for the stack (for example us-west-2)" "$suggest_region"
region="$answer"
if ! printf '%s\n' "$region" | grep -Eq '^[a-z]{2}(-[a-z]+)+-[0-9]$'; then
  echo "That does not look like an AWS region (for example us-west-2)." >&2
  exit 1
fi

ask "AWS profile (empty uses your default credentials)" "$suggest_profile"
profile="$answer"
if ! printf '%s\n' "$profile" | grep -Eq '^[A-Za-z0-9_.@:-]*$'; then
  echo "A profile name has only letters, digits and . _ @ : -" >&2
  exit 1
fi
if [ -n "$profile" ]; then export AWS_PROFILE="$profile"; else unset AWS_PROFILE; fi

echo "A custom domain is optional: leave it empty to use the address CloudFront gives the site."
ask "Custom domain (for example strength.example.com)" "$old_domain"
domain="$answer"
cert_arn=""
if [ -n "$domain" ]; then
  if ! printf '%s\n' "$domain" | grep -Eq '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; then
    echo "That does not look like a lowercase hostname such as strength.example.com." >&2
    exit 1
  fi
  parent="${domain#*.}"
  cert_arn="$(aws acm list-certificates --region us-east-1 \
    --query "CertificateSummaryList[?(DomainName=='$domain' || DomainName=='*.$parent') && Status=='ISSUED'].CertificateArn | [0]" \
    --output text)" || { echo "Could not list the ACM certificates in us-east-1; check your AWS credentials." >&2; exit 1; }
  if [ -z "$cert_arn" ] || [ "$cert_arn" = "None" ]; then
    cat >&2 <<EOF
No issued ACM certificate for $domain was found in us-east-1.
CloudFront only accepts certificates from us-east-1. Request one and wait until it shows "Issued":
  1. Open AWS Certificate Manager in the us-east-1 region and choose Request a public certificate.
  2. Enter $domain, choose DNS validation, and add the validation record it shows at your DNS provider.
  3. Run this script again once the status is Issued.
Or leave the domain empty now and add it later by running this script again.
EOF
    exit 1
  fi
  echo "Using certificate $cert_arn"
fi

# OWNER_SUB belongs to one stack's user pool, so it is kept only when the stack and region are unchanged.
owner_sub=""
if [ -n "$old_owner" ] && [ "$stack" = "$old_stack" ] && [ "$region" = "$old_region" ]; then owner_sub="$old_owner"; fi

new="$(mktemp)"
trap 'rm -f "$new"' EXIT
{
  echo "# Settings for one deployment. Written by scripts/init-deploy.sh; git-ignored. Keep a copy somewhere outside the repository."
  echo "STACK=$stack"
  echo "AWS_REGION=$region"
  echo "AWS_PROFILE=$profile"
  echo "DOMAIN=$domain"
  echo "CERT_ARN=$cert_arn"
  echo "OWNER_SUB=$owner_sub"
} > "$new"

echo
echo "$file will contain:"
sed 's/^/  /' "$new"
if [ -f "$file" ]; then
  printf 'Overwrite the existing %s? [y/N] ' "$file"
else
  printf 'Write %s? [Y/n] ' "$file"
fi
IFS= read -r reply || reply=""
if [ -f "$file" ]; then
  case "$reply" in y|Y|yes|YES) ;; *) echo "Left $file unchanged."; exit 0 ;; esac
else
  case "$reply" in n|N|no|NO) echo "Nothing written."; exit 0 ;; *) ;; esac
fi

mkdir -p private
cp "$new" "$file"
echo "Wrote $file."
echo "Next: scripts/deploy-stack.sh"
