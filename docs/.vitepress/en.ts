import { defineConfig } from "vitepress";
import sharedConfig from "./shared";

export default defineConfig({
  description: "Consume OpenAPI 3.0 & 3.1 schemas in TypeScript",
  themeConfig: {
    nav: [
      {
        text: "Version",
        items: [
          { text: "7.x", link: "/introduction" },
          { text: "6.x", link: "/6.x/introduction" },
        ],
      },
    ],
    sidebar: {
      // 6.x docs
      "/6.x/": [
        {
          text: "openapi-typescript (6.x)",
          items: [
            { text: "Introduction", link: "/6.x/introduction" },
            { text: "CLI", link: "/6.x/cli" },
            { text: "Node.js API", link: "/6.x/node" },
            { text: "Advanced", link: "/6.x/advanced" },
            { text: "About", link: "/6.x/about" },
          ],
        },
        {
          text: "openapi-fetch",
          items: [
            { text: "Getting Started", link: "/openapi-fetch/" },
            {
              text: "Middleware & Auth",
              link: "/openapi-fetch/middleware-auth",
            },
            { text: "Testing", link: "/openapi-fetch/testing" },
            { text: "Examples", link: "/openapi-fetch/examples" },
            { text: "API", link: "/openapi-fetch/api" },
          ],
        },
      ],
      // default (7.x) docs
      "/": [
        {
          text: "openapi-typescript (7.x)",
          items: [
            { text: "Introduction", link: "/introduction" },
            { text: "CLI", link: "/cli" },
            { text: "Node.js API", link: "/node" },
            { text: "Examples", link: "/examples" },
            { text: "Migrating from 6.x", link: "/migration-guide" },
            { text: "Advanced", link: "/advanced" },
          ],
        },
        {
          text: "openapi-fetch",
          items: [
            { text: "Getting Started", link: "/openapi-fetch/" },
            {
              text: "Middleware & Auth",
              link: "/openapi-fetch/middleware-auth",
            },
            { text: "Testing", link: "/openapi-fetch/testing" },
            { text: "Examples", link: "/openapi-fetch/examples" },
            { text: "API", link: "/openapi-fetch/api" },
          ],
        },
        { text: "About", link: "/about" },
      ],
    },
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/zkanda/openapi-typescript",
      },
    ],
    footer: {
      message:
        'Released under the <a href="https://github.com/openapi-ts/openapi-typescript/blob/main/packages/openapi-typescript/LICENSE">MIT License</a>.',
    },
  },
});
