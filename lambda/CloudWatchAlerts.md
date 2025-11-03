# POST AS MESSAGE

## STEP 1
To the right of a channel -> Workflows
OR:
- Go to https://flow.microsoft.com
- Or use the "Workflows" app inside Microsoft Teams

2. Create New → Instant Cloud Flow
- Name it: CloudWatchAlertToTeams
- Choose trigger: When an HTTP request is received

Define the JSON Schema
```json
{
  "type": "object",
  "properties": {
    "lambda": { "type": "string" },
    "environment": { "type": "string" },
    "message": { "type": "string" },
    "alarmName": { "type": "string" },
    "severity": { "type": "string" }
  }
}
```

## OPTION 1: POST MESSAGE

Add Action: Post message in Teams
Channel
Post a message in a chat or channel
Post as: Flowbot (if public) or User (if private)

```json
🚨 Alert Triggered:
- Lambda: @{triggerBody()?['lambda']}
- Environment: @{triggerBody()?['environment']}
- Alarm: @{triggerBody()?['alarmName']}
- Severity: @{triggerBody()?['severity']}
- Message: @{triggerBody()?['message']}
```

## OPTION 2: POST ADAPTIVE CARD

Add Action: Post card in a Chat or Channel
Channel
Post a message in a chat or channel
Post as: Flowbot (if public) or User (if private)

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "Hi <at>James Malin</at>",
    },
    {
      "type": "TextBlock",
      "text": "🚨 Alert Triggered:",
      "weight": "bolder",
      "size": "medium"
    },
    {
      "type": "TextBlock",
      "text": "Lambda: @{triggerBody()?['lambda']}",
      "color": "default"
    },
    {
      "type": "TextBlock",
      "text": "Environment: @{triggerBody()?['environment']}",
      "color": "default"
    },
    {
      "type": "TextBlock",
      "text": "Alarm: @{triggerBody()?['alarmName']}",
      "color": "default"
    },
    {
      "type": "TextBlock",
      "text": "Severity: @{triggerBody()?['severity']}",
      "color": "@{if(equals(triggerBody()?['severity'], 'High'), 'attention', if(equals(triggerBody()?['severity'], 'Medium'), 'warning', 'good'))}"
    },
    {
      "type": "TextBlock",
      "text": "Message: @{triggerBody()?['message']}",
      "wrap": true
    }
  ],
  "msteams": {
    "entities": [
      {
          "type": "mention",
          "text": "<at>James Malin</at>",
          "mentioned": {
            "id": "james_malin@bio-rad.com",
            "name": "James Malin"
          }
      }
    ]
  }
}
```

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "🚨 CloudWatch Alert",
      "weight": "bolder",
      "size": "large",
      "wrap": true
    },
    {
      "type": "Container",
      "style": "@{if(equals(triggerBody()?['severity'], 'High'), 'attention', if(equals(triggerBody()?['severity'], 'Medium'), 'warning', 'good'))}",
      "bleed": true,
      "items": [
        {
          "type": "TextBlock",
          "text": "Severity: @{triggerBody()?['severity']}",
          "weight": "bolder",
          "wrap": true,
          "spacing": "small"
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Lambda",      "value": "@{triggerBody()?['lambda']}" },
        { "title": "Environment", "value": "@{triggerBody()?['environment']}" },
        { "title": "Alarm",       "value": "@{triggerBody()?['alarmName']}" }
      ]
    },
    {
      "type": "TextBlock",
      "text": "@{triggerBody()?['message']}",
      "wrap": true
    }
  ],
"msteams": {
    "entities": [
      {
          "type": "mention",
          "text": "<at>James Malin</at>",
          "mentioned": {
            "id": "james_malin@bio-rad.com",
            "name": "James Malin"
          }
      }
    ]
  }
}
```

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "Hi <at>Mention</at>",
    },
    {
      "type": "TextBlock",
      "text": "🚨 CloudWatch Alert",
      "weight": "bolder",
      "size": "large",
      "wrap": true
    },
    {
      "type": "Container",
      "style": "@{if(equals(triggerBody()?['severity'], 'High'), 'attention', if(equals(triggerBody()?['severity'], 'Medium'), 'warning', 'good'))}",
      "bleed": true,
      "items": [
        {
          "type": "TextBlock",
          "text": "Severity: @{triggerBody()?['severity']}",
          "weight": "bolder",
          "wrap": true,
          "spacing": "small"
        }
      ]
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Lambda",      "value": "@{triggerBody()?['lambda']}" },
        { "title": "Environment", "value": "@{triggerBody()?['environment']}" },
        { "title": "Alarm",       "value": "@{triggerBody()?['alarmName']}" }
      ]
    },
    {
      "type": "TextBlock",
      "text": "@{triggerBody()?['message']}",
      "wrap": true
    }
  ],
  "msTeams": {
    "entities": [
      {
          "type": "mention",
          "text": "<at>Mention</at>",
          "mentioned": {
            "mentionType": "Tag",
            "name": "dev"
          }
      }
    ]
  }
}
```

Save and get the post URL, add below:
```bash
curl -H "Content-Type: application/json" \
  -d '{
    "lambda": "Order Vision",
    "environment": "Development",
    "alarmName": "LambdaTimeout",
    "severity": "Low",
    "message": "Lambda exceeded timeout threshold at 2025-06-27T12:34Z"
  }' \
  "https://prod-26.westus.logic.azure.com:443/workflows/a6dc1e7f0b5d4765a4e7dae94358e321/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=SvC97DKeKHhm57YerMpqXLG6IoQAhkPApVtqMwxsu0w"
```