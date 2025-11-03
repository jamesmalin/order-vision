#!/bin/bash

# Clear all items from the DynamoDB tracking table
echo "Clearing DynamoDB table: order-vision-tracking-dev"

# Get all items and delete them individually
aws dynamodb scan --table-name order-vision-tracking-dev --profile bio-rad-dev --region us-east-2 --output json > /tmp/dynamodb_items.json

# Extract items and delete them one by one
jq -r '.Items[] | @base64' /tmp/dynamodb_items.json | while read item; do
    echo "$item" | base64 --decode > /tmp/current_item.json
    
    timestamp=$(jq -r '.timestamp.N' /tmp/current_item.json)
    event_type=$(jq -r '.event_type.S' /tmp/current_item.json)
    
    if [ "$timestamp" != "null" ] && [ "$event_type" != "null" ]; then
        echo "Deleting item: timestamp=$timestamp, event_type=$event_type"
        aws dynamodb delete-item \
            --table-name order-vision-tracking-dev \
            --profile bio-rad-dev \
            --region us-east-2 \
            --key "{\"timestamp\":{\"N\":\"$timestamp\"},\"event_type\":{\"S\":\"$event_type\"}}"
    fi
done

# Clean up temporary files
rm -f /tmp/dynamodb_items.json /tmp/current_item.json

# Verify table is empty
count=$(aws dynamodb scan --table-name order-vision-tracking-dev --profile bio-rad-dev --region us-east-2 --select "COUNT" --output json | jq -r '.Count')
echo "Items remaining in table: $count"

if [ "$count" -eq 0 ]; then
    echo "✅ DynamoDB table cleared successfully"
else
    echo "⚠️  Warning: $count items still remain in the table"
fi
