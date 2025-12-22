/**
 * 异步任务服务
 * 
 * 实现轮询模式，按照开发规范第10章：
 * 1. 提交任务（submit-task）
 * 2. 轮询检查状态（check-task）
 * 3. 返回结果
 */

const SUPABASE_URL = "https://qqlwechtvktkhuheoeja.supabase.co";
const SUBMIT_TASK_URL = `${SUPABASE_URL}/functions/v1/submit-task`;
const CHECK_TASK_URL = `${SUPABASE_URL}/functions/v1/check-task`;
const PROCESS_TASK_URL = `${SUPABASE_URL}/functions/v1/process-task`;

// ==================== 配置常量 ====================

/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 3000;

/** 轮询超时（毫秒）- 10分钟 */
const POLL_TIMEOUT = 10 * 60 * 1000;

/** 最大重试次数 */
const MAX_RETRIES = 3;

/** Pending 状态超时阈值（毫秒）- 超过此时间的 pending 任务将被重新触发 */
const PENDING_TIMEOUT = 15000;  // 15 秒

// ==================== 类型定义 ====================

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export interface SubmitTaskInput {
  taskType: "gemini-image-step1" | "gemini-image-step2";
  conversationId: string;
  prompt: string;
  images: ImageInput[];
  aspectRatio: string;
  imageSize: string;
  count: number;
}

// ===== OCR 任务类型 =====

export interface SubmitOcrTaskInput {
  taskType: "dify-ocr";
  conversationId: string;
  wording: string;
  imageData: string;  // Base64 图片数据（含 data:image/xxx;base64, 前缀）
  imageName?: string;
}

export interface OcrTaskResult {
  taskId: string;
  status: "pending" | "processing" | "done" | "failed";
  outputData?: {
    text: string;
    duration: number;
  };
  errorMessage?: string;
  triggerId?: string;
  createdAt?: string;
}

export interface AsyncOcrResult {
  success: boolean;
  text: string;
  duration?: number;
  error?: string;
}

// ===== 图片生成任务类型 =====

export interface TaskResult {
  taskId: string;
  status: "pending" | "processing" | "done" | "failed";
  outputData?: {
    generatedImages: string[];
    successCount: number;
    totalCount: number;
  };
  errorMessage?: string;
  triggerId?: string;  // 用于重新触发 pending 任务
  createdAt?: string;
}

export interface AsyncTaskResult {
  success: boolean;
  generatedImages: string[];
  successCount: number;
  totalCount: number;
  error?: string;
}

// ==================== 工具函数 ====================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== API 调用 ====================

/**
 * 提交任务（带重试）
 */
