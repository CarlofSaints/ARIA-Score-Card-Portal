// Test-only preload (node --import): the blob SDK reads PRIVATE files straight
// from https://<store>.private.blob.vercel-storage.com with no host override,
// so answer those reads from the JSON file in FAKE_BLOB_DATA_FILE
// ({ "<pathname>": <contents> }; the value "__FAIL_500__" answers a 500).
// The reply hook must be synchronous.
import { readFileSync } from "node:fs";
import { MockAgent, setGlobalDispatcher } from "undici";

const agent = new MockAgent();
agent.enableNetConnect();
agent
  .get("https://localfake.private.blob.vercel-storage.com")
  .intercept({ path: () => true, method: "GET" })
  .reply((opts) => {
    const key = decodeURIComponent(new URL(opts.path, "http://x").pathname.slice(1));
    const data = JSON.parse(readFileSync(process.env.FAKE_BLOB_DATA_FILE, "utf8"));
    if (data[key] === "__FAIL_500__") return { statusCode: 500, data: "" };
    return key in data ? { statusCode: 200, data: JSON.stringify(data[key]) } : { statusCode: 404, data: "" };
  })
  .persist();
setGlobalDispatcher(agent);
