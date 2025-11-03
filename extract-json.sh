#!/bin/bash

# Check if directory argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <output_directory>"
    echo "Example: $0 pdfs/india/genrpa/output"
    exit 1
fi

# Get the input directory
INPUT_DIR="$1"

# Check if input directory exists
if [ ! -d "$INPUT_DIR" ]; then
    echo "Error: Directory '$INPUT_DIR' does not exist"
    exit 1
fi

# Create output-final directory in the same parent directory as the input
PARENT_DIR=$(dirname "$INPUT_DIR")
OUTPUT_DIR="$PARENT_DIR/output-final"
mkdir -p "$OUTPUT_DIR"

echo "Processing JSON files in directory: $INPUT_DIR"
echo "Output will be saved to: $OUTPUT_DIR"
echo "----------------------------------------"

# Counter for processed files
count=0

# Loop through all JSON files in the input directory
for file in "$INPUT_DIR"/*.json; do
    # Skip if no files match the pattern
    if [ ! -e "$file" ]; then
        echo "No JSON files found in directory"
        break
    fi
    
    # Get the filename without path
    filename=$(basename "$file")
    
    # Create output file path
    output_path="$OUTPUT_DIR/$filename"
    
    echo "Processing: $filename"
    
    # Extract the second-to-last line (which contains the JSON string)
    # Use tail -2 to get last 2 lines, then head -1 to get the first of those (second-to-last)
    if tail -2 "$file" | head -1 > "$output_path"; then
        echo "  -> Extracted JSON string to: $output_path"
        ((count++))
    else
        echo "  -> Error processing $filename"
    fi
    
    echo ""
done

echo "----------------------------------------"
echo "Processing complete. Processed $count JSON files."
echo "Extracted JSON strings saved in: $OUTPUT_DIR/"
