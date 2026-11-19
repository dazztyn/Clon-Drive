import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';

const config = {
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// LocalStack no resuelve buckets como subdominio, por eso path style
export const s3 = new S3Client({ ...config, forcePathStyle: true });
export const sqs = new SQSClient(config);

export const BUCKET = process.env.S3_BUCKET;
export const QUEUE_URL = process.env.SQS_QUEUE_URL;
