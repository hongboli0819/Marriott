/**
 * 提供设计参考图模式 - 第一步：生成背景图
 * 
 * 🚀 使用直接调用模式，无数据库读写延迟
 */

import type { Step1Input, Step1Output } from "../types";
import { generateDesignImagesDirect } from "@/core/steps/integrateGeminiGenerator";
import { STEP1_PROMPT, DEFAULT_COUNT } from "./prompts";

/**
 * 核心上下文类型
 */
interface CoreContext {
  logger?: {
    info?: (message: string, data?: unknown) => void;
    warn?: (message: string, data?: unknown) => void;
    error?: (message: string, data?: unknown) => void;
    debug?: (message: string, data?: unknown) => void;
  };
}

/**
 * 执行第一步：生成背景图（直接调用模式）
 * 
 * @param input - 输入参数
 * @param ctx - 核心上下文（可选）
 * @param onProgress - 进度回调 (completed, total)
 * @returns 生成结果
 */
export async function runStep1(
  input: Step1Input,
  ctx?: CoreContext,
  onProgress?: (completed: number, total: number) => void
): Promise<Step1Output> {
  const { logger } = ctx || {};
  
  logger?.info?.("[referenceImage:step1] 开始执行（直接调用模式）", {
    confirmedTextLength: input.confirmedText.length,
    referenceImagesCount: input.referenceImageUrls.length,
    size: input.size,
  });

  try {
    // 调用直接调用模式（无数据库）
    const result = await generateDesignImagesDirect({
      confirmedText: input.confirmedText,
      referenceImageUrls: input.referenceImageUrls,
      size: input.size,
      customPrompt: STEP1_PROMPT,
      count: DEFAULT_COUNT,
    }, onProgress);

    logger?.info?.("[referenceImage:step1] 执行完成", {
      success: result.success,
      successCount: result.successCount,
      totalCount: result.totalCount,
    });

    return result;
  } catch (error) {
    logger?.error?.("[referenceImage:step1] 执行失败", { error });
    
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount: DEFAULT_COUNT,
      error: error instanceof Error ? error.message : "执行失败",
    };
  }
}
