// Devices and a server for merge tests. The server is the real Lambda handler over a fake S3
// (test-support/util.mjs); each device is the real app store, outbox and sync over in-memory storage.
// Only the network is faked: `api` is the app's api interface calling the handler directly.

import { makeRequest, monthKey, setup } from './util.mjs';
import { ApiError } from '../app/js/store/api.js';
import { createClock } from '../app/js/ids.js';
import { createMemoryStorage } from '../app/js/store/memory.js';
import { createEventStore } from '../app/js/store/events.js';
import { createSync } from '../app/js/store/sync.js';

export { monthKey };
export const at = (iso) => Date.parse(iso);

// One server for all devices. server.clock.now is the server's time (decides recvAt and the month file).
export const createServer = (opts) => setup(opts);

// A device's connection to the server. Flags simulate trouble:
//   down            no network: every call fails with ApiError(0)
//   dropAck         the next N POSTs reach the server and are stored, but the reply is lost
//   failGets        every GET fails with ApiError(0)
export function connect(server) {
  const api = {
    calls: [],
    down: false,
    dropAck: 0,
    failGets: false,
    async postEvents(deviceId, events) {
      api.calls.push({ method: 'POST', count: events.length });
      if (api.down) throw new ApiError(0, null, 'Cannot reach the server.');
      const res = await server.call(makeRequest({ method: 'POST', body: { deviceId, events } }));
      if (api.dropAck > 0 && res.statusCode === 200) {
        api.dropAck--;
        throw new ApiError(0, null, 'Cannot reach the server.');
      }
      if (res.statusCode !== 200) throw new ApiError(res.statusCode, res.json);
      return { data: res.json, ms: 1 };
    },
    async getEvents({ since, limit } = {}) {
      api.calls.push({ method: 'GET', since: since ?? null });
      if (api.down || api.failGets) throw new ApiError(0, null, 'Cannot reach the server.');
      const query = {};
      if (since) query.since = since;
      if (limit) query.limit = String(limit);
      const res = await server.call(makeRequest({ method: 'GET', query }));
      if (res.statusCode !== 200) throw new ApiError(res.statusCode, res.json);
      return { data: res.json, ms: 1 };
    },
  };
  return api;
}

// Timers that only fire when the test says so.
export function manualTimers() {
  let nextHandle = 1;
  const pending = new Map();
  return {
    set(fn, ms) {
      const handle = nextHandle++;
      pending.set(handle, { fn, ms });
      return handle;
    },
    clear(handle) {
      pending.delete(handle);
    },
    get pending() {
      return [...pending.values()].map((t) => t.ms);
    },
    // Fires every timer that is waiting now (not ones they schedule) and waits for their sync to end.
    async fire() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, t] of due) await t.fn();
      await new Promise((r) => setImmediate(r));
    },
  };
}

// A device: its own wall clock (device.wall.now, ms), storage, clock, store and sync.
export async function createDevice(server, name, { wall = at('2026-09-29T19:00:00Z'), pageLimit, clock, storage, api } = {}) {
  const device = { name, deviceId: `d_${name}`, wall: { now: wall } };
  device.storage = storage ?? createMemoryStorage({ persistent: true });
  device.api = api ?? connect(server);
  device.timers = manualTimers();
  device.events = await createEventStore({
    storage: device.storage,
    deviceId: device.deviceId,
    clock: clock ?? createClock(),
    now: () => device.wall.now,
  });
  device.sync = createSync({ events: device.events, api: device.api, timers: device.timers, pageLimit, now: () => device.wall.now });
  // Moves this device's wall clock (and returns the device, for chaining).
  device.at = (iso) => {
    device.wall.now = at(iso);
    return device;
  };
  return device;
}

// Syncs every device, twice around, so each has seen everything the others wrote.
export async function settle(...devices) {
  for (let round = 0; round < 2; round++) for (const d of devices) await d.sync.sync();
}

// The ids of every event a device holds, sorted.
export const eventIds = (device) => device.events.events().map((e) => e.id).sort();
