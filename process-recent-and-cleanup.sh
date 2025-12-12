#!/bin/bash

echo "=== Processing Recent Uploads and Cleaning Up Old Ones ==="
echo ""

# Calculate 48-hour cutoff
cutoff=$(($(date +%s) * 1000 - 172800000))
echo "Cutoff: $(date -r $((cutoff/1000)) '+%Y-%m-%d %H:%M:%S') (48 hours ago)"
echo ""

# Get all JSON files from S3 root
echo "Fetching all JSON files from S3 root..."
all_files=$(aws s3 ls s3://order-vision-ai-dev/ --profile bio-rad-dev --region us-east-2 | grep ".json" | awk '{print $4}')

# Separate into recent and old
recent_files=()
old_files=()

while IFS= read -r file; do
    ts=$(echo "$file" | sed 's/.json//')
    if [ "$ts" -gt "$cutoff" ]; then
        recent_files+=("$ts")
    else
        old_files+=("$ts")
    fi
done <<< "$all_files"

echo "Recent files (last 48 hours): ${#recent_files[@]}"
echo "Old files (older than 48 hours): ${#old_files[@]}"
echo ""

# Delete old JSON files
echo "=== Deleting ${#old_files[@]} old JSON files from S3 root ==="
deleted=0
for ts in "${old_files[@]}"; do
    aws s3 rm s3://order-vision-ai-dev/$ts.json --profile bio-rad-dev --region us-east-2 > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        ((deleted++))
        if [ $((deleted % 50)) -eq 0 ]; then
            echo "  Deleted $deleted files..."
        fi
    fi
done
echo "✅ Deleted $deleted old JSON files"
echo ""

# Process recent files
echo "=== Processing ${#recent_files[@]} Recent Uploads ==="
echo ""

processed=0
failed=0

for ts in "${recent_files[@]}"; do
    # Get metadata from S3
    metadata=$(aws s3 cp s3://order-vision-ai-dev/uploads/$ts/metadata.json - --profile bio-rad-dev --region us-east-2 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Create payload for classification Lambda
        payload=$(jq -n --argjson ts "$ts" --argjson meta "$metadata" '{timestamp: $ts, metadata: $meta}')
        
        # Invoke classification Lambda
        echo "$payload" | aws lambda invoke \
            --function-name order-vision-classification \
            --cli-binary-format raw-in-base64-out \
            --payload file:///dev/stdin \
            --region us-east-2 \
            --profile bio-rad-dev \
            /tmp/response-$ts.json > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            ((processed++))
            # Delete the JSON file from S3 root
            aws s3 rm s3://order-vision-ai-dev/$ts.json --profile bio-rad-dev --region us-east-2 > /dev/null 2>&1
            
            if [ $((processed % 5)) -eq 0 ]; then
                echo "  Processed $processed/$((${#recent_files[@]}))..."
            fi
        else
            ((failed++))
        fi
    else
        ((failed++))
    fi
    
    sleep 1  # Small delay between invocations
done

echo ""
echo "=== Processing Complete ==="
echo "✅ Successfully processed: $processed"
echo "❌ Failed: $failed"
echo ""
echo "Waiting 30 seconds for processing to complete..."
sleep 30

echo ""
echo "=== Verification ==="
complete=0
incomplete=0

for ts in "${recent_files[@]}"; do
    result=$(aws s3 ls s3://order-vision-ai-dev/uploads/$ts/ --profile bio-rad-dev --region us-east-2 2>/dev/null | grep -E "classification|processed")
    if [ -n "$result" ]; then
        ((complete++))
    else
        ((incomplete++))
    fi
done

echo "✅ Complete (has classification/processed files): $complete"
echo "⏳ Still processing: $incomplete"
echo ""
echo "Final queue count:"
aws s3 ls s3://order-vision-ai-dev/ --profile bio-rad-dev --region us-east-2 | grep ".json" | wc -l | xargs -I {} echo "Remaining JSON files in queue: {}"