async function submitTask(input: SubmitTaskInput): Promise<{ success: boolean; taskId?: string; error?: string }> {
  console.log("[AsyncTask] 提交任务:", input.taskType);
  
  let lastError: string = "未知错误";
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(SUBMIT_TASK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: input.taskType,
          conversationId: input.conversationId,
          inputData: {
            prompt: input.prompt,
            images: input.images,
            aspectRatio: input.aspectRatio,
            imageSize: input.imageSize,
            count: input.count,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `提交失败: ${response.status} - ${errorText}`;
        console.error(`[AsyncTask] 提交失败 (尝试 ${attempt}/${MAX_RETRIES}):`, errorText);
        
        if (attempt < MAX_RETRIES) {
          const delayMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`[AsyncTask] 等待 ${Math.round(delayMs)}ms 后重试...`);
          await delay(delayMs);
          continue;
        }
        return { success: false, error: lastError };
      }

      const result = await response.json();
      
      if (result.success && result.taskId) {
        console.log("[AsyncTask] 任务已提交:", result.taskId);
        return { success: true, taskId: result.taskId };
      }
      
      return { success: false, error: result.error || "提交失败" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "网络错误";
      console.warn(`[AsyncTask] 提交异常 (尝试 ${attempt}/${MAX_RETRIES}):`, error);
      
      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[AsyncTask] 等待 ${Math.round(delayMs)}ms 后重试...`);
        await delay(delayMs);
        continue;
      }
    }
  }
  
  console.error("[AsyncTask] 所有重试均失败:", lastError);
  return { success: false, error: lastError };
}

/**
 * 检查任务状态
 */
async function checkTask(taskIds: string[]): Promise<{ success: boolean; tasks?: TaskResult[]; allCompleted?: boolean; error?: string }> {
  try {
    const response = await fetch(CHECK_TASK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AsyncTask] 查询失败:", errorText);
      return { success: false, error: `查询失败: ${response.status}` };
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("[AsyncTask] 查询异常:", error);
    return { success: false, error: error instanceof Error ? error.message : "网络错误" };
  }
}

/**
 * 重新触发 pending 任务的处理
 * 
 * 当任务长时间停留在 pending 状态时调用
 */
async function retriggerPendingTask(taskId: string, triggerId: string): Promise<boolean> {
  console.log(`[AsyncTask] 重新触发任务: ${taskId}`);
  
  try {
    const response = await fetch(PROCESS_TASK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, triggerId }),
    });
    
    if (!response.ok) {
      console.warn(`[AsyncTask] 重新触发失败: ${response.status}`);
      return false;
    }
    
    console.log(`[AsyncTask] 重新触发成功: ${taskId}`);
    return true;
  } catch (error) {
    console.error("[AsyncTask] 重新触发异常:", error);
    return false;
  }
}

// ==================== 轮询逻辑 ====================

/**
 * 轮询等待任务完成
 */
async function pollUntilComplete(
  taskId: string,
  onProgress?: (status: string) => void
): Promise<TaskResult | null> {
  const startTime = Date.now();
  let retryCount = 0;
  
  console.log("[AsyncTask] 开始轮询:", taskId);
  
  while (Date.now() - startTime < POLL_TIMEOUT) {
    // 轮询间隔
    await delay(POLL_INTERVAL);
    
    const result = await checkTask([taskId]);
    
    if (!result.success) {
      retryCount++;
      console.warn(`[AsyncTask] 查询失败，重试 ${retryCount}/${MAX_RETRIES}`);
      
      if (retryCount >= MAX_RETRIES) {
        console.error("[AsyncTask] 达到最大重试次数");
        return null;
      }
      continue;
    }
    
    // 重置重试计数
    retryCount = 0;
    
    const task = result.tasks?.find(t => t.taskId === taskId);
    
    if (!task) {
      console.error("[AsyncTask] 任务不存在");
      return null;
    }
    
    console.log(`[AsyncTask] 任务状态: ${task.status}`);
    onProgress?.(task.status);
    
    // 检查是否完成
    if (task.status === "done" || task.status === "failed") {
      console.log("[AsyncTask] 任务完成:", task.status);
      return task;
    }
  }
  
  console.error("[AsyncTask] 轮询超时");
  return null;
}

// ==================== 批量轮询逻辑 ====================

/**
 * 批量轮询等待多个任务完成
 * 
 * @param taskIds - 任务ID列表
 * @param onProgress - 进度回调
 * @returns 所有任务的结果
 */
async function pollBatchUntilComplete(
  taskIds: string[],
  onProgress?: (status: string, completed: number, total: number) => void
): Promise<TaskResult[]> {
  const startTime = Date.now();
  let retryCount = 0;
  const completedTasks: Map<string, TaskResult> = new Map();
  const retriggeredTasks: Set<string> = new Set();  // 已重新触发过的任务
  
  console.log(`[AsyncTask] 开始批量轮询: ${taskIds.length} 个任务`);
  
  while (Date.now() - startTime < POLL_TIMEOUT) {
    // 轮询间隔
    await delay(POLL_INTERVAL);
    
    // 找出还未完成的任务
    const pendingTaskIds = taskIds.filter(id => !completedTasks.has(id));
    
    if (pendingTaskIds.length === 0) {
      console.log("[AsyncTask] 所有任务已完成");
      break;
    }
    
    const result = await checkTask(pendingTaskIds);
    
    if (!result.success) {
      retryCount++;
      console.warn(`[AsyncTask] 批量查询失败，重试 ${retryCount}/${MAX_RETRIES}`);
      
      if (retryCount >= MAX_RETRIES) {
        console.error("[AsyncTask] 达到最大重试次数");
        break;
      }
      continue;
    }
    
    // 重置重试计数
    retryCount = 0;
    
    const now = Date.now();
    
    // 检查每个任务的状态
    for (const task of result.tasks || []) {
      if (task.status === "done" || task.status === "failed") {
        completedTasks.set(task.taskId, task);
        console.log(`[AsyncTask] 任务完成: ${task.taskId} -> ${task.status}`);
      } else if (task.status === "pending" && task.triggerId && task.createdAt) {
        // 检测长时间 pending 的任务
        const createdTime = new Date(task.createdAt).getTime();
        const pendingDuration = now - createdTime;
        
        // 如果 pending 超过阈值，且未重新触发过，则重新触发
        if (pendingDuration > PENDING_TIMEOUT && !retriggeredTasks.has(task.taskId)) {
          console.warn(`[AsyncTask] 任务 ${task.taskId} pending 超过 ${PENDING_TIMEOUT}ms，重新触发处理`);
          retriggeredTasks.add(task.taskId);
          
          // 异步重新触发，不等待结果
          retriggerPendingTask(task.taskId, task.triggerId).catch((err) => {
            console.error(`[AsyncTask] 重新触发失败:`, err);
          });
        }
      }
    }
    
    // 报告进度
    const completedCount = completedTasks.size;
    console.log(`[AsyncTask] 进度: ${completedCount}/${taskIds.length}`);
    onProgress?.("processing", completedCount, taskIds.length);
  }
  
  // 返回所有任务结果（包括完成的和超时的）
  return taskIds.map(id => {
    const task = completedTasks.get(id);
    if (task) {
      return task;
    }
    // 未完成的任务标记为失败
    return {
      taskId: id,
      status: "failed" as const,
      errorMessage: "任务超时",
    };
  });
}

// ==================== 主入口 ====================

/**
 * 执行异步图片生成任务（单任务模式）
 * 
 * @deprecated 请使用 executeAsyncTaskBatch 代替
 */
export async function executeAsyncTask(
  input: SubmitTaskInput,
  onProgress?: (status: string) => void
): Promise<AsyncTaskResult> {
  // 委托给批量模式
  return executeAsyncTaskBatch(input, (status) => onProgress?.(status));
}

/**
 * 执行异步图片生成任务（批量模式）
 * 
 * 策略：每个任务只生成 1 张图片，提交多个独立任务并行执行
 * 
 * 优点：
 * 1. 每个任务时间短，不会超时
 * 2. 充分利用 Edge Function 的并发能力
 * 3. 单个失败不影响其他
 * 
 * @param input - 任务输入（count 表示需要生成的总数）
 * @param onProgress - 进度回调
 * @returns 生成结果
 */
export async function executeAsyncTaskBatch(
  input: SubmitTaskInput,
  onProgress?: (status: string, completed?: number, total?: number) => void
): Promise<AsyncTaskResult> {
  const totalCount = input.count || 3;
  
  console.log("[AsyncTask] ========== 开始批量异步任务 ==========");
  console.log("[AsyncTask] 类型:", input.taskType);
  console.log("[AsyncTask] 对话ID:", input.conversationId);
  console.log("[AsyncTask] 生成数量:", totalCount);
  console.log("[AsyncTask] 策略: 每个任务生成 1 张，共提交", totalCount, "个任务");
  
  // 1. 并行提交多个任务，每个任务 count=1
  onProgress?.("submitting", 0, totalCount);
  
  const submitPromises = Array.from({ length: totalCount }, (_, index) => {
    const singleTaskInput: SubmitTaskInput = {
      ...input,
      count: 1,  // 关键：每个任务只生成 1 张
    };
    return submitTask(singleTaskInput).then(result => ({
      index,
      ...result,
    }));
  });
  
  const submitResults = await Promise.all(submitPromises);
  
  // 检查提交结果
  const successfulSubmits = submitResults.filter(r => r.success && r.taskId);
  const failedSubmits = submitResults.filter(r => !r.success);
  
  console.log(`[AsyncTask] 提交结果: 成功 ${successfulSubmits.length}/${totalCount}`);
  
  if (successfulSubmits.length === 0) {
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount,
      error: "所有任务提交失败: " + (failedSubmits[0]?.error || "未知错误"),
    };
  }
  
  // 2. 批量轮询等待完成
  onProgress?.("processing", 0, totalCount);
  
  const taskIds = successfulSubmits.map(r => r.taskId!);
  const taskResults = await pollBatchUntilComplete(
    taskIds,
    (status, completed, total) => onProgress?.(status, completed, total)
  );
  
  // 3. 汇总结果
  const generatedImages: string[] = [];
  let successCount = 0;
  const errors: string[] = [];
  
  for (const result of taskResults) {
    if (result.status === "done" && result.outputData?.generatedImages?.length) {
      generatedImages.push(...result.outputData.generatedImages);
      successCount += result.outputData.successCount;
    } else if (result.status === "failed") {
      errors.push(result.errorMessage || "未知错误");
    }
  }
  
  console.log(`[AsyncTask] 最终结果: 成功 ${successCount}/${totalCount} 张图片`);
  
  // 只要有成功的就算成功
  if (successCount > 0) {
    return {
      success: true,
      generatedImages,
      successCount,
      totalCount,
      error: errors.length > 0 ? `部分失败: ${errors.join("; ")}` : undefined,
    };
  }
  
  return {
    success: false,
    generatedImages: [],
    successCount: 0,
    totalCount,
    error: errors.join("; ") || "所有任务执行失败",
  };
}

// ==================== OCR 任务相关 ====================

/**
 * 提交 OCR 任务（带重试）
 */
async function submitOcrTask(input: SubmitOcrTaskInput): Promise<{ success: boolean; taskId?: string; error?: string }> {
  console.log("[AsyncTask] 提交 OCR 任务");
  
  let lastError: string = "未知错误";
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(SUBMIT_TASK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: input.taskType,
          conversationId: input.conversationId,
          inputData: {
            wording: input.wording,
            imageData: input.imageData,
            imageName: input.imageName,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `提交失败: ${response.status} - ${errorText}`;
        console.error(`[AsyncTask] OCR 任务提交失败 (尝试 ${attempt}/${MAX_RETRIES}):`, errorText);
        
        if (attempt < MAX_RETRIES) {
          const delayMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`[AsyncTask] 等待 ${Math.round(delayMs)}ms 后重试...`);
          await delay(delayMs);
          continue;
        }
        return { success: false, error: lastError };
      }

      const result = await response.json();
      
      if (result.success && result.taskId) {
        console.log("[AsyncTask] OCR 任务已提交:", result.taskId);
        return { success: true, taskId: result.taskId };
      }
      
      return { success: false, error: result.error || "提交失败" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "网络错误";
      console.warn(`[AsyncTask] OCR 任务提交异常 (尝试 ${attempt}/${MAX_RETRIES}):`, error);
      
      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[AsyncTask] 等待 ${Math.round(delayMs)}ms 后重试...`);
        await delay(delayMs);
        continue;
      }
    }
  }
  
  console.error("[AsyncTask] OCR 所有重试均失败:", lastError);
  return { success: false, error: lastError };
}

