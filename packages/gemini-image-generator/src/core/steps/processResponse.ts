/**
 * 步骤：处理 API 响应
 */

import type { GeminiApiResponse, GeneratedImage, RunProjectOutput } from "../types/io";

/**
 * 将 API 响应列表转换为 runProject 输出
 */
export function processResponse(responses: GeminiApiResponse[]): RunProjectOutput {
  const generatedImages: GeneratedImage[] = [];
  let firstError: string | undefined;
  
  responses.forEach((response, index) => {
    if (response.success && response.imageBase64) {
      generatedImages.push({
        base64: response.imageBase64,
        text: response.text,
        timestamp: Date.now() + index, // 保持顺序
      });
    } else if (!firstError && response.error) {
      firstError = response.error;
    }
  });
  
  // 按时间戳排序
  generatedImages.sort((a, b) => a.timestamp - b.timestamp);
  
  const successCount = generatedImages.length;
  const totalCount = responses.length;
  
  return {
    success: successCount > 0,
    generatedImages,
    successCount,
    totalCount,
    error: successCount === 0 ? (firstError || "所有图片生成失败") : undefined,
  };
}
