import axios from "axios";
import { createApiFetchClient } from "feature-fetch";
import { Fetcher } from "openapi-typescript-fetch";
import superagent from "superagent";
import { afterAll, test, describe, vi } from "vite-plus/test";
import createClient, { createPathBasedClient } from "../../dist/index.mjs";
import * as openapiTSCodegen from "./openapi-typescript-codegen.min.js";

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

  test("axios", async ({ bench }) => {
    await bench("axios", async () => {
      axios.create({
        baseURL: BASE_URL,
      });
    }).run();
  });

  test("feature-fetch", async ({ bench }) => {
    await bench("feature-fetch", async () => {
      createApiFetchClient({ prefixUrl: BASE_URL });
    }).run();
  });

  // superagent: N/A
});

describe("get (only URL)", () => {
  const openapiFetch = createClient({ baseUrl: BASE_URL });
  const openapiFetchPath = createPathBasedClient({ baseUrl: BASE_URL });
  const openapiTSFetch = Fetcher.for();
  openapiTSFetch.configure({
    baseUrl: BASE_URL,
  });
  const openapiTSFetchGET = openapiTSFetch.path("/url").method("get").create();
  const axiosInstance = axios.create({
    baseURL: BASE_URL,
  });
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

  test("openapi-typescript-codegen", async ({ bench }) => {
    await bench("openapi-typescript-codegen", async () => {
      await openapiTSCodegen.PullsService.pullsGet("test1", "test2", "test3");
    }).run();
  });

  test("axios", async ({ bench }) => {
    await bench("axios", async () => {
      await axiosInstance.get("/url");
    }).run();
  });

  test("superagent", async ({ bench }) => {
    await bench("superagent", async () => {
      await superagent.get(`${BASE_URL}/url`);
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
  const axiosInstance = axios.create({
    baseURL: BASE_URL,
  });
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

  test("openapi-typescript-codegen", async ({ bench }) => {
    await bench("openapi-typescript-codegen", async () => {
      await openapiTSCodegen.PullsService.pullsGet("test1", "test2", "test3");
    }).run();
  });

  test("axios", async ({ bench }) => {
    await bench("axios", async () => {
      await axiosInstance.get("/url", {
        headers: { "x-header-1": 123, "x-header-2": 456 },
      });
    }).run();
  });

  test("superagent", async ({ bench }) => {
    await bench("superagent", async () => {
      await superagent.get(`${BASE_URL}/url`).set("x-header-1", 123).set("x-header-2", 456);
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
