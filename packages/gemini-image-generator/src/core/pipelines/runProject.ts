/**
 * Gemini Image Generator - 主入口 Pipeline
 * 
 * 遵循 L-Project 规范：标准的 (input, ctx?) => Promise<output> 签名
 */

import type { CoreFn } from "../types/functional";
import type { RunProjectInput, RunProjectOutput } from "../types/io";
import { buildRequest } from "../steps/buildRequest";
import { callGeminiApiBatch } from "../steps/callGeminiApi";
import { processResponse } from "../steps/processResponse";

/**
 * 生成图片的主入口函数
 * 
 * @param input - 输入参数
 * @param input.prompt - 生成提示词
 * @param input.referenceImages - 参考图片（可选）
 * @param input.aspectRatio - 宽高比
 * @param input.resolution - 分辨率
 * @param input.count - 生成数量
 * @param ctx - 核心上下文（可选）
 * @returns 生成结果
 * 
 * @example
 * ```typescript
 * import { runProject } from "@internal/gemini-image-generator";
 * 
 * const result = await runProject({
 *   prompt: "设计一个现代简约的背景图",
 *   aspectRatio: "16:9",
 *   resolution: "1K",
 *   count: 3,
 * });
 * 
 * if (result.success) {
 *   console.log(`成功生成 ${result.successCount} 张图片`);
 *   result.generatedImages.forEach(img => {
 *     console.log(img.base64);
 *   });
 * }
 * ```
 */
export const runProject: CoreFn<RunProjectInput, RunProjectOutput> = async (
  input,
  ctx
) => {
  const { logger } = ctx || {};
  
  logger?.info?.("[gemini-image-generator] runProject:start", {
    promptLength: input.prompt.length,
    referenceImagesCount: input.referenceImages?.length || 0,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    count: input.count,
  });

  try {
    // 1. 验证输入
    if (!input.prompt?.trim()) {
      return {
        success: false,
        generatedImages: [],
        successCount: 0,
        totalCount: input.count,
        error: "提示词不能为空",
      };
    }

    if (input.count < 1 || input.count > 10) {
      return {
        success: false,
        generatedImages: [],
        successCount: 0,
        totalCount: input.count,
        error: "生成数量必须在 1-10 之间",
      };
    }

    // 2. 构建请求
    const request = buildRequest(input);
    logger?.debug?.("[gemini-image-generator] 请求构建完成", request);

    // 3. 并发调用 API
    const responses = await callGeminiApiBatch(request, input.count, ctx);
    logger?.debug?.("[gemini-image-generator] API 调用完成", {
      responsesCount: responses.length,
    });

    // 4. 处理响应
    const result = processResponse(responses);
    
    logger?.info?.("[gemini-image-generator] runProject:complete", {
      success: result.success,
      successCount: result.successCount,
      totalCount: result.totalCount,
    });

    return result;
  } catch (error) {
    logger?.error?.("[gemini-image-generator] runProject:error", { error });
    
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount: input.count,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
};
