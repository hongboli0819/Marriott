/**
 * 步骤：调用 Gemini API（支持并发和重试）
 */

import type { CoreContext } from "../types/context";
import type { GeminiApiRequest, GeminiApiResponse } from "../types/io";
import { callGeminiImageApi } from "../adapters/api";

// ==================== 重试配置 ====================

/** 单次调用最大重试次数 */
const MAX_RETRIES = 3;

/** 重试基础延迟（毫秒） */
const RETRY_BASE_DELAY = 1000;

/** 重试最大延迟（毫秒） */
const RETRY_MAX_DELAY = 10000;

/** 退避乘数 */
const BACKOFF_MULTIPLIER = 2;

/** 交错请求间隔（毫秒）- 每个请求间隔 1 秒启动 */
const STAGGER_DELAY = 1000;

// ==================== 工具函数 ====================

/**
 * 计算重试延迟（指数退避 + 抖动）
 * 
 * @param attempt - 重试次数
 * @param errorMessage - 错误信息，用于判断是否需要更长等待
 */
function calculateDelay(attempt: number, errorMessage?: string): number {
  // 如果是 API 过载错误，使用更长的等待时间
  if (errorMessage?.toLowerCase().includes("overloaded")) {
    const overloadBaseDelay = 5000; // 5 秒起步
    const jitter = Math.random() * 3000;
    return overloadBaseDelay + attempt * 3000 + jitter; // 5s, 8s, 11s...
  }
  
  // 如果是请求超时错误（可能是连接被阻塞），等待其他请求完成后再重试
  if (errorMessage?.includes("超时")) {
    const timeoutBaseDelay = 3000; // 3 秒起步
    const jitter = Math.random() * 2000;
    return timeoutBaseDelay + attempt * 2000 + jitter; // 3s, 5s, 7s...
  }
  
  // 普通错误使用标准指数退避
  const exponentialDelay = RETRY_BASE_DELAY * Math.pow(BACKOFF_MULTIPLIER, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, RETRY_MAX_DELAY);
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(response: GeminiApiResponse): boolean {
  // 明确的客户端错误不重试
  if (response.error?.includes("400") || 
      response.error?.includes("401") || 
      response.error?.includes("403") ||
      response.error?.includes("404")) {
    return false;
  }
  // 其他错误（如 500、网络错误）可重试
  return true;
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 核心函数 ====================

/**
 * 单次调用（带重试）
 */
async function callWithRetry(
  request: GeminiApiRequest,
  ctx?: CoreContext
): Promise<GeminiApiResponse> {
  const { logger } = ctx || {};
  let lastResponse: GeminiApiResponse = { success: false, error: "未执行" };
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 传入上次的错误信息，用于判断是否需要更长等待（如 overloaded、超时）
      const waitTime = calculateDelay(attempt - 1, lastResponse.error);
      const isOverloaded = lastResponse.error?.toLowerCase().includes("overloaded");
      const isTimeout = lastResponse.error?.includes("超时");
      let retryReason = "";
      if (isOverloaded) retryReason = "（API过载，延长等待）";
      else if (isTimeout) retryReason = "（请求超时，等待连接释放）";
      logger?.info?.(`[gemini-api] 第 ${attempt} 次重试，等待 ${Math.round(waitTime)}ms${retryReason}`);
      await delay(waitTime);
    }
    
    const response = await callGeminiImageApi(request, ctx);
    lastResponse = response;
    
    if (response.success) {
      return response;
    }
    
    // 检查是否可重试
    if (!isRetryableError(response)) {
      logger?.warn?.("[gemini-api] 不可重试的错误", { error: response.error });
      return response;
    }
    
    logger?.warn?.(`[gemini-api] 调用失败，准备重试`, { 
      attempt, 
      error: response.error 
    });
  }
  
  logger?.error?.("[gemini-api] 达到最大重试次数", { error: lastResponse.error });
  return lastResponse;
}

/**
 * 交错并发调用多次（用于生成多张图片）
 * 
 * 策略：每个请求间隔 STAGGER_DELAY 毫秒启动，减少瞬间 API 压力
 * - 第 1 个请求：立即发出
 * - 第 2 个请求：1 秒后发出
 * - 第 3 个请求：2 秒后发出
 * - 三个请求同时在跑，只是启动时间错开
 */
export async function callGeminiApiBatch(
  request: GeminiApiRequest,
  count: number,
  ctx?: CoreContext
): Promise<GeminiApiResponse[]> {
  const { logger } = ctx || {};
  
  logger?.info?.(`[gemini-api] 开始交错并发生成 ${count} 张图片（间隔 ${STAGGER_DELAY}ms）`);
  
  // 创建交错并发请求：每个请求延迟 index * STAGGER_DELAY 后启动
  const promises = Array.from({ length: count }, (_, index) =>
    // 第 index 个请求延迟 index * 1000ms 后启动
    delay(index * STAGGER_DELAY).then(() => {
      logger?.debug?.(`[gemini-api] 第 ${index + 1}/${count} 张开始请求`);
      return callWithRetry(request, ctx).then(response => {
        logger?.debug?.(`[gemini-api] 第 ${index + 1}/${count} 张完成`, { 
          success: response.success 
        });
        return response;
      });
    })
  );
  
  // 等待所有请求完成
  const results = await Promise.allSettled(promises);
  
  // 处理结果
  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      logger?.error?.(`[gemini-api] 第 ${index + 1} 张异常`, { reason: result.reason });
      return {
        success: false,
        error: result.reason?.message || "生成异常",
      };
    }
  });
}
