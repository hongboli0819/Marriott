import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 子项目入口别名（指向源码，开发模式用）
      "@internal/text-editor-module": path.resolve(
        __dirname,
        "./packages/text-editor-module/src/core/index.ts"
      ),
    },
  },
  server: {
    port: 5176,
    host: "127.0.0.1",
  },
});

