```bash
rm esker-ai.zip
rm -rf node_modules
npm ci --only=production
zip -r esker-ai.zip node_modules .env index.mjs invoke-auth.mjs anthropic.mjs extract-materials.mjs format-dates.mjs translate.mjs search.mjs search-material.mjs search-accountmanager.mjs search-customer.mjs knvp-check.mjs knvp.json credentials-documentai.json
```

# Search S3 Uploads by Metadata (Recommended)

Use the `order-vision-audit` Lambda function to search uploads by email metadata (Subject, From, To, Cc). This is more efficient than searching by filename since you typically don't know attachment names.

## Search by Subject (PROD)
```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"subject":"10000170911","limit":30}' \
    --profile bio-rad-prod \
    response.json && cat response.json | jq
```

## Search by Sender (DEV)
```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"from":"edman_cheng@bio-rad.com","limit":20}' \
    --profile bio-rad-dev \
    response.json && cat response.json | jq
```

## Search by Multiple Criteria (QA)
```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"subject":"HCPA","from":"diasam.com.br","limit":50}' \
    --profile bio-rad-qa \
    response.json && cat response.json | jq
```

See `lambda/audit/README.md` for full documentation.

---

# Legacy: Search by Filename (Old Method)

search last 10 for file prod:
```bash
TARGET="Ltd_UQ745786-CPQ25_Endorsed"
for d in $(aws s3 ls s3://order-vision-ai-prod/uploads/ --profile bio-rad-prod \
           | awk '/^ *PRE/ {gsub("/","",$2); print $2}' \
           | sort -nr | head -30); do
  aws s3 ls "s3://order-vision-ai-prod/uploads/$d/" --recursive --profile bio-rad-prod \
  | grep -F -- "$TARGET" \
  && echo "Found in: s3://order-vision-ai-prod/uploads/$d/"
done
```

if found:
```bash
aws s3 ls s3://order-vision-ai-prod/uploads/1759987419000/ --profile bio-rad-prod
```

dev:
```bash
TARGET="XXPO"
for d in $(aws s3 ls s3://order-vision-ai-dev/uploads/ --profile bio-rad-dev \
           | awk '/^ *PRE/ {gsub("/","",$2); print $2}' \
           | sort -nr | head -30); do
  aws s3 ls "s3://order-vision-ai-dev/uploads/$d/" --recursive --profile bio-rad-dev \
  | grep -F -- "$TARGET" \
  && echo "Found in: s3://order-vision-ai-dev/uploads/$d/"
done
```

aws s3 ls s3://order-vision-ai-dev/uploads/1759266538000/ --profile bio-rad-dev

qa:
```bash
TARGET="Invoice 950"
for d in $(aws s3 ls s3://order-vision-ai-qa/uploads/ --profile bio-rad-qa \
           | awk '/^ *PRE/ {gsub("/","",$2); print $2}' \
           | sort -nr | head -50); do
  aws s3 ls "s3://order-vision-ai-qa/uploads/$d/" --recursive --profile bio-rad-qa \
  | grep -F -- "$TARGET" \
  && echo "Found in: s3://order-vision-ai-qa/uploads/$d/"
done
```

XXPO.. found and processed

aws s3 ls s3://order-vision-ai-qa/uploads/1759904600000/ --profile bio-rad-qa
2025-10-07 23:23:55     280298 MailPdf20251008 022337.pdf
2025-10-07 23:23:57     133096 UQ666383-CPQ25-CUHK SLS-Alice Poon-Virtual Stock.pdf
2025-10-07 23:51:12        631 classification.json
2025-10-07 23:23:54        409 metadata.json
2025-10-07 23:50:50          0 processing.txt

doc187.. not found

aws s3 ls s3://order-vision-ai-qa/uploads/1759904548000/ --profile bio-rad-qa
2025-10-07 23:23:10     463600 2025-10-08 Bio-Rad_UQ721483-CPQ25.pdf
2025-10-07 23:23:12     312765 MailPdf20251008 022249.pdf
2025-10-07 23:49:10        599 classification.json
2025-10-07 23:23:09        392 metadata.json
2025-10-07 23:48:51          0 processing.txt


