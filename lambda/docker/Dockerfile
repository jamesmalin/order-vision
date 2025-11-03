# Use the Node.js 22 Lambda base image
FROM public.ecr.aws/lambda/nodejs:22

WORKDIR /var/task

# Copy package files
COPY package*.json ${LAMBDA_TASK_ROOT}

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy the application code
COPY index.mjs ${LAMBDA_TASK_ROOT}

# Command to run the Lambda function
CMD ["index.handler"]
