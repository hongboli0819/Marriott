/**
 * Gemini Image Generator - API 适配器
 * 
 * 封装对 Supabase Edge Function 的调用
 */

import type { CoreContext } from "../types/context";
import type { GeminiApiRequest, GeminiApiResponse } from "../types/io";

// Supabase Edge Function URL
const EDGE_FUNCTION_URL = "https://qqlwechtvktkhuheoeja.supabase.co/functions/v1/gemini-image";

/**
 * 请求超时时间（毫秒）
 * - 单次图片生成可能需要 30-60 秒
 * - 设置 90 秒超时，留有余量
 * - 如果连接无法建立（被阻塞），超时后会自动 abort 并触发重试
 */
const FETCH_TIMEOUT = 90000;

/**
 * 调用 Gemini Image Edge Function
 */
export async function callGeminiImageApi(
  request: GeminiApiRequest,
  ctx?: CoreContext
): Promise<GeminiApiResponse> {
  const { logger, adapters } = ctx || {};
  
  logger?.debug?.("[gemini-api] 发送请求", {
    promptLength: request.prompt.length,
    imagesCount: request.images.length,
    aspectRatio: request.aspectRatio,
    imageSize: request.imageSize,
  });

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger?.warn?.("[gemini-api] 请求超时，主动中止");
    controller.abort();
  }, FETCH_TIMEOUT);

  try {
    // 优先使用注入的 API 客户端
    if (adapters?.api) {
      const result = await adapters.api.post<GeminiApiResponse>(
        EDGE_FUNCTION_URL,
        request
      );
      clearTimeout(timeoutId);
      return result;
    }

    // 降级使用 fetch（带超时控制）
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal, // 关键：绑定 AbortController
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger?.error?.("[gemini-api] HTTP 错误", { status: response.status, error: errorText });
      return {
        success: false,
        error: `请求失败: ${response.status}`,
      };
    }

    const result: GeminiApiResponse = await response.json();
    logger?.debug?.("[gemini-api] 响应成功", { success: result.success });
    
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // 检查是否是超时导致的 AbortError
    if (error instanceof Error && error.name === 'AbortError') {
      logger?.warn?.("[gemini-api] 请求超时（可重试）", { timeout: FETCH_TIMEOUT });
      return {
        success: false,
        error: `请求超时（${FETCH_TIMEOUT / 1000}秒）`,
      };
    }
    
    logger?.error?.("[gemini-api] 网络错误", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "网络请求失败",
    };
  }
}
