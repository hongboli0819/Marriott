/**
 * 模版提取器 - 上下文类型定义
 */

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
    logger?: Logger;
  };
}


