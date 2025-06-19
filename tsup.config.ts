import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/lib.ts"],
  clean: true,
  dts: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  minify: false,
});
