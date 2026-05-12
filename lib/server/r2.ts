/**
 * Cloudflare R2 (S3-compatible) utility functions.
 *
 * Used for storing TTS audio, images, thumbnails, and other media.
 * Media is served directly from R2 public URL — not proxied through Next.js.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Client (memoized at module scope)
// ---------------------------------------------------------------------------

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 environment variables not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.',
    );
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return _client;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error('R2_BUCKET_NAME environment variable is not set.');
  }
  return bucket;
}

// ---------------------------------------------------------------------------
// Public URL
// ---------------------------------------------------------------------------

/**
 * Get the public URL for an R2 object.
 * Uses R2_PUBLIC_URL for direct serving (no proxy through Next.js).
 */
export function getR2Url(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error('R2_PUBLIC_URL not configured. Set it to your R2 public bucket URL.');
  }
  // Remove trailing slash from publicUrl, leading slash from key
  const base = publicUrl.replace(/\/$/, '');
  const path = key.replace(/^\//, '');
  return `${base}/${path}`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a file to R2.
 * @param key - Object key (path) in the bucket, e.g. "classrooms/abc123/audio/scene1.mp3"
 * @param body - File contents (Buffer, Uint8Array, or ReadableStream)
 * @param contentType - MIME type, e.g. "audio/mpeg"
 * @returns The public URL of the uploaded object
 */
export async function uploadToR2(
  key: string,
  body: PutObjectCommandInput['Body'],
  contentType: string,
): Promise<string> {
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return getR2Url(key);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a file from R2.
 * @param key - Object key (path) in the bucket
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
}