/**
 * 轮询等待 OCR 任务完成
 */
async function pollOcrUntilComplete(
  taskId: string,
  onProgress?: (status: string) => void
): Promise<OcrTaskResult | null> {
  const startTime = Date.now();
  let retryCount = 0;
  let hasRetriggered = false;
  
  console.log(`[AsyncTask] 开始轮询 OCR 任务: ${taskId}`);
  
  while (Date.now() - startTime < POLL_TIMEOUT) {
    await delay(POLL_INTERVAL);
    
    const result = await checkTask([taskId]);
    
    if (!result.success) {
      retryCount++;
      console.warn(`[AsyncTask] OCR 查询失败，重试 ${retryCount}/${MAX_RETRIES}`);
      
      if (retryCount >= MAX_RETRIES) {
        console.error("[AsyncTask] OCR 达到最大重试次数");
        return null;
      }
      continue;
    }
    
    retryCount = 0;
    
    const task = result.tasks?.find(t => t.taskId === taskId);
    
    if (!task) {
      console.error("[AsyncTask] OCR 任务不存在");
      return null;
    }
    
    console.log(`[AsyncTask] OCR 任务状态: ${task.status}`);
    onProgress?.(task.status);
    
    // 检查是否完成
    if (task.status === "done" || task.status === "failed") {
      console.log("[AsyncTask] OCR 任务完成:", task.status);
      return task as OcrTaskResult;
    }
    
    // 检测长时间 pending 的任务
    if (task.status === "pending" && task.triggerId && task.createdAt && !hasRetriggered) {
      const createdTime = new Date(task.createdAt).getTime();
      const pendingDuration = Date.now() - createdTime;
      
      if (pendingDuration > PENDING_TIMEOUT) {
        console.warn(`[AsyncTask] OCR 任务 ${taskId} pending 超过 ${PENDING_TIMEOUT}ms，重新触发处理`);
        hasRetriggered = true;
        
        // 使用 process-ocr-task 重新触发
        retriggerOcrPendingTask(taskId, task.triggerId).catch((err) => {
          console.error(`[AsyncTask] OCR 重新触发失败:`, err);
        });
      }
    }
  }
  
  console.error("[AsyncTask] OCR 轮询超时");
  return null;
}

