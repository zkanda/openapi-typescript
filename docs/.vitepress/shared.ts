import type { UserConfig, DefaultTheme } from "vitepress";

const HOSTNAME = "https://openapi-ts.dev";

const shared: UserConfig = {
  title: "OpenAPI TypeScript",
  cleanUrls: true,
  srcExclude: ["**/*/CONTRIBUTRING.md", "**/*/README.md"],
  ignoreDeadLinks: [/CODE_OF_CONDUCT/],
  head: [
    ["link", { rel: "shortcut icon", href: "/favicon.svg", type: "image/svg" }],
  ],
  sitemap: {
    hostname: HOSTNAME,
  },
  themeConfig: {
    siteTitle: false,
    logo: "/assets/openapi-ts.svg",
    outline: "deep",
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/zkanda/openapi-typescript" },
    ],
  } satisfies DefaultTheme.Config,
  transformPageData({ relativePath, frontmatter }) {
    frontmatter.head ??= [];
    frontmatter.head.push([
      "link",
      { rel: "canonical", href: `${HOSTNAME}/${relativePath.replace(/(index\.md|\.md)$/, "")}` },
    ]);
  },
};

export default shared;
