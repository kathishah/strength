// The only S3 surface the Lambda uses. index.mjs depends on this interface, not
// on the AWS SDK, so tests can run against an in-memory fake.
//
// ObjectStore:
//   get(key)  -> { body: string, etag: string } | null            (null when the key does not exist)
//   put(key, body, cond) -> { etag: string }
//        cond = { ifNoneMatch: '*' }   create only; fails 412 if the key exists
//        cond = { ifMatch: etag }      replace only; fails 412 on ETag mismatch, 404 if the key is missing
//        either may also fail 409 when a concurrent conditional write is in flight
//   list(prefix) -> string[]                                       (all keys under prefix, any order)
//
// Failed conditions throw StoreError with `status` set to 404, 409 or 412.
// Anything else (throttling, permissions, network) propagates as a normal Error.

export class StoreError extends Error {
  constructor(status, message) {
    super(message ?? `object store error ${status}`);
    this.name = 'StoreError';
    this.status = status;
  }
}

// Real implementation. The SDK is imported on first use so that tests, which never
// call this, need no dependencies installed.
export function createS3ObjectStore(bucket, { client } = {}) {
  let sdk;
  let s3 = client;
  async function load() {
    if (!sdk) {
      sdk = await import('@aws-sdk/client-s3');
      s3 ??= new sdk.S3Client({});
    }
    return { sdk, s3 };
  }
  const statusOf = (err) => err?.$metadata?.httpStatusCode;

  return {
    async get(key) {
      const { sdk, s3 } = await load();
      try {
        const out = await s3.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
        return { body: await out.Body.transformToString('utf-8'), etag: out.ETag };
      } catch (err) {
        if (err?.name === 'NoSuchKey' || statusOf(err) === 404) return null;
        throw err;
      }
    },

    async put(key, body, { ifMatch, ifNoneMatch } = {}) {
      const { sdk, s3 } = await load();
      try {
        const out = await s3.send(
          new sdk.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'application/json',
            ...(ifMatch ? { IfMatch: ifMatch } : {}),
            ...(ifNoneMatch ? { IfNoneMatch: ifNoneMatch } : {}),
          }),
        );
        return { etag: out.ETag };
      } catch (err) {
        const status = statusOf(err);
        if (status === 404 || status === 409 || status === 412) throw new StoreError(status, err.message);
        throw err;
      }
    },

    async list(prefix) {
      const { sdk, s3 } = await load();
      const keys = [];
      let token;
      do {
        const out = await s3.send(
          new sdk.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const obj of out.Contents ?? []) keys.push(obj.Key);
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
  };
}
