/**
 * 步骤：构建 API 请求
 */

import type { RunProjectInput, GeminiApiRequest } from "../types/io";

/**
 * 将 runProject 输入转换为 API 请求格式
 */
export function buildRequest(input: RunProjectInput): GeminiApiRequest {
  return {
    prompt: input.prompt,
    images: input.referenceImages || [],
    aspectRatio: input.aspectRatio,
    imageSize: input.resolution,
  };
}
