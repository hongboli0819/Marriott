/**
 * 重试工具函数
 * 
 * 提供指数退避重试机制，用于处理网络不稳定和临时故障
 */

/**
 * 重试配置选项
 */
export interface RetryOptions {
  /** 最大重试次数（不包括首次尝试），默认 3 */
  maxRetries?: number;
  /** 初始延迟时间（毫秒），默认 1000 */
  baseDelay?: number;
  /** 最大延迟时间（毫秒），默认 30000 */
  maxDelay?: number;
  /** 退避乘数，默认 2 */
  backoffMultiplier?: number;
  /** 可重试的错误类型（正则匹配错误消息） */
  retryableErrors?: RegExp[];
  /** 重试前的回调 */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'retryableErrors'>> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * 默认可重试的错误模式
 * 
 * 匹配常见的网络错误和临时故障
 */
const DEFAULT_RETRYABLE_ERRORS: RegExp[] = [
  /network/i,
  /timeout/i,
  /aborted/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ECONNABORTED/i,
  /ERR_CONNECTION/i,      // 匹配 ERR_CONNECTION_CLOSED, ERR_CONNECTION_REFUSED 等
  /fetch.*fail/i,         // 匹配 "Failed to fetch"
  /fail.*fetch/i,         // 匹配 "fetch failed"
  /load.*fail/i,          // 匹配 "Failed to load resource"
  /502/,
  /503/,
  /504/,
];

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: Error, patterns: RegExp[]): boolean {
  const message = error.message || '';
  return patterns.some(pattern => pattern.test(message));
}

/**
 * 计算重试延迟（指数退避 + 抖动）
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);
  const jitter = Math.random() * baseDelay; // 添加抖动防止惊群效应
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * 带重试的异步函数执行器
 * 
 * @description 使用指数退避策略重试失败的操作
 * 
 * @example
 * ```typescript
 * // 基本使用
 * const result = await withRetry(() => fetch('/api/data'));
 * 
 * // 自定义配置
 * const result = await withRetry(
 *   () => callExternalAPI(),
 *   {
 *     maxRetries: 5,
 *     baseDelay: 2000,
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry ${attempt}, waiting ${delay}ms...`);
 *     },
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
    retryableErrors: options.retryableErrors || DEFAULT_RETRYABLE_ERRORS,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 检查是否达到最大重试次数
      if (attempt === config.maxRetries) {
        break;
      }

      // 检查是否是可重试的错误
      if (!isRetryableError(lastError, config.retryableErrors)) {
        console.log(`[withRetry] 不可重试的错误: ${lastError.message}`);
        break;
      }

      // 计算延迟
      const delay = calculateDelay(
        attempt,
        config.baseDelay,
        config.maxDelay,
        config.backoffMultiplier
      );

      // 回调通知
      config.onRetry?.(lastError, attempt + 1, delay);

      console.log(`[withRetry] 尝试 ${attempt + 1}/${config.maxRetries + 1} 失败, ${Math.round(delay)}ms 后重试...`);

      // 等待
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 带超时的 fetch
 * 
 * @param url - 请求 URL
 * @param options - fetch 选项
 * @param timeoutMs - 超时时间（毫秒）
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 带超时和重试的 fetch
 * 
 * @example
 * ```typescript
 * const response = await fetchWithRetry(
 *   'https://api.example.com/data',
 *   { method: 'POST', body: JSON.stringify(data) },
 *   { timeout: 30000, maxRetries: 3 }
 * );
 * ```
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryOptions & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 30000, ...retryOptions } = config;

  return withRetry(
    () => fetchWithTimeout(url, options, timeout),
    retryOptions
  );
}