```bash
aws s3api list-objects-v2 --bucket "order-vision-ai-dev" --query 'sort_by(Contents, &LastModified)[]' --output=text --max-items=10 --profile=bio-rad-dev

aws s3api list-objects-v2 \
  --bucket order-vision-ai-dev \
  --profile bio-rad-dev \
  --prefix "uploads/" \
  --output text --query 'Contents[].Key' \
| tr '\t' '\n' \
| grep -vE '^(/)'

BUCKET="order-vision-ai-dev"
PREFIX="uploads/"
PROFILE="bio-rad-dev"
COUNT=10

aws s3api list-objects-v2 \
  --bucket "$BUCKET" \
  --prefix "$PREFIX" \
  --profile "$PROFILE" \
  --query 'Contents[].[LastModified,Key]' \
  --output text \
| sort -r \
| awk -F'\t' -v pfx="$PREFIX" -v limit="$COUNT" '
    {
      key=$2
      if (index(key,pfx)==1) {
        n=split(key,a,"/")
        d=a[2]
        if (d != "" && !seen[d]++) {
          print "s3://'$BUCKET'/" pfx d "/"
          if (++out==limit) exit
        }
      }
    }'
```

search last 10 for file qa:
```bash
TARGET="PO 090325_2.pdf"
for d in $(aws s3 ls s3://order-vision-ai-qa/uploads/ --profile bio-rad-qa \
           | awk '/^ *PRE/ {gsub("/","",$2); print $2}' \
           | sort -nr | head -10); do
  aws s3 ls "s3://order-vision-ai-qa/uploads/$d/" --recursive --profile bio-rad-qa \
  | grep -F -- "$TARGET" \
  && echo "Found in: s3://order-vision-ai-qa/uploads/$d/"
done
```

if found:
```bash
aws s3 ls s3://order-vision-ai-qa/uploads/1757007538000/ --profile bio-rad-qa
```


curl https://api.openai.com/v1/responses   -H "Authorization: Bearer $OPENAI_API_KEY"   -H "Content-Type: application/json"   -d '{
    "model": "o3-deep-research",
    "input": "Research the economic impact of semaglutide on global healthcare systems. Include specific figures, trends, statistics, and measurable outcomes. Prioritize reliable, up-to-date sources: peer-reviewed research, health organizations (e.g., WHO, CDC), regulatory agencies, or pharmaceutical earnings reports. Include inline citations and return all source metadata. Be analytical, avoid generalities, and ensure that each section supports data-backed reasoning that could inform healthcare policy or financial modeling.",
    "tools": [
      { "type": "web_search_preview" },
      { "type": "code_interpreter", "container": { "type": "auto" } }
    ]
  }'


# Update function
DEV
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name esker-ai \
    --zip-file fileb://esker-ai.zip \
    --profile bio-rad-dev
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name esker-ai \
    --profile bio-rad-dev
```

"OPENAI_API_KEY": "",
```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name esker-ai \
    --environment "Variables={\
PINECONE_ENVIRONMENT=DEV,\
NAMESPACE=address_v5_qa_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-test-2,\
ADDRESS_MODEL=o3-mini-test,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://invoicew2-dev.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-dev
```

```bash
aws secretsmanager create-secret \
    --name AzureOrderVisionOpenAIKey \
    --secret-string '{"AzureOpenAIKey":""}' \
    --region us-east-2 \
    --profile bio-rad-dev
```

```bash
log_stream_name=$(aws logs describe-log-streams \
    --log-group-name "/aws/lambda/esker-ai" \
    --order-by "LastEventTime" \
    --descending \
    --limit 1 \
    --region us-east-2 \
    --profile bio-rad-dev | jq -r '.logStreams[0].logStreamName')

aws logs get-log-events \
    --log-group-name "/aws/lambda/esker-ai" \
    --log-stream-name "$log_stream_name" \
    --limit 1 \
    --region us-east-2 \
    --profile bio-rad-dev > last-log.json
```

PROD
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-ai \
    --zip-file fileb://esker-ai.zip \
    --profile bio-rad-prod
```

