/**
 * Image Compressor - Context Types
 * 
 * 遵循规范：CoreContext / CoreFn 定义
 */

/** 日志接口 */
export interface Logger {
  info?(message: string, data?: unknown): void;
  warn?(message: string, data?: unknown): void;
  error?(message: string, data?: unknown): void;
}

/** 核心上下文 */
export interface CoreContext {
  adapters?: {
    logger?: Logger;
  };
  config?: {
    // 预留配置
  };
}

/** 核心函数签名 */
export type CoreFn<I, O> = (input: I, ctx?: CoreContext) => Promise<O>;


