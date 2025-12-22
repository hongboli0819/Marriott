/**
 * Dify Chat 模块 - 函数式类型定义
 */

import type { CoreContext } from "./context";

/**
 * 核心函数类型
 * 所有步骤函数都遵循这个签名
 */
export type CoreFn<I, O> = (ctx: CoreContext, input: I) => Promise<O>;



