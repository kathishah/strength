// In-memory ObjectStore (see lambda/events/object-store.mjs) that behaves like S3
// conditional writes:
//   If-None-Match: * on an existing key      -> 412
//   If-Match on a missing key                -> 404
//   If-Match with a stale ETag               -> 412
//   a conditional write while another write to the same key is in flight -> 409
// Writes take a few event-loop turns, so two overlapping put() calls really overlap.

import { createHash } from 'node:crypto';
import { StoreError } from '../lambda/events/object-store.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));

export class FakeS3 {
  constructor() {
    this.objects = new Map(); // key -> { body, etag }
    this.inflight = new Set(); // keys with a write in progress
    this.log = []; // { op, key, cond }
    this.beforePut = null; // async (key, cond) => void; lets a test interleave another writer
    this.faults = []; // { key, status, times }
    this.rejected = []; // status codes of every put that failed a condition
  }

  static etagOf(body) {
    return `"${createHash('md5').update(body).digest('hex')}"`;
  }

  // Test setup: write directly, bypassing conditions and the log.
  seed(key, value) {
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    const etag = FakeS3.etagOf(body);
    this.objects.set(key, { body, etag });
    return etag;
  }

  // Test inspection: parsed JSON at key, or undefined.
  json(key) {
    const o = this.objects.get(key);
    return o ? JSON.parse(o.body) : undefined;
  }

  // Make the next `times` conditional puts to `key` fail with `status`.
  failPuts(key, status, times = 1) {
    this.faults.push({ key, status, times });
  }

  calls(op) {
    return this.log.filter((c) => c.op === op);
  }

  async get(key) {
    this.log.push({ op: 'get', key });
    await tick();
    const o = this.objects.get(key);
    return o ? { body: o.body, etag: o.etag } : null;
  }

  async list(prefix) {
    this.log.push({ op: 'list', key: prefix });
    await tick();
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }

  async put(key, body, cond = {}) {
    this.log.push({ op: 'put', key, cond });
    if (this.beforePut) await this.beforePut(key, cond);

    const fault = this.faults.find((f) => f.key === key && f.times > 0);
    if (fault) {
      fault.times--;
      this.rejected.push(fault.status);
      throw new StoreError(fault.status, `injected ${fault.status}`);
    }
    if (this.inflight.has(key)) {
      this.rejected.push(409);
      throw new StoreError(409, 'ConditionalRequestConflict');
    }
    this.#check(key, cond);

    this.inflight.add(key);
    try {
      await tick(); // the write is "in flight" here
      this.#check(key, cond);
      const etag = FakeS3.etagOf(body);
      this.objects.set(key, { body, etag });
      return { etag };
    } finally {
      this.inflight.delete(key);
    }
  }

  #check(key, { ifMatch, ifNoneMatch } = {}) {
    const cur = this.objects.get(key);
    let status = 0;
    if (ifNoneMatch === '*' && cur) status = 412;
    else if (ifMatch && !cur) status = 404;
    else if (ifMatch && cur.etag !== ifMatch) status = 412;
    if (status) {
      this.rejected.push(status);
      throw new StoreError(status, `condition failed: ${status}`);
    }
  }
}
