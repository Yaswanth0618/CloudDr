import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_FILE_BYTES } from "@/lib/shares";

function config() {
  const region = process.env.CLOUD_DROP_REGION;
  const bucket = process.env.CLOUD_DROP_BUCKET;
  if (!region || !bucket) throw new Error("S3 mode requires CLOUD_DROP_REGION and CLOUD_DROP_BUCKET on the server.");
  return { region, bucket };
}

function client() {
  return new S3Client({ region: config().region });
}

export async function authorizeUpload(key: string, contentType: string) {
  const { bucket } = config();
  return createPresignedPost(client(), {
    Bucket: bucket,
    Key: key,
    Expires: 60,
    Fields: { "Content-Type": contentType },
    Conditions: [
      ["content-length-range", 1, MAX_FILE_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
  });
}

export async function verifyUpload(key: string, expectedSize: number, expectedType: string) {
  const { bucket } = config();
  const head = await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return head.ContentLength === expectedSize && head.ContentType === expectedType;
}

export async function authorizeDownload(key: string, filename: string, expiresIn: number) {
  const { bucket } = config();
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  }), { expiresIn });
}
