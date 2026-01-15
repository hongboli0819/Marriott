import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 子项目入口别名（指向源码，开发模式下直接引用）
      "@internal/dify-chat-module": path.resolve(
        __dirname,
        "./packages/dify-chat-module/src/core/index.ts"
      ),
      "@internal/gemini-image-generator": path.resolve(
        __dirname,
        "./packages/gemini-image-generator/src/core/index.ts"
      ),
      // 使用副本版本（包含新的 X 距离检查算法和 IMAGE_DIFF_VERSION）
      "@internal/image-diff-tool": path.resolve(
        __dirname,
        "./packages/image-diff-tool_副本/src/core/index.ts"
      ),
      "@internal/image-compressor": path.resolve(
        __dirname,
        "./packages/image-compressor/src/core/index.ts"
      ),
      "@internal/text-editor-module": path.resolve(
        __dirname,
        "./packages/image-diff-tool_副本/packages/text-editor-module/src/core/index.ts"
      ),
      // 模版提取器 - Shared (UI 组件、Hooks) ⚠️ 必须在 Core 之前定义
      "@internal/template-extractor/shared": path.resolve(
        __dirname,
        "./packages/template-extractor/src/shared/index.ts"
      ),
      // 模版提取器 - Core (纯函数)
      "@internal/template-extractor": path.resolve(
        __dirname,
        "./packages/template-extractor/src/core/index.ts"
      ),
      // 强制统一 React 版本（避免多实例问题）
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "./node_modules/react/jsx-dev-runtime"),
      // 强制统一 fabric 版本
      "fabric": path.resolve(__dirname, "./node_modules/fabric"),
    },
  },
  server: {
    port: 3002,
    host: true,
  },
});

