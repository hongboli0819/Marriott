/**
 * Gemini Image Generator - 函数式类型定义
 * 
 * 遵循 L-Project 规范：CoreFn 类型
 */

import type { CoreContext } from "./context";

/** 核心函数类型：(input, ctx?) => Promise<output> */
export type CoreFn<TInput, TOutput> = (
  input: TInput,
  ctx?: CoreContext
) => Promise<TOutput>;
