import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts"],
  clean: true,
  dts: true,
  format: "esm",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  platform: "node",
  sourcemap: true,
});
