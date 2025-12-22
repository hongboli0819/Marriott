# Dify Chat Module - 集成指南

## 概述

`@internal/dify-chat-module` 是一个符合 L-Project 规范的子项目，用于与 Dify API 进行聊天交互。

## 功能特性

- ✅ 发送文本消息
- ✅ 支持多张图片上传
- ✅ 多轮对话（conversation_id）
- ✅ 150 秒超时控制
- ✅ 流式响应模拟

## 架构设计

```
packages/dify-chat-module/
├── src/
│   └── core/                    # L-Core：纯函数核心
│       ├── index.ts             # 对外入口
│       ├── pipelines/
│       │   └── runDifyChat.ts   # 主能力函数
│       └── types/
│           ├── io.ts            # 输入输出类型
│           ├── context.ts       # CoreContext
│           └── functional.ts    # 函数式类型
├── package.json
├── vite.config.ts
├── tsconfig.json
└── INTEGRATION.md
```

## 在父项目中使用

### 1. 配置 vite.config.ts 别名

```typescript
// Marriott/vite.config.ts
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
    "@internal/dify-chat-module": path.resolve(__dirname, 
      "./packages/dify-chat-module/src/core/index.ts"),
  },
}
```

### 2. 创建桥接层

```typescript
// src/core/steps/integrateDifyChat.ts
import { runDifyChat, CoreContext, DifyChatInput } from "@internal/dify-chat-module";

export async function integrateDifyChat(input: DifyChatInput) {
  const ctx: CoreContext = {
    adapters: {
      api: { /* API 实现 */ },
      logger: console,
    },
    config: {
      edgeFunctionUrl: "/api/dify-chat",
      timeout: 150000, // 150 秒
    },
    now: () => Date.now(),
    random: () => Math.random().toString(36).slice(2),
  };

  return runDifyChat(ctx, input);
}
```

### 3. 在页面中调用

```typescript
import { integrateDifyChat } from "@/core/steps/integrateDifyChat";

const result = await integrateDifyChat({
  query: "用户的问题",
  files: [{ data: "base64...", fileName: "image.jpg", mimeType: "image/jpeg" }],
  conversationId: "xxx", // 可选
});

if (result.success) {
  console.log(result.response);
}
```

## Dify API 响应格式

```json
{
  "status": "success",
  "content": "...",
  "response": "这是要展示给用户的内容"
}
```

模块只提取 `response` 字段返回给调用方。

## 类型定义

```typescript
interface DifyChatInput {
  query: string;                    // 用户问题
  files?: FileInfo[];               // 上传的图片
  conversationId?: string;          // 对话 ID
  user?: string;                    // 用户标识
}

interface DifyChatOutput {
  success: boolean;
  response: string;                 // 提取的 response
  conversationId: string;
  messageId: string;
  error?: string;
}
```



