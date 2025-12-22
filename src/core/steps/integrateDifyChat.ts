/**
 * Dify Chat 集成层
 * 
 * 符合 L-Project 开发规范
 * 父项目调用子项目 @internal/dify-chat-module 的桥接层
 * 
 * 通过 Supabase Edge Function 调用 Dify API
 */

import {
  runDifyChat,
  CoreContext,
  DifyChatInput,
  DifyChatOutput,
  StreamCallback,
  FileInfo,
  EdgeFunctionResponse,
} from "@internal/dify-chat-module";

// ===== Supabase 配置 =====

const SUPABASE_URL = "https://qqlwechtvktkhuheoeja.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbHdlY2h0dmt0a2h1aGVvZWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTk2OTgsImV4cCI6MjA3OTczNTY5OH0.yGSijURBrllzdHYSqnqA792GAapWW9tK3y_ukUfj4XQ";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/dify-chat`;
const TIMEOUT = 150000; // 150 秒

// ===== API 客户端实现（调用 Supabase Edge Function） =====

const apiClient = {
  async post<T>(url: string, body: unknown, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge Function Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  },

  async get<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  },
};

// ===== Logger 实现 =====

const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[DifyChat] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[DifyChat] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[DifyChat] ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    console.debug(`[DifyChat] ${message}`, ...args);
  },
};

// ===== CoreContext 构建 =====

function buildContext(): CoreContext {
  return {
    adapters: {
      api: apiClient,
      logger,
    },
    config: {
      edgeFunctionUrl: EDGE_FUNCTION_URL,
      timeout: TIMEOUT,
    },
    now: () => Date.now(),
    random: () => Math.random().toString(36).slice(2, 10),
  };
}

// ===== 导出函数 =====

/**
 * 发送 Dify 聊天请求
 * 
 * @param input - 聊天输入（query, files, conversationId）
 * @param onStream - 流式响应回调（可选）
 * @returns 聊天输出
 */
export async function integrateDifyChat(
  input: DifyChatInput,
  onStream?: StreamCallback
): Promise<DifyChatOutput> {
  const ctx = buildContext();
  return runDifyChat(ctx, input, onStream);
}

/**
 * 将 File 对象转换为 FileInfo
 */
export async function fileToFileInfo(file: File): Promise<FileInfo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve({
        data: base64,
        fileName: file.name,
        mimeType: file.type,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 批量转换文件
 */
export async function filesToFileInfos(files: File[]): Promise<FileInfo[]> {
  return Promise.all(files.map(fileToFileInfo));
}

// 重新导出类型，方便使用
export type { DifyChatInput, DifyChatOutput, FileInfo, StreamCallback };