Description
-
Memory
1024MB
Ephemeral storage
512MB
Timeout
5min0sec
SnapStartInfo
None

ENV VARIABLES:
AWS: true
AWS_LAMBDA_REGION: us-east-2
AZURE: true
AZURE_INVOICE_PARSER_ENDPOINT: https://invoicew2-dev.cognitiveservices.azure.com/
NAMESPACE: address_v4_prod_adrc
VARIATION: address_v4_prod_adrc


# API Gateway
Integration Request: application/pdf
```bash
#set($inputRoot = $input.path('$'))
{
    "body": "$input.body",
    "headers": {
        "Content-Type": "$input.params('Content-Type')",
        "Authorization": "$input.params('Authorization')"
    }
}
```

Integration Response: application/json
```bash
#set($inputRoot = $input.path('$'))
$inputRoot.body
```

## DEV / QA
```bash
curl --request POST -H 'Authorization: EEEmoY9FshUl6j2Ec7mRTlP9t/h+p36T1fBptOM0aMQ=' -H "Content-Type: application/pdf" --data-binary "@./qa_testing/br.pdf" https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/esker-ai > API-response.json
```

```bash
curl --request POST -H 'Authorization: EEEmoY9FshUl6j2Ec7mRTlP9t/h+p36T1fBptOM0aMQ=' -H "Content-Type: application/pdf" --data-binary "@./us_testing/1000135_UNIV OF ALABAMA-BIRMINGHAM/1000_1007454605_2448622_1000135_1081433.pdf" https://dev.git-api.bio-rad.com/esker-ai > API-response.json
```

curl --request POST -H "Content-Type: application/pdf" https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/manual-search -d '{"query":"What is the setup process for QX600"}'

curl --request POST -H 'Authorization: EEEmoY9FshUl6j2Ec7mRTlP9t/h+p36T1fBptOM0aMQ=' -H "Content-Type: application/pdf" --data-binary "@./PO samples from China/OR0000001379.pdf" https://zhbir233dr2hrt77vifiqk33py0gamev.lambda-url.us-east-2.on.aws/ > API-response.json


## PROD
```bash
curl --request POST -H 'Authorization: y1YSEsBJ8dF75Zi310kgnSkSjSZVrYgny2RIeeG9NVM=' -H "Content-Type: application/pdf" --data-binary "@./qa_testing/OR0000001507.pdf" https://uhblzkapr2.execute-api.us-east-2.amazonaws.com/prod/esker-ai > API-response.json
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-ai \
    --profile bio-rad-prod
```

"OPENAI_API_KEY": "",
```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-ai \
    --environment "Variables={\
PINECONE_ENVIRONMENT=PROD,\
NAMESPACE=address_v4_prod_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-2,\
ADDRESS_MODEL=o3-mini,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://order-vision.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-prod
```

curl --request POST -H 'Authorization: y1YSEsBJ8dF75Zi310kgnSkSjSZVrYgny2RIeeG9NVM=' -H "Content-Type: application/pdf" --data-binary "@./PO samples from China/OR0000001379.pdf" https://gl72limcq4k5pusgqtb3zrafna0ariqs.lambda-url.us-east-2.on.aws/ > API-response.json


Note: Vision API is not a good option at this time (09/05/2024)
https://platform.openai.com/docs/guides/vision
Non-English: The model may not perform optimally when handling images with text of non-Latin alphabets, such as Japanese or Korean.


DEV CHECK:
7900009394.PDF - abbott - good
7900009394_english.pdf - abbott - good
79008271 伯瑞FOR元英.pdf (Berui FOR Yuan Ying) - beckman - good
79008271_English.pdf - beckman - better
70783391_0C-RBX939-K0.pdf - Chang Gung Memorial Hospital - better
70783391_english.pdf - Chang Gung Memorial Hospital - good
V70783391.pdf - shing quang - better
V70783391_eng.pdf - shing quang - good
TS_70783391_20240805092156.PDF - mackay - good
TS_70783391_20240805092156_eng.PDF - mackay - no results? -- This is actually correct; there is no address


