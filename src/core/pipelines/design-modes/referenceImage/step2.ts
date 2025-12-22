/**
 * 提供设计参考图模式 - 第二步：添加文字生成最终图
 * 
 * 🚀 使用直接调用模式，无数据库读写延迟
 */

import type { Step2Input, Step2Output } from "../types";
import { generateDesignImagesDirect } from "@/core/steps/integrateGeminiGenerator";
import { getStep2Prompt, DEFAULT_COUNT } from "./prompts";

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
 * 执行第二步：在背景图上添加文字（直接调用模式）
 * 
 * @param input - 输入参数
 * @param ctx - 核心上下文（可选）
 * @param onProgress - 进度回调 (completed, total)
 * @returns 生成结果
 */
export async function runStep2(
  input: Step2Input,
  ctx?: CoreContext,
  onProgress?: (completed: number, total: number) => void
): Promise<Step2Output> {
  const { logger } = ctx || {};
  
  logger?.info?.("[referenceImage:step2] 开始执行（直接调用模式）", {
    confirmedTextLength: input.confirmedText.length,
    size: input.size,
  });

  try {
    // 生成 Step2 的提示词
    const step2Prompt = getStep2Prompt(input.confirmedText);
    
    // 调用直接调用模式，参考图是 Step1 选中的背景图
    const result = await generateDesignImagesDirect({
      confirmedText: input.confirmedText,
      referenceImageUrls: [input.selectedBackgroundImage], // 只有1张背景图
      size: input.size,
      customPrompt: step2Prompt,
      count: DEFAULT_COUNT,
    }, onProgress);

    logger?.info?.("[referenceImage:step2] 执行完成", {
      success: result.success,
      successCount: result.successCount,
      totalCount: result.totalCount,
    });

    return result;
  } catch (error) {
    logger?.error?.("[referenceImage:step2] 执行失败", { error });
    
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount: DEFAULT_COUNT,
      error: error instanceof Error ? error.message : "执行失败",
    };
  }
}