/**
 * 重新触发 pending 的 OCR 任务
 */
async function retriggerOcrPendingTask(taskId: string, triggerId: string): Promise<boolean> {
  console.log(`[AsyncTask] 重新触发 OCR 任务: ${taskId}`);
  
  const PROCESS_OCR_TASK_URL = `${SUPABASE_URL}/functions/v1/process-ocr-task`;
  
  try {
    const response = await fetch(PROCESS_OCR_TASK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, triggerId }),
    });
    
    if (!response.ok) {
      console.warn(`[AsyncTask] OCR 重新触发失败: ${response.status}`);
      return false;
    }
    
    console.log(`[AsyncTask] OCR 重新触发成功: ${taskId}`);
    return true;
  } catch (error) {
    console.error("[AsyncTask] OCR 重新触发异常:", error);
    return false;
  }
}

/**
 * 执行单个 OCR 任务（提交 + 轮询）
 * 
 * @param conversationId - 对话 ID
 * @param wording - 参考文字
 * @param imageData - 图片 Base64 数据
 * @param imageName - 图片名称（可选）
 * @param onProgress - 进度回调
 * @returns OCR 结果
 */
export async function executeOcrTask(
  conversationId: string,
  wording: string,
  imageData: string,
  imageName?: string,
  onProgress?: (status: string) => void
): Promise<AsyncOcrResult> {
  console.log("[AsyncTask] 执行 OCR 任务");
  
  // 1. 提交任务
  const submitResult = await submitOcrTask({
    taskType: "dify-ocr",
    conversationId,
    wording,
    imageData,
    imageName,
  });
  
  if (!submitResult.success || !submitResult.taskId) {
    return {
      success: false,
      text: "",
      error: submitResult.error || "任务提交失败",
    };
  }
  
  // 2. 轮询等待完成
  const taskResult = await pollOcrUntilComplete(submitResult.taskId, onProgress);
  
  if (!taskResult) {
    return {
      success: false,
      text: "",
      error: "任务超时或查询失败",
    };
  }
  
  if (taskResult.status === "done" && taskResult.outputData) {
    return {
      success: true,
      text: taskResult.outputData.text || "",
      duration: taskResult.outputData.duration,
    };
  }
  
  return {
    success: false,
    text: "",
    error: taskResult.errorMessage || "任务执行失败",
  };
}

