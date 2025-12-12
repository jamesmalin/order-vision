#!/bin/bash

# Process Iqbal's 10 SoldTo test uploads immediately
# This bypasses the queue by manually invoking the classification Lambda

echo "=== Processing Iqbal's 10 SoldTo Test Uploads ==="
echo ""

# Array of Iqbal's upload timestamps
timestamps=(
    1763494581000
    1763494624000
    1763494642000
    1763494661000
    1763494676000
    1763494688000
    1763509388000
    1763509396000
    1763509404000
    1763509413000
)

for ts in "${timestamps[@]}"; do
    echo "Processing timestamp: $ts"
    
    # Get metadata from S3
    metadata=$(aws s3 cp s3://order-vision-ai-dev/uploads/$ts/metadata.json - --profile bio-rad-dev --region us-east-2 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Create payload for classification Lambda
        payload=$(cat <<EOF
{
  "timestamp": $ts,
  "metadata": $metadata
}
EOF
)
        
        # Invoke classification Lambda
        echo "  Invoking classification Lambda..."
        aws lambda invoke \
            --function-name order-vision-classification \
            --payload "$payload" \
            --region us-east-2 \
            --profile bio-rad-dev \
            /tmp/response-$ts.json > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "  ✅ Successfully invoked for $ts"
            
            # Delete the JSON file from S3 root to prevent duplicate processing
            aws s3 rm s3://order-vision-ai-dev/$ts.json --profile bio-rad-dev --region us-east-2 > /dev/null 2>&1
            echo "  🗑️  Removed $ts.json from queue"
        else
            echo "  ❌ Failed to invoke for $ts"
        fi
    else
        echo "  ⚠️  Could not find metadata for $ts"
    fi
    
    echo ""
    sleep 2  # Small delay between invocations
done

echo "=== Processing Complete ==="
echo ""
echo "Checking results in 30 seconds..."
sleep 30

echo ""
echo "=== Verification ==="
for ts in "${timestamps[@]}"; do
    echo "Checking $ts:"
    aws s3 ls s3://order-vision-ai-dev/uploads/$ts/ --profile bio-rad-dev --region us-east-2 | grep -E "classification|processed" && echo "  ✅ Processed" || echo "  ⏳ Still processing..."
done