IF-240807-03 彰基003624 003614 004134 各15組.pdf - in fung - good
IF-240807-03_eng.pdf - in fung - okay - revisit


Could not be translated with Google Translate (scanned PDFs):
BRA-24080075.pdf - Bill Fang - Missing Address Data
NTL.pdf - Dolly Chang - Missing Address Data


Missing address data:
Order_A1381770_20240820091213.PDF
Order_A1381770_20240820091213_eng.PDF



QA Testing Feedback:
https://biorad-my.sharepoint.com/:x:/g/personal/ikhan_global_bio-rad_com/EUBdBvfoFwxDsngoABz7Na0B-PmSZsetsQ1valfxkjovvg?e=UDPrUV

https://biorad.sharepoint.com/sites/APACB2BProject/Shared%20Documents/Forms/AllItems.aspx?ct=1733345269045&or=Teams%2DHL&ga=1&LOF=1&id=%2Fsites%2FAPACB2BProject%2FShared%20Documents%2FTemplates%2FTemplate%20Samples%20Provided%20to%20BRC%20Team%2FChina%2FSample%20PDF%20Contract%20and%20csv%20Order%20Files%2FSamples%20for%20AI%20OCR%2FVolume%20Based%20Testing%2FSorg%203002%20China&viewid=d039ceef%2D0c41%2D4be4%2Dac4b%2D13b923ac3a29


Run first to find:
```bash
aws logs filter-log-events --log-group-name "/aws/lambda/esker-ai" \
    --filter-pattern "BRW24-066SHAG-BP" \
    --start-time $(date -v -12H +%s)000 \
    --max-items 1 \
    --profile bio-rad-dev
```

aws logs filter-log-events --log-group-name "/aws/lambda/esker-ai" \
    --log-stream-names '2025/02/08/[$LATEST]57bab52ceba94650b31c7ac9e0acae37' \
    --start-time $(date -v -12H +%s)000 \
    --region us-east-2 --profile bio-rad-dev > log.json

With timestamps (not really needed and harder to read):
aws logs filter-log-events --log-group-name "/aws/lambda/esker-ai" \
    --log-stream-names '2025/02/08/[$LATEST]57bab52ceba94650b31c7ac9e0acae37' \
    --start-time $(date -v -12H +%s)000 \
    --region us-east-2 --profile bio-rad-dev | jq -r '.events[].message' > log.json

Best for getting the specific log out (may contain multiple so double check):
aws logs filter-log-events --log-group-name "/aws/lambda/esker-ai" \
    --log-stream-names '2025/02/08/[$LATEST]7b320df57eb04608ae766e4e2f14743a' \
    --start-time $(date -v -72H +%s)000 \
    --region us-east-2 --profile bio-rad-dev | jq -r '.events[].message | sub("^[^\\t]+\\t[^\\t]+\\tINFO\\t"; "")' > log.json

Before for getting the specific log and the nearest start and end:
```bash
aws logs filter-log-events --log-group-name "/aws/lambda/esker-ai" \
    --log-stream-names '2025/02/11/[$LATEST]07a241cf8949482fb512aaf8caab05b6' \
    --start-time $(date -v -12H +%s)000 \
    --region us-east-2 --profile bio-rad-dev | jq -r '.events[].message | sub("^[^\\t]+\\t[^\\t]+\\tINFO\\t"; "")' | \
    awk '
        /START RequestId/ { current_request=$2; buffer=""; capture_start=NR; }  # Track START, but don’t print yet
        { buffer = buffer $0 "\n"; }  # Store all lines in a buffer
        /BRW24-066SHAG-BP/ { found=1; start_line=capture_start; }  # Mark when pattern is found, set start line
        /END RequestId/ && found {  # Once we find END matching the request
            if (NR >= start_line) { print buffer; }  # Print only relevant section
            exit;
        }
    ' > log.json
```

