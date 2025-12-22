/**
 * Gemini Image Generator - CoreContext 类型定义
 * 
 * 遵循 L-Project 规范：依赖注入的上下文类型
 */

/** API 客户端接口 */
export interface ApiClient {
  post<T>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
}

/** 日志接口 */
export interface Logger {
  info?: (message: string, data?: unknown) => void;
  warn?: (message: string, data?: unknown) => void;
  error?: (message: string, data?: unknown) => void;
  debug?: (message: string, data?: unknown) => void;
}

/** 核心上下文 */
export interface CoreContext {
  adapters?: {
    api?: ApiClient;
  };
  logger?: Logger;
}
