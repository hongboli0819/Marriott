/**
 * 纯函数类型定义
 */

import type { CoreContext } from "./context";

/**
 * L-Core 标准函数类型
 * 所有核心函数都遵循 (input, ctx) => output 的形式
 */
export type CoreFn<I, O> = (input: I, ctx?: CoreContext) => Promise<O> | O;