combined:
```bash
filter_pattern="005JSHQ"
# profile_="bio-rad-prod"
# log_group="/aws/lambda/order-vision-ai"
profile_="bio-rad-dev"
log_group="/aws/lambda/esker-ai"
log_stream_name=$(aws logs filter-log-events --log-group-name $log_group \
    --filter-pattern "$filter_pattern" \
    --start-time $(date -v -1H +%s)000 \
    --max-items 1 \
    --profile $profile_ | jq -r '.events[0].logStreamName')

aws logs filter-log-events --log-group-name $log_group \
    --log-stream-names "$log_stream_name" \
    --start-time $(date -v -1H +%s)000 \
    --region us-east-2 --profile $profile_ | jq -r '.events[].message | sub("^[^\\t]+\\t[^\\t]+\\tINFO\\t"; "")' | \
    awk '
        /START RequestId/ { current_request=$2; buffer=""; capture_start=NR; }  # Track START, but don’t print yet
        { buffer = buffer $0 "\n"; }  # Store all lines in a buffer
        /'"$filter_pattern"'/ { found=1; start_line=capture_start; }  # Mark when pattern is found, set start line
        /END RequestId/ && found {  # Once we find END matching the request
            if (NR >= start_line) { print buffer; }  # Print only relevant section
            exit;
        }
    ' > log.json
```

combined -- get latest:
```bash
filter_pattern="BRW25"
profile_="bio-rad-prod"
log_group="/aws/lambda/order-vision-ai"
start_time=$(date -v -2H +%s)000
log_stream_name=$(aws logs filter-log-events --log-group-name $log_group \
    --filter-pattern "$filter_pattern" \
    --start-time $start_time \
    --profile $profile_ | jq -r '.events | last | .logStreamName')

aws logs filter-log-events --log-group-name $log_group \
    --log-stream-names "$log_stream_name" \
    --start-time $start_time \
    --region us-east-2 --profile $profile_ | jq -r '.events[].message | sub("^[^\\t]+\\t[^\\t]+\\tINFO\\t"; "")' | \
    awk '
        /START RequestId/ { current_request=$2; buffer=""; capture_start=NR; }
        { buffer = buffer $0 "\n"; }
        /'"$filter_pattern"'/ { found=1; start_line=capture_start; }
        /END RequestId/ && found {
            if (NR >= start_line) { print buffer; }
            exit;
        }
    ' > log.json
```

Note: 1m is month; 1M is minute

TODAY UTC TIME
```bash
filter_pattern="23121162"
# profile_="bio-rad-prod"
# log_group="/aws/lambda/order-vision-ai"
profile_="bio-rad-dev"
log_group="/aws/lambda/esker-ai"
# log_group="/aws/lambda/ai-order"
start_time=$(date -v -48H +%s)000
log_stream_name=$(aws logs filter-log-events --log-group-name $log_group \
    --filter-pattern "$filter_pattern" \
    --start-time $start_time \
    --profile $profile_ | jq -r '.events | last | .logStreamName')

aws logs filter-log-events --log-group-name $log_group \
    --log-stream-names "$log_stream_name" \
    --start-time $start_time \
    --region us-east-2 --profile $profile_ | jq -r '.events[].message' | \
    awk '
        /START RequestId/ { current_request=$2; buffer=""; capture_start=NR; }
        { buffer = buffer $0 "\n"; }
        /'"$filter_pattern"'/ { found=1; start_line=capture_start; }
        /END RequestId/ && found {
            if (NR >= start_line) { print buffer; }
            exit;
        }
    ' > log.json
```

Known limitations by AWS team with this (prob don't use):
aws logs get-log-events --log-group-name "/aws/lambda/esker-ai" \
    --log-stream-name '2025/02/08/[$LATEST]57bab52ceba94650b31c7ac9e0acae37' \
    --region us-east-2 --profile bio-rad-dev > log.json


```bash
PROJECT_ID=
MODEL_ID=
curl \
  -X POST \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/${MODEL_ID}:streamGenerateContent" -d \
  $'{
    "contents": {
      "role": "user",
      "parts": [
        {
        "fileData": {
          "mimeType": "image/png",
          "fileUri": "gs://generativeai-downloads/images/scones.jpg"
          }
        },
        {
          "text": "Describe this picture."
        }
      ]
    }
  }'
```
