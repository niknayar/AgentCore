import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const BUCKET_NAME = process.env.BUCKET_NAME ?? '';
const s3 = new S3Client({});

export async function fetchReferenceData(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: `reference-data/${key}` });
  const response = await s3.send(command);
  return (await response.Body?.transformToString()) ?? '';
}

export async function writeOutputArtifact(key: string, data: string): Promise<string> {
  const artifactKey = `artifacts/${key}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: artifactKey,
    Body: data,
    ContentType: 'application/json',
  });
  await s3.send(command);
  return artifactKey;
}
