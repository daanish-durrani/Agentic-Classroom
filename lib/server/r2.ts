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

/**
 * Obtain a memoized S3Client configured for Cloudflare R2 using environment credentials.
 *
 * @returns The configured S3Client instance.
 * @throws Error if `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, or `R2_SECRET_ACCESS_KEY` is not set.
 */
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

/**
 * Retrieve the configured Cloudflare R2 bucket name from the environment.
 *
 * @returns The value of `R2_BUCKET_NAME`.
 * @throws Error if `R2_BUCKET_NAME` is not set.
 */
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
 * Constructs the public URL for an object stored in the configured R2 bucket.
 *
 * @param key - The object key or path within the bucket (may include subpaths)
 * @returns The full public URL for the specified object
 * @throws Error if `R2_PUBLIC_URL` is not configured in the environment
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
 * Deletes the object at the given key from the configured R2 bucket.
 *
 * @param key - The object's key (path) within the bucket
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
