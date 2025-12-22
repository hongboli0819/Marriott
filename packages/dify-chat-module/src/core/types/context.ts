/**
 * Dify Chat 模块 - CoreContext 类型定义
 * 符合 L-Project 开发规范
 */

/**
 * API 客户端接口
 */
export interface ApiClient {
  post: <T>(url: string, body: unknown, options?: RequestInit) => Promise<T>;
  get: <T>(url: string, options?: RequestInit) => Promise<T>;
}

/**
 * 日志接口
 */
export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

/**
 * 进度回调
 */
export type ProgressCallback = (message: string, percent?: number) => void;

/**
 * 流式响应回调
 */
export type StreamCallback = (chunk: string) => void;

/**
 * 核心上下文（依赖注入）
 */
export interface CoreContext {
  adapters: {
    api: ApiClient;          // API 客户端
    logger: Logger;          // 日志
  };
  config: {
    edgeFunctionUrl: string; // Edge Function URL
    timeout: number;         // 超时时间（毫秒）
  };
  now: () => number;         // 时间函数
  random: () => string;      // 随机 ID 生成
}



