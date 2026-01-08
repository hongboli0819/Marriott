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
    port: 5177,  // 使用不同端口，避免与原版冲突
    host: "127.0.0.1",
    // 添加代理，绕过 CORS 限制
    proxy: {
      "/supabase-rest": {
        target: "https://qqlwechtvktkhuheoeja.supabase.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supabase-rest/, "/rest/v1"),
      },
      "/supabase-functions": {
        target: "https://qqlwechtvktkhuheoeja.supabase.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supabase-functions/, "/functions/v1"),
      },
    },
  },
});

