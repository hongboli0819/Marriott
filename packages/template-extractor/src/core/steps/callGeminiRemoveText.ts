/**
 * 第二轮 Gemini 调用：剔除图片中的文字
 */

import type { CoreContext } from "../types/context";
import type { SupportedAspectRatio, ImageResolution } from "../types/io";

// ==================== 常量 ====================

const GEMINI_IMAGE_URL =
  "https://qqlwechtvktkhuheoeja.supabase.co/functions/v1/gemini-image";

// 使用简洁的英文指令，避免模型进入"推理模式"而非"生成模式"
const REMOVE_TEXT_PROMPT =
  "Edit this image: remove all text completely. Keep all other visual elements exactly the same.";

const MAX_RETRIES = 3;

// ==================== 类型定义 ====================

export interface CallGeminiRemoveTextInput {
  /** 第一轮结果图片 base64 */
  imageBase64: string;
  /** MIME 类型 */
  mimeType: string;
  /** 宽高比 */
  aspectRatio: SupportedAspectRatio;
  /** 分辨率 */
  resolution: ImageResolution;
  /** 重试回调（用于显示进度） */
  onRetry?: (attempt: number, maxRetries: number, error: string) => void;
}

export interface CallGeminiRemoveTextOutput {
  success: boolean;
  /** 无文字版图片 base64 */
  imageBase64?: string;
  error?: string;
}

// ==================== 辅助函数 ====================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== 主函数 ====================

/**
 * 调用 Gemini API 剔除文字
 */
export async function callGeminiRemoveText(
  input: CallGeminiRemoveTextInput,
  ctx?: CoreContext
): Promise<CallGeminiRemoveTextOutput> {
  const { imageBase64, mimeType, aspectRatio, resolution, onRetry } = input;
  const { logger } = ctx?.adapters || {};

  logger?.info?.("[callGeminiRemoveText] 开始第二轮：剔除文字", {
    aspectRatio,
    resolution,
  });

  let lastError = "未知错误";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        logger?.info?.(`[callGeminiRemoveText] 🔄 正在重试 (${attempt}/${MAX_RETRIES})...`);
        onRetry?.(attempt, MAX_RETRIES, lastError);
      }

      const response = await fetch(GEMINI_IMAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: REMOVE_TEXT_PROMPT,
          images: [{ base64: imageBase64, mimeType }],
          aspectRatio,
          imageSize: resolution,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `Gemini API 错误: ${response.status} - ${errorText}`;
        logger?.warn?.(`[callGeminiRemoveText] 调用失败 (尝试 ${attempt}/${MAX_RETRIES}): ${lastError}`);

        if (attempt < MAX_RETRIES) {
          const delayMs = 2000 * attempt + Math.random() * 1000; // 更长的等待时间
          logger?.info?.(`[callGeminiRemoveText] 等待 ${(delayMs / 1000).toFixed(1)}s 后重试...`);
          await delay(delayMs);
          continue;
        }
        return { success: false, error: `${lastError} (已重试 ${MAX_RETRIES} 次)` };
      }

      const result = await response.json();

      if (!result.success || !result.imageBase64) {
        lastError = result.error || "未能生成图片";
        logger?.warn?.(`[callGeminiRemoveText] 生成失败 (尝试 ${attempt}/${MAX_RETRIES}): ${lastError}`);

        if (attempt < MAX_RETRIES) {
          const delayMs = 2000 * attempt + Math.random() * 1000;
          logger?.info?.(`[callGeminiRemoveText] 等待 ${(delayMs / 1000).toFixed(1)}s 后重试...`);
          await delay(delayMs);
          continue;
        }
        return { success: false, error: `${lastError} (已重试 ${MAX_RETRIES} 次)` };
      }

      if (attempt > 1) {
        logger?.info?.(`[callGeminiRemoveText] ✅ 第 ${attempt} 次尝试成功`);
      } else {
        logger?.info?.("[callGeminiRemoveText] ✅ 剔除文字成功");
      }

      return {
        success: true,
        imageBase64: result.imageBase64,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "网络错误";
      logger?.warn?.(`[callGeminiRemoveText] 调用异常 (尝试 ${attempt}/${MAX_RETRIES}): ${lastError}`);

      if (attempt < MAX_RETRIES) {
        const delayMs = 2000 * attempt + Math.random() * 1000;
        logger?.info?.(`[callGeminiRemoveText] 等待 ${(delayMs / 1000).toFixed(1)}s 后重试...`);
        await delay(delayMs);
        continue;
      }
    }
  }

  logger?.error?.("[callGeminiRemoveText] ❌ 剔除文字失败 (已用尽所有重试)", { error: lastError });

  return {
    success: false,
    error: `${lastError} (已重试 ${MAX_RETRIES} 次)`,
  };
}

