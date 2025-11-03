import boto3
import json
import os
from botocore.exceptions import ClientError
from openai import AzureOpenAI
from pinecone import Pinecone

def get_secret_key(secret_name, region_name="us-west-2"):
    """
    Retrieve a secret key from AWS Secrets Manager.

    :param secret_name: Name of the secret in AWS Secrets Manager
    :param region_name: AWS region where the secret is stored (defaults to us-west-2)
    :return: The parsed secret value as a dictionary
    :raises: Exception if secret cannot be retrieved
    """
    client = boto3.client('secretsmanager', region_name=region_name)

    try:
        response = client.get_secret_value(SecretId=secret_name)
        if 'SecretString' in response:
            # Parse the JSON string into a dictionary
            return json.loads(response['SecretString'])
        elif 'SecretBinary' in response:
            # Handle binary secrets if needed
            return json.loads(response['SecretBinary'])
        else:
            raise ValueError("Secret value not found in response")
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        raise Exception(f"Failed to retrieve secret: {error_code} - {error_message}")
    except json.JSONDecodeError as e:
        raise Exception(f"Failed to parse secret value as JSON: {str(e)}")
    except Exception as e:
        raise Exception(f"Unexpected error retrieving secret: {str(e)}")

# Initialize Azure OpenAI Client with Entra ID Authentication
api_version = "2024-05-01-preview"
embedding_endpoint = "https://tech-dev-ai.openai.azure.com/openai/deployments/text-embedding-3-large/embeddings?api-version=2023-05-15"

gpt_deployment_name = "gpt-4o-2"
gpt_endpoint = "https://tech-dev-ai.openai.azure.com/"


# Get subscription key from environment variable or AWS Secrets Manager
subscription_key = os.environ.get('AZURE_OPENAI_KEY') or get_secret_key('azure-openai-key').get('key')


gpt_client = AzureOpenAI(
    azure_endpoint=gpt_endpoint,
    api_key=subscription_key, 
    api_version=api_version,
)

embedding_client = AzureOpenAI(
    azure_endpoint=embedding_endpoint,
    api_key=subscription_key, 
    api_version=api_version,
)

# Initialize Pinecone
# Get Pinecone API key from environment variable or AWS Secrets Manager
pinecone_api_key = os.environ.get('PINECONE_API_KEY') or get_secret_key('pinecone-api-key').get('key')
pinecone_client = Pinecone(api_key=pinecone_api_key)
index = pinecone_client.Index(name='report-catalog')

def generate_query_embedding(text):
    response = embedding_client.embeddings.create(
        model="text-embedding-3-large",
        input=text
    )
    return response.data[0].embedding

def search_similar_texts(query_embedding):
    results = index.query(vector=query_embedding, top_k=5, include_metadata=True)
    print(results)
    if results and 'matches' in results:
        return results['matches']
    else:
        print("No valid results received.")
    return []

def generate_response_with_gpt(query_text, metadata_list):
    # Create the initial message with system instructions
    messages = [
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "You are an assistant that answers questions based on the provided context. "
                        "Format your answer in simple HTML without the initial <html> tag for readability on Microsoft Teams. "
                        "Include links to relevant PDFs using <a> tags if available from the given context. "
                        "If the answer cannot be found in the context, just return 'No results found in the report catalog. For further assistance, please contact support.'"
                    )
                }
            ]
        }
    ]

    # Prepare the user message that includes the query and context
    context_texts = []

    for metadata in metadata_list:
        # Use 'text' if 'content' is missing
        content = metadata.get('content') or metadata.get('text', '')

        # Prefer page_title or fallback to attribute_name or file
        title = metadata.get('page_title') or metadata.get('attribute_name') or metadata.get('file', 'Unknown Title')
        url = metadata.get('url', '')

        if url:
            formatted_content = f"Title: {title}. URL: <a href='{url}'>{url}</a>. Content: {content}"
        else:
            formatted_content = f"Title: {title}. Content: {content}"

        context_texts.append(formatted_content)


    # Create a single user message combining the query and context
    combined_content = f"User query: {query_text}\n\nContext:\n" + "\n\n".join(context_texts)
    messages.append({"role": "user", "content": combined_content})

    # Generate the response using GPT-4
    response = gpt_client.chat.completions.create(
        model=gpt_deployment_name,
        messages=messages,
        temperature=0.7,
        top_p=0.95,
        frequency_penalty=0,
        presence_penalty=0,
        stream=False
    )

    response_content = response.choices[0].message.content.strip()

    return response_content

def handle_query(event, context):
    try:
        body = json.loads(event.get('body', '{}'))
        query_text = body.get('query')
        if not query_text:
            return {
                'statusCode': 400,
                'body': json.dumps({'response': 'Query text is required.'})
            }

        query_embedding = generate_query_embedding(query_text)
        search_results = search_similar_texts(query_embedding)

        if not search_results:
            return {
                'statusCode': 404,
                'body': json.dumps({'response': 'No results found in the report catalog. For further assistance, please contact support.'})
            }

        metadata_list = [result['metadata'] for result in search_results]
        formatted_response = generate_response_with_gpt(query_text, metadata_list)

        return {
            'statusCode': 200,
            'body': json.dumps({'response': formatted_response})
        }

    except Exception as e:
        print(f"An error occurred: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'response': str(e)})
        }

# AWS Lambda handler
def lambda_handler(event, context):
    return handle_query(event, context)
