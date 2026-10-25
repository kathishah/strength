// The ObjectStore contract, against the in-memory fake the handler tests use. A port runs the same cases against its
// own store (docs/PORTING.md). The real S3 store is not run here: it needs a bucket.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FakeS3 } from '../test-support/fake-s3.mjs';
import { objectStoreCases } from '../test-support/object-store-contract.mjs';

describe('ObjectStore contract: in-memory fake', () => {
  for (const [name, run] of objectStoreCases) {
    test(name, () => run({ make: () => new FakeS3() }, assert));
  }
});
