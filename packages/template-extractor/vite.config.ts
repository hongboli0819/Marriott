import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 引用 image-diff-tool 副本版本
      "@internal/image-diff-tool": path.resolve(
        __dirname,
        "../image-diff-tool_副本/src/core/index.ts"
      ),
      // image-diff-tool 依赖的 text-editor-module
      "@internal/text-editor-module": path.resolve(
        __dirname,
        "../image-diff-tool_副本/packages/text-editor-module/src/core/index.ts"
      ),
    },
  },
  server: {
    port: 5180,
    host: true,
  },
});

