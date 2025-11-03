import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({ region: "us-east-2" });

export async function invokeAuth(event) {
  try {
    // Extract the Authorization header
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    // Prepare the payload for the auth Lambda
    const payload = JSON.stringify({ headers: { Authorization: authHeader } });

    // Call the auth Lambda function
    const command = new InvokeCommand({
      FunctionName: "lambda-auth",
      Payload: Buffer.from(payload),
    });

    const response = await lambda.send(command);
    const authResult = JSON.parse(Buffer.from(response.Payload).toString());

    // Check if authorization was denied
    if (!authResult || !authResult.policyDocument || authResult.policyDocument.Statement[0].Effect !== "Allow") {
      throw new Error("Unauthorized");
    }

    return authResult; // Return auth context if needed
  } catch (error) {
    console.error("Auth check failed:", error);
    throw error; // Let the caller handle errors
  }
}
