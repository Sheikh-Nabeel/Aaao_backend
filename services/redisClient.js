import Redis from "ioredis";
import logger from "../utils/logger.js";

const REDIS_URL =
  (process.env.REDIS_URL && process.env.REDIS_URL.trim()) ||
  "redis://127.0.0.1:6379";

// Lazy connect to avoid error spam on import
const client = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableAutoPipelining: true,
});

let connected = false;
let warnedOnce = false;

client.on("ready", () => {
  connected = true;
  warnedOnce = false;
  (logger?.info || console.log)(`Redis connected: ${REDIS_URL}`);
});

client.on("end", () => {
  connected = false;
});

client.on("error", (e) => {
  if (!warnedOnce) {
    warnedOnce = true;
    (logger?.warn || console.warn)(
      `Redis error (non-fatal): ${e?.message || e}`
    );
  }
});

// Attempt connect once (non-fatal)
(async () => {
  try {
    await client.connect();
  } catch (e) {
    (logger?.warn || console.warn)(
      `Redis connect failed (continuing without Redis): ${e?.message || e}`
    );
  }
})();

async function ensureConnected() {
  if (connected) return true;
  try {
    await client.connect();
    return connected;
  } catch {
    return false;
  }
}

// Safe wrapper
const redis = {
  async get(key) {
    try {
      await ensureConnected();
      if (!connected) return null;
      return await client.get(key);
    } catch {
      return null;
    }
  },
  async set(key, value, ...args) {
    try {
      await ensureConnected();
      if (!connected) return null;
      return await client.set(key, value, ...args);
    } catch {
      return null;
    }
  },
  async del(key) {
    try {
      await ensureConnected();
      if (!connected) return 0;
      return await client.del(key);
    } catch {
      return 0;
    }
  },
};

export default redis;
