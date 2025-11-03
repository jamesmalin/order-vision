#!/bin/bash

# Check if directory path is provided
if [ $# -eq 0 ]; then
    echo "Please provide a directory path"
    exit 1
fi

directory="$1"
rerun="${2:-false}"  # Second parameter defaults to false if not provided

# Check if directory exists
if [ ! -d "$directory" ]; then
    echo "Directory $directory does not exist"
    exit 1
fi

# Find all PDF files in the directory and process them
find "$directory" -type f -name "*.pdf" | while read -r filePath; do
    # Create full output directory path
    outputPath="output/${filePath}"
    outputDir=$(dirname "$outputPath")
    outputFile="${outputPath}.json"
    
    # Skip if output exists and rerun is false
    if [ -f "$outputFile" ] && [ "$rerun" = "false" ]; then
        echo "Skipping (already processed): $filePath"
        continue
    fi
    
    echo "Processing: $filePath"
    mkdir -p "$outputDir"
    
    # Process file and output to output directory
    node index.mjs "$filePath" > "$outputFile"
done
