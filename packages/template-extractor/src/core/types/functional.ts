/**
 * 模版提取器 - 函数类型定义
 */

import type { CoreContext } from "./context";

/**
 * 核心函数类型
 * 所有 pipeline 和 step 函数都应该遵循这个签名
 */
export type CoreFn<TInput, TOutput> = (
  input: TInput,
  ctx?: CoreContext
) => Promise<TOutput>;


