import { createApiFetchClient } from "feature-fetch";
import { Fetcher } from "openapi-typescript-fetch";
import { afterAll, test, describe, vi } from "vite-plus/test";
import createClient, { createPathBasedClient } from "../../dist/index.mjs";

const BASE_URL = "https://api.test.local";

const fetchMock = vi.fn(
  () =>
    new Promise((resolve) => {
      process.nextTick(() => {
        resolve(Response.json({}, { status: 200 }));
      });
    }),
);
vi.stubGlobal("fetch", fetchMock);

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("setup", () => {
  test("openapi-fetch", async ({ bench }) => {
    await bench("openapi-fetch", async () => {
      createClient({ baseUrl: BASE_URL });
    }).run();
  });

  test("openapi-fetch (path based)", async ({ bench }) => {
    await bench("openapi-fetch (path based)", async () => {
      createPathBasedClient({ baseUrl: BASE_URL });
    }).run();
  });

  test("openapi-typescript-fetch", async ({ bench }) => {
    await bench("openapi-typescript-fetch", async () => {
      const fetcher = Fetcher.for();
      fetcher.configure({
        baseUrl: BASE_URL,
      });
      fetcher.path("/pet/findByStatus").method("get").create();
    }).run();
  });

  test("feature-fetch", async ({ bench }) => {
    await bench("feature-fetch", async () => {
      createApiFetchClient({ prefixUrl: BASE_URL });
    }).run();
  });
});

describe("get (only URL)", () => {
  const openapiFetch = createClient({ baseUrl: BASE_URL });
  const openapiFetchPath = createPathBasedClient({ baseUrl: BASE_URL });
  const openapiTSFetch = Fetcher.for();
  openapiTSFetch.configure({
    baseUrl: BASE_URL,
  });
  const openapiTSFetchGET = openapiTSFetch.path("/url").method("get").create();
  const featureFetch = createApiFetchClient({ prefixUrl: BASE_URL });

  test("openapi-fetch", async ({ bench }) => {
    await bench("openapi-fetch", async () => {
      await openapiFetch.GET("/url");
    }).run();
  });

  test("openapi-fetch (path based)", async ({ bench }) => {
    await bench("openapi-fetch (path based)", async () => {
      await openapiFetchPath["/url"].GET();
    }).run();
  });

  test("openapi-typescript-fetch", async ({ bench }) => {
    await bench("openapi-typescript-fetch", async () => {
      await openapiTSFetchGET();
    }).run();
  });

  test("feature-fetch", async ({ bench }) => {
    await bench("feature-fetch", async () => {
      await featureFetch.get("/url");
    }).run();
  });
});

describe("get (headers)", () => {
  const openapiFetch = createClient({
    baseUrl: BASE_URL,
    headers: { "x-base-header": 123 },
  });
  const openapiFetchPath = createPathBasedClient({
    baseUrl: BASE_URL,
    headers: { "x-base-header": 123 },
  });
  const openapiTSFetch = Fetcher.for();
  openapiTSFetch.configure({
    baseUrl: BASE_URL,
    init: { headers: { "x-base-header": 123 } },
  });
  const openapiTSFetchGET = openapiTSFetch.path("/url").method("get").create();
  const featureFetch = createApiFetchClient({
    prefixUrl: BASE_URL,
    headers: { "x-base-header": "123" },
  });

  test("openapi-fetch", async ({ bench }) => {
    await bench("openapi-fetch", async () => {
      await openapiFetch.GET("/url", {
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }).run();
  });

  test("openapi-fetch (path based)", async ({ bench }) => {
    await bench("openapi-fetch (path based)", async () => {
      await openapiFetchPath["/url"].GET({
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }).run();
  });

  test("openapi-typescript-fetch", async ({ bench }) => {
    await bench("openapi-typescript-fetch", async () => {
      await openapiTSFetchGET(null, {
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }).run();
  });

  test("feature-fetch", async ({ bench }) => {
    await bench("feature-fetch", async () => {
      await featureFetch.get("/url", {
        headers: { "x-header-1": "123", "x-header-2": "456" },
      });
    }).run();
  });
});
