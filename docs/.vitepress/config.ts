import { defineConfig } from "vitepress";
import en from "./en";
import shared from "./shared";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  ...shared,
  locales: {
    root: { label: "English", ...en },
  },
});
