#!/bin/bash

# Check if directory argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <directory>"
    echo "Example: $0 pdfs/india"
    exit 1
fi

# Get the input directory
INPUT_DIR="$1"

# Check if input directory exists
if [ ! -d "$INPUT_DIR" ]; then
    echo "Error: Directory '$INPUT_DIR' does not exist"
    exit 1
fi

# Create output directory within the input directory
OUTPUT_DIR="$INPUT_DIR/output"
mkdir -p "$OUTPUT_DIR"

echo "Processing files in directory: $INPUT_DIR"
echo "Output will be saved to: $OUTPUT_DIR"
echo "----------------------------------------"

# Counter for processed files
count=0

# Loop through all files in the input directory
for file in "$INPUT_DIR"/*; do
    # Skip if it's a directory
    if [ -d "$file" ]; then
        echo "Skipping directory: $(basename "$file")"
        continue
    fi
    
    # Skip if no files match the pattern
    if [ ! -e "$file" ]; then
        echo "No files found in directory"
        break
    fi
    
    # Get the filename without path
    filename=$(basename "$file")
    
    # Create output filename (replace extension with .json)
    output_filename="${filename%.*}.json"
    output_path="$OUTPUT_DIR/$output_filename"
    
    echo "Processing: $filename"
    echo "  -> Running: node index.mjs \"$file\""
    
    # Run index.mjs with the file and capture output
    if node index.mjs "$file" > "$output_path" 2>&1; then
        echo "  -> Saved output to: $output_path"
        ((count++))
    else
        echo "  -> Error processing $filename (output still saved to $output_path)"
        ((count++))
    fi
    
    echo ""
done

echo "----------------------------------------"
echo "Processing complete. Processed $count files."
echo "Output files saved in: $OUTPUT_DIR/"

# Now extract JSON strings from the output files
echo ""
echo "Extracting JSON strings from output files..."
if [ -x "./extract-json.sh" ]; then
    ./extract-json.sh "$OUTPUT_DIR"
else
    echo "Warning: extract-json.sh not found or not executable"
fi