/**
 * 批量执行 OCR 任务（并发提交 + 批量轮询 + pending 重触发）
 * 
 * @param conversationId - 对话 ID
 * @param tasks - OCR 任务列表
 * @param options - 选项
 * @returns OCR 结果列表
 */
export async function executeBatchOcrTasks(
  conversationId: string,
  tasks: Array<{
    wording: string;
    imageData: string;
    imageName?: string;
    lineIndex: number;
  }>,
  options?: {
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Array<{ lineIndex: number; text: string; error?: string; duration?: number }>> {
  const { onProgress } = options || {};
  const totalCount = tasks.length;
  
  console.log(`[AsyncTask] 批量执行 ${totalCount} 个 OCR 任务`);
  
  // 1. 并发提交所有任务
  const submitPromises = tasks.map((task, index) => 
    submitOcrTask({
      taskType: "dify-ocr",
      conversationId,
      wording: task.wording,
      imageData: task.imageData,
      imageName: task.imageName,
    }).then(result => ({
      index,
      lineIndex: task.lineIndex,
      ...result,
    }))
  );
  
  const submitResults = await Promise.all(submitPromises);
  
  // 检查提交结果
  const successfulSubmits = submitResults.filter(r => r.success && r.taskId);
  const failedSubmits = submitResults.filter(r => !r.success);
  
  console.log(`[AsyncTask] OCR 任务提交: 成功 ${successfulSubmits.length}/${totalCount}`);
  
  // 创建结果数组
  const results: Array<{ lineIndex: number; text: string; error?: string; duration?: number }> = [];
  
  // 添加提交失败的任务结果
  for (const failed of failedSubmits) {
    results.push({
      lineIndex: failed.lineIndex,
      text: "",
      error: failed.error || "任务提交失败",
    });
  }
  
  if (successfulSubmits.length === 0) {
    return results;
  }
  
  // 2. 批量轮询等待完成
  const taskIds = successfulSubmits.map(r => r.taskId!);
  const taskIndexMap = new Map(successfulSubmits.map(r => [r.taskId!, r.lineIndex]));
  
  const taskResults = await pollBatchOcrUntilComplete(
    taskIds,
    (status, completed, total) => onProgress?.(completed, total)
  );
  
  // 3. 汇总结果
  for (const taskResult of taskResults) {
    const lineIndex = taskIndexMap.get(taskResult.taskId) ?? -1;
    
    if (taskResult.status === "done" && taskResult.outputData) {
      results.push({
        lineIndex,
        text: taskResult.outputData.text || "",
        duration: taskResult.outputData.duration,
      });
    } else {
      results.push({
        lineIndex,
        text: "",
        error: taskResult.errorMessage || "任务执行失败",
      });
    }
  }
  
  // 按 lineIndex 排序
  results.sort((a, b) => a.lineIndex - b.lineIndex);
  
  const successCount = results.filter(r => !r.error).length;
  console.log(`[AsyncTask] OCR 批量完成: 成功 ${successCount}/${totalCount}`);
  
  return results;
}

/**
 * 批量轮询等待多个 OCR 任务完成
 */
async function pollBatchOcrUntilComplete(
  taskIds: string[],
  onProgress?: (status: string, completed: number, total: number) => void
): Promise<OcrTaskResult[]> {
  const startTime = Date.now();
  let retryCount = 0;
  const completedTasks: Map<string, OcrTaskResult> = new Map();
  const retriggeredTasks: Set<string> = new Set();
  
  console.log(`[AsyncTask] 开始批量轮询 OCR: ${taskIds.length} 个任务`);
  
  while (Date.now() - startTime < POLL_TIMEOUT) {
    await delay(POLL_INTERVAL);
    
    const pendingTaskIds = taskIds.filter(id => !completedTasks.has(id));
    
    if (pendingTaskIds.length === 0) {
      console.log("[AsyncTask] 所有 OCR 任务已完成");
      break;
    }
    
    const result = await checkTask(pendingTaskIds);
    
    if (!result.success) {
      retryCount++;
      console.warn(`[AsyncTask] OCR 批量查询失败，重试 ${retryCount}/${MAX_RETRIES}`);
      
      if (retryCount >= MAX_RETRIES) {
        console.error("[AsyncTask] OCR 达到最大重试次数");
        break;
      }
      continue;
    }
    
    retryCount = 0;
    const now = Date.now();
    
    for (const task of result.tasks || []) {
      if (task.status === "done" || task.status === "failed") {
        completedTasks.set(task.taskId, task as OcrTaskResult);
        console.log(`[AsyncTask] OCR 任务完成: ${task.taskId} -> ${task.status}`);
      } else if (task.status === "pending" && task.triggerId && task.createdAt) {
        const createdTime = new Date(task.createdAt).getTime();
        const pendingDuration = now - createdTime;
        
        if (pendingDuration > PENDING_TIMEOUT && !retriggeredTasks.has(task.taskId)) {
          console.warn(`[AsyncTask] OCR 任务 ${task.taskId} pending 超过 ${PENDING_TIMEOUT}ms，重新触发处理`);
          retriggeredTasks.add(task.taskId);
          
          retriggerOcrPendingTask(task.taskId, task.triggerId).catch((err) => {
            console.error(`[AsyncTask] OCR 重新触发失败:`, err);
          });
        }
      }
    }
    
    const completedCount = completedTasks.size;
    console.log(`[AsyncTask] OCR 进度: ${completedCount}/${taskIds.length}`);
    onProgress?.("processing", completedCount, taskIds.length);
  }
  
  // 返回所有任务结果
  return taskIds.map(id => {
    const task = completedTasks.get(id);
    if (task) {
      return task;
    }
    return {
      taskId: id,
      status: "failed" as const,
      errorMessage: "任务超时",
    };
  });
}
