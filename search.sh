#!/usr/bin/env bash
set -euo pipefail

BUCKET="order-vision-ai-dev"
PREFIX="uploads/"
PROFILE="bio-rad-dev"
REGION="us-east-2"        # e.g., us-east-2 if needed
COUNT=10
SUBSTR="test"    # e.g., "1020"

RGN_FLAG=()
[[ -n "$REGION" ]] && RGN_FLAG=(--region "$REGION")

# 1) Newest top-level dirs under uploads/ by each dir's latest object timestamp
DIRS=$(
  aws s3api list-objects-v2 \
    --bucket "$BUCKET" --prefix "$PREFIX" --profile "$PROFILE" "${RGN_FLAG[@]}" \
    --output text --query 'Contents[].[LastModified,Key]' \
  | LC_ALL=C sort -r \
  | awk -F'\t' -v pfx="$PREFIX" -v limit="$COUNT" '
      {
        key=$2
        if (index(key,pfx)==1) {
          n=split(key,a,"/")
          d=a[2]
          if (d!="" && !seen[d]++) { print d; if (++out==limit) exit }
        }
      }'
)

# 2) For each newest dir, report if any key contains SUBSTR
found=0
while read -r d; do
  [[ -z "$d" ]] && continue
  MATCHES=$(
    aws s3api list-objects-v2 \
      --bucket "$BUCKET" --prefix "${PREFIX}${d}/" --profile "$PROFILE" "${RGN_FLAG[@]}" \
      --output text --query 'Contents[].Key' \
    | tr '\t' '\n' \
    | grep -F "$SUBSTR" || true
  )
  if [[ -n "$MATCHES" ]]; then
    echo "Found in: s3://$BUCKET/${PREFIX}${d}/"
    # Uncomment to list the matching keys:
    # printf '%s\n' "$MATCHES"
    found=1
  fi
done <<< "$DIRS"

if [[ $found -eq 0 ]]; then
  echo "No matches for \"$SUBSTR\" in the latest $COUNT dirs under s3://$BUCKET/$PREFIX"
fi
