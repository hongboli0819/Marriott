/**
 * L-Core 上下文类型定义
 */

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface CoreContext {
  adapters?: {
    logger?: Logger;
  };
}
