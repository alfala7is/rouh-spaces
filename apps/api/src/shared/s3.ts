import { Client } from 'minio';

const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const BUCKET = process.env.MINIO_BUCKET || 'rouh-local';

export async function ensureBucket() {
  const exists = await minio.bucketExists(BUCKET).catch(() => false);
  if (!exists) await minio.makeBucket(BUCKET, 'us-east-1');
}

export async function getSignedPutUrl(key: string, expiresSeconds = 3600) {
  await ensureBucket();
  return minio.presignedPutObject(BUCKET, key, expiresSeconds);
}

export async function getSignedGetUrl(key: string, expiresSeconds = 3600) {
  await ensureBucket();
  return minio.presignedGetObject(BUCKET, key, expiresSeconds);
}

