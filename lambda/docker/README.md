```bash
docker build --platform linux/arm64 -t order-iq .
```

```bash
curl --request POST -H "Accept: application/xml" -H "Content-Type: application/xml" -H "Authorization: " --data-binary "@./request.xml" http://devp2dap00.global.bio-rad.com:80/RESTAdapter/GetOrderDetails > response.xml
```

```bash
curl --request POST -H 'Authorization: EEEmoY9FshUl6j2Ec7mRTlP9t/h+p36T1fBptOM0aMQ=' -H "Content-Type: application/json" -d '{"salesOrder":1001347787,"prompt":"Give an overview of the order."}' https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/order-iq > API-response.json
```

## DEV

Push to ECR
```bash
aws ecr get-login-password --region us-east-2 --profile bio-rad-dev | docker login --username AWS --password-stdin 614250372661.dkr.ecr.us-east-2.amazonaws.com
docker tag order-iq:latest 614250372661.dkr.ecr.us-east-2.amazonaws.com/emerging-tech:order-iq-v1
docker push 614250372661.dkr.ecr.us-east-2.amazonaws.com/emerging-tech:order-iq-v1
```

aws ecr describe-images --region us-east-2 --profile bio-rad-dev --repository-name emerging-tech --image-ids imageTag=order-iq-v1


Create Lambda Function & Function URL:
```bash
aws lambda create-function \
    --region us-east-2 \
    --function-name order-iq \
    --code ImageUri=614250372661.dkr.ecr.us-east-2.amazonaws.com/emerging-tech:order-iq-v1 \
    --role arn:aws:iam::614250372661:role/service-role/MLHanaDBAlgorithms-role-2fv5uqzs \
    --package-type Image \
    --timeout 30 \
    --architectures arm64 \
    --environment Variables="{ACCOUNT_ID=614250372661}" \
    --profile bio-rad-dev
```

Update Function Code:
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-iq \
    --image-uri 614250372661.dkr.ecr.us-east-2.amazonaws.com/emerging-tech:order-iq-v1 \
    --profile bio-rad-dev
```

```bash
aws lambda update-function-configuration \
  --function-name order-iq \
  --vpc-config SubnetIds=subnet-07ca66af0fc3a43c4,subnet-0ad3254e5108ebf14,SecurityGroupIds=sg-0fb9e948666766c56 \
  --profile bio-rad-dev
```

Delete Function Code:
```bash
aws lambda delete-function \
    --region us-east-2 \
    --function-name order-iq \
    --profile bio-rad-dev
```