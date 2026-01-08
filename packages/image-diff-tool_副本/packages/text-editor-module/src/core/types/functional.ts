/**
 * 文字编辑器模块 - 函数类型定义
 */

import type { CoreContext } from "./context";

/**
 * 核心纯函数类型
 */
export type CoreFn<I, O> = (input: I, ctx?: CoreContext) => Promise<O> | O;

