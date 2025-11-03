This is for automation.

Step 1:
Initial post:
```json
{
  "CreatedOn": "2025-03-27T00:00:00.000Z",
  "EmailId": "",
  "Subject": "",
  "From": "",
  "To": [],
  "Cc": [],
  "Body": "",
  "Attachments": [
    {
      "AttachmentName": "ABC.PDF"
    },
    {
      "AttachmentName": "DEF.PDF"
    },
    {
      "AttachmentName": "GHI.PDF"
    }
  ]
}
```

Example Response:
```json
{
    "statusCode": 200,
    "body": [
        {
            "FileName": "ABC.pdf",
            "Url": "https://order-vision-ai-dev.s3.us-east-2.amazonaws.com/uploads/2025-03-27/3000216262%20%283000202914%29_1000%20US_LABORATORIO%20CLINICO%20IRIZARRY%20GUASCH_Agreement%23%2025302.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAY6BBM3Y23T3XUDR6%2F20250204%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250204T204002Z&X-Amz-Expires=604800&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEB0aCXVzLWVhc3QtMiJGMEQCIB60lkMQKhgx7tN%2FeN5O%2FFs2rZOjoQ7%2BPK92cxKXv55zAiAMYPGTnu8aaTCmprThoREZwMZ3ZKlYxUPHQ6iWcQarwSryAgg2EAEaDDYxNDI1MDM3MjY2MSIMIlBhsFNz0e%2F2XiKTKs8CmP2qMPb6t%2BTh6PBJPbfktvfs7pT1CSCPbZRJ7qN8xyAVXizDWxIqqAUoMbAco%2BAsKQVvO%2FXZRqYa3uXJlkKb8n6wsC0dZLbH%2BZ%2FWvgNz8aN%2BGM6JJ84DGQv%2FQ9DaVxcu4aa4bmuPk89KF0hg9QH1UAIRTBhrikoTqgTEVtcefdX0R2kLaA9kDfDzzTN9YvLysp%2F8Va6MZM1udeZv8w2rIc1AKqjwkUGD9fKz4Dm9nyyr9uumTi26dUH8ZSKlbbhJ94W0KUlUQq7oLYGiBSwC4wkGqHmulVRqaPEQSIF%2FmVNc2Y5JkJYDeI1J6o8Ov%2F1%2BEItEN6owLSnqOcSade1hydONXexR3wlrisZOvmWtBdjepzgJQqisAUCsti2WhskRpZVAYrxcj7h%2BFcfC4ICCqNVyj83cinb6IHbUOD%2FD4goJz8RJ4UVmXfZYceBqJjcwofaJvQY6nwGRPXPLx2PalUoS6b%2F5um2h0z3wktMhMJjFxcpGBH5vq8gMh%2FIg%2F0kO5DWphgjJp7%2FabHiIV6pSh32Y4md7VrMjq3He0M6dgX7GEQqVXDz5Ir8WhHl0%2FukqSpw5oRrUf5xJXsslWd3mZpVbFAAyyXgn8CHfnwOjVCO5UGbsyGe%2BYQ7tYWYJZdUk05zjKAX78EzrJYvrrHSGPScvBxxPPmg%3D&X-Amz-Signature=cf47c2425397ed1e8b3eb415be149b12cac50732eb38c25d50225fc9d1d16ab5&X-Amz-SignedHeaders=host&x-id=PutObject",
            "FileKey": "uploads/2025-03-27/ABC.pdf"
        },
        {
            "FileName": "DEF.pdf",
            "Url": "https://order-vision-ai-dev.s3.us-east-2.amazonaws.com/uploads/2025-03-27/3000216262_1000%20US_LABORATORIO%20CLINICO%20IRIZARRY%20GUASCH_IAF.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAY6BBM3Y23T3XUDR6%2F20250204%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250204T204002Z&X-Amz-Expires=604800&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEB0aCXVzLWVhc3QtMiJGMEQCIB60lkMQKhgx7tN%2FeN5O%2FFs2rZOjoQ7%2BPK92cxKXv55zAiAMYPGTnu8aaTCmprThoREZwMZ3ZKlYxUPHQ6iWcQarwSryAgg2EAEaDDYxNDI1MDM3MjY2MSIMIlBhsFNz0e%2F2XiKTKs8CmP2qMPb6t%2BTh6PBJPbfktvfs7pT1CSCPbZRJ7qN8xyAVXizDWxIqqAUoMbAco%2BAsKQVvO%2FXZRqYa3uXJlkKb8n6wsC0dZLbH%2BZ%2FWvgNz8aN%2BGM6JJ84DGQv%2FQ9DaVxcu4aa4bmuPk89KF0hg9QH1UAIRTBhrikoTqgTEVtcefdX0R2kLaA9kDfDzzTN9YvLysp%2F8Va6MZM1udeZv8w2rIc1AKqjwkUGD9fKz4Dm9nyyr9uumTi26dUH8ZSKlbbhJ94W0KUlUQq7oLYGiBSwC4wkGqHmulVRqaPEQSIF%2FmVNc2Y5JkJYDeI1J6o8Ov%2F1%2BEItEN6owLSnqOcSade1hydONXexR3wlrisZOvmWtBdjepzgJQqisAUCsti2WhskRpZVAYrxcj7h%2BFcfC4ICCqNVyj83cinb6IHbUOD%2FD4goJz8RJ4UVmXfZYceBqJjcwofaJvQY6nwGRPXPLx2PalUoS6b%2F5um2h0z3wktMhMJjFxcpGBH5vq8gMh%2FIg%2F0kO5DWphgjJp7%2FabHiIV6pSh32Y4md7VrMjq3He0M6dgX7GEQqVXDz5Ir8WhHl0%2FukqSpw5oRrUf5xJXsslWd3mZpVbFAAyyXgn8CHfnwOjVCO5UGbsyGe%2BYQ7tYWYJZdUk05zjKAX78EzrJYvrrHSGPScvBxxPPmg%3D&X-Amz-Signature=f294f38d1a5355dc46363153fc44668906290629ee4256e62c6144e309829e88&X-Amz-SignedHeaders=host&x-id=PutObject",
            "FileKey": "uploads/2025-03-27/DEF.pdf"
        },
        {
            "FileName": "GHI.pdf",
            "Url": "https://order-vision-ai-dev.s3.us-east-2.amazonaws.com/uploads/2025-03-27/3000216262_1000%20US_LABORATORIO%20CLINICO%20IRIZARRY%20GUASCH_Renewal%20Agreement.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAY6BBM3Y23T3XUDR6%2F20250204%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250204T204002Z&X-Amz-Expires=604800&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEB0aCXVzLWVhc3QtMiJGMEQCIB60lkMQKhgx7tN%2FeN5O%2FFs2rZOjoQ7%2BPK92cxKXv55zAiAMYPGTnu8aaTCmprThoREZwMZ3ZKlYxUPHQ6iWcQarwSryAgg2EAEaDDYxNDI1MDM3MjY2MSIMIlBhsFNz0e%2F2XiKTKs8CmP2qMPb6t%2BTh6PBJPbfktvfs7pT1CSCPbZRJ7qN8xyAVXizDWxIqqAUoMbAco%2BAsKQVvO%2FXZRqYa3uXJlkKb8n6wsC0dZLbH%2BZ%2FWvgNz8aN%2BGM6JJ84DGQv%2FQ9DaVxcu4aa4bmuPk89KF0hg9QH1UAIRTBhrikoTqgTEVtcefdX0R2kLaA9kDfDzzTN9YvLysp%2F8Va6MZM1udeZv8w2rIc1AKqjwkUGD9fKz4Dm9nyyr9uumTi26dUH8ZSKlbbhJ94W0KUlUQq7oLYGiBSwC4wkGqHmulVRqaPEQSIF%2FmVNc2Y5JkJYDeI1J6o8Ov%2F1%2BEItEN6owLSnqOcSade1hydONXexR3wlrisZOvmWtBdjepzgJQqisAUCsti2WhskRpZVAYrxcj7h%2BFcfC4ICCqNVyj83cinb6IHbUOD%2FD4goJz8RJ4UVmXfZYceBqJjcwofaJvQY6nwGRPXPLx2PalUoS6b%2F5um2h0z3wktMhMJjFxcpGBH5vq8gMh%2FIg%2F0kO5DWphgjJp7%2FabHiIV6pSh32Y4md7VrMjq3He0M6dgX7GEQqVXDz5Ir8WhHl0%2FukqSpw5oRrUf5xJXsslWd3mZpVbFAAyyXgn8CHfnwOjVCO5UGbsyGe%2BYQ7tYWYJZdUk05zjKAX78EzrJYvrrHSGPScvBxxPPmg%3D&X-Amz-Signature=69fb29f2e90a8547c969c6b88c909ba2beb92b8acbee7f9c79a8e5d35d6ae79d&X-Amz-SignedHeaders=host&x-id=PutObject",
            "FileKey": "uploads/2025-03-27/GHI.pdf"
        }
    ]
}
```

Loop through each from the response and upload:
```bash
curl --request PUT \
  --upload-file "GHI.pdf" \
  --header "Content-Type: application/octet-stream" \
  "Url"
```

Step 2:
AI Classification & Processing

Step 3:
PI will need to create an endpoint to receive a POST request from AWS
