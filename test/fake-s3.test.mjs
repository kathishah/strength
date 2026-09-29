// The fake must behave like S3 conditional writes, or the handler tests prove nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeS3 } from '../test-support/fake-s3.mjs';
import { StoreError } from '../lambda/events/object-store.mjs';

const status = (p) => p.then(() => 0, (e) => (e instanceof StoreError ? e.status : -1));

test('get on a missing key returns null; put with If-None-Match creates it', async () => {
  const s3 = new FakeS3();
  assert.equal(await s3.get('k'), null);
  const { etag } = await s3.put('k', '[1]', { ifNoneMatch: '*' });
  assert.deepEqual(await s3.get('k'), { body: '[1]', etag });
});

test('If-None-Match: * on an existing key fails with 412', async () => {
  const s3 = new FakeS3();
  s3.seed('k', '[]');
  assert.equal(await status(s3.put('k', '[1]', { ifNoneMatch: '*' })), 412);
});

test('If-Match on a missing key fails with 404', async () => {
  const s3 = new FakeS3();
  assert.equal(await status(s3.put('k', '[1]', { ifMatch: '"abc"' })), 404);
});

test('If-Match with a stale ETag fails with 412; with the current ETag it succeeds', async () => {
  const s3 = new FakeS3();
  const etag = s3.seed('k', '[]');
  assert.equal(await status(s3.put('k', '[1]', { ifMatch: '"stale"' })), 412);
  await s3.put('k', '[1]', { ifMatch: etag });
  assert.equal(s3.json('k').length, 1);
});

test('two overlapping conditional writes: one wins, the other gets 409, then 412 on retry', async () => {
  const s3 = new FakeS3();
  const etag = s3.seed('k', '[]');
  const results = await Promise.all([
    status(s3.put('k', '["a"]', { ifMatch: etag })),
    status(s3.put('k', '["b"]', { ifMatch: etag })),
  ]);
  assert.deepEqual(results, [0, 409]);
  assert.deepEqual(s3.json('k'), ['a']);
  assert.equal(await status(s3.put('k', '["b"]', { ifMatch: etag })), 412);
});

test('list returns keys under a prefix only', async () => {
  const s3 = new FakeS3();
  s3.seed('u/a/events/2026-10.json', '[]');
  s3.seed('u/b/events/2026-10.json', '[]');
  assert.deepEqual(await s3.list('u/a/'), ['u/a/events/2026-10.json']);
});
