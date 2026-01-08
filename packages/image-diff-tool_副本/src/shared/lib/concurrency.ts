/**
 * 并发控制工具函数
 * 
 * 提供滑动窗口式并发执行，支持进度回调
 */

/**
 * 并发控制选项
 */
export interface ConcurrencyOptions<T> {
  /** 最大并发数，默认 5 */
  maxConcurrency?: number;
  /** 每个任务完成后的回调 */
  onItemComplete?: (result: {
    index: number;
    total: number;
    item: T;
    success: boolean;
    error?: Error;
  }) => void;
  /** 任务失败时是否继续执行剩余任务，默认 true */
  continueOnError?: boolean;
}

/**
 * 任务结果
 */
export interface TaskResult<R> {
  success: boolean;
  result?: R;
  error?: Error;
}

/**
 * 并发执行结果
 */
export interface ConcurrencyResult<R> {
  results: TaskResult<R>[];
  successCount: number;
  failCount: number;
}

/**
 * 滑动窗口式并发执行
 * 
 * @description 
 * 与传统批处理不同，滑动窗口式并发不会等待整批完成再开始下一批。
 * 当一个任务完成后，立即开始执行下一个等待中的任务，保持并发数恒定。
 * 
 * @example
 * ```typescript
 * const { results, successCount, failCount } = await executeWithConcurrency(
 *   items,
 *   async (item, index) => {
 *     return await processItem(item);
 *   },
 *   {
 *     maxConcurrency: 3,
 *     onItemComplete: ({ index, total, success }) => {
 *       console.log(`Progress: ${index + 1}/${total}, success: ${success}`);
 *     },
 *   }
 * );
 * ```
 */
export async function executeWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions<T> = {}
): Promise<ConcurrencyResult<R>> {
  const {
    maxConcurrency = 5,
    onItemComplete,
    continueOnError = true,
  } = options;

  if (items.length === 0) {
    return { results: [], successCount: 0, failCount: 0 };
  }

  const results: TaskResult<R>[] = new Array(items.length);
  let currentIndex = 0;
  let successCount = 0;
  let failCount = 0;
  let hasError = false;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      // 如果遇到错误且不继续，则停止
      if (hasError && !continueOnError) {
        break;
      }

      const index = currentIndex++;
      const item = items[index];

      try {
        const result = await processor(item, index);
        results[index] = { success: true, result };
        successCount++;

        onItemComplete?.({
          index,
          total: items.length,
          item,
          success: true,
        });
      } catch (error) {
        const err = error as Error;
        results[index] = { success: false, error: err };
        failCount++;
        hasError = true;

        onItemComplete?.({
          index,
          total: items.length,
          item,
          success: false,
          error: err,
        });

        if (!continueOnError) {
          throw err;
        }
      }
    }
  }

  // 创建并发工作线程
  const workerCount = Math.min(maxConcurrency, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());

  try {
    await Promise.all(workers);
  } catch (error) {
    // 如果 continueOnError 为 false，这里会捕获到错误
    if (!continueOnError) {
      throw error;
    }
  }

  return { results, successCount, failCount };
}

/**
 * 简化版并发执行（返回成功结果数组）
 * 
 * @description 对于不需要详细错误信息的场景，提供更简洁的 API
 * 
 * @example
 * ```typescript
 * const results = await mapWithConcurrency(
 *   urls,
 *   async (url) => fetch(url).then(r => r.json()),
 *   5 // 最大并发数
 * );
 * ```
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrency: number = 5,
  onProgress?: (completed: number, total: number) => void
): Promise<Array<{ value?: R; error?: Error }>> {
  let completed = 0;

  const { results } = await executeWithConcurrency(
    items,
    processor,
    {
      maxConcurrency,
      continueOnError: true,
      onItemComplete: () => {
        completed++;
        onProgress?.(completed, items.length);
      },
    }
  );

  return results.map(r => ({
    value: r.result,
    error: r.error,
  }));
}

/**
 * 批次处理（带批次间延迟）
 * 
 * @description 将任务分批处理，每批之间可以设置延迟
 * 
 * @example
 * ```typescript
 * const results = await processBatches(
 *   items,
 *   10, // 每批 10 个
 *   async (batch, batchIndex) => {
 *     return await Promise.all(batch.map(processItem));
 *   },
 *   {
 *     delayBetweenBatches: 5000, // 批次间隔 5 秒
 *     onBatchComplete: (batchIndex, totalBatches) => {
 *       console.log(`Batch ${batchIndex + 1}/${totalBatches} complete`);
 *     },
 *   }
 * );
 * ```
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[], batchIndex: number) => Promise<R[]>,
  options: {
    delayBetweenBatches?: number;
    onBatchComplete?: (batchIndex: number, totalBatches: number) => void;
  } = {}
): Promise<R[]> {
  const { delayBetweenBatches = 0, onBatchComplete } = options;
  const results: R[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const batch = items.slice(start, start + batchSize);

    const batchResults = await processor(batch, i);
    results.push(...batchResults);

    onBatchComplete?.(i, totalBatches);

    // 批次间延迟（最后一批不需要）
    if (delayBetweenBatches > 0 && i < totalBatches - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}
