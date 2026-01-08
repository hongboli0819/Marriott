/**
 * Dify OCR 客户端
 * 
 * 健壮的异步任务模式：
 * 1. 分批并发：每批 N 个任务同时请求，完成后再下一批
 * 2. 基于 updatedAt 的超时检测：
 *    - 40秒无更新：重新提交新任务
 *    - 同一 lineIndex 可能有多个任务同时运行
 * 3. 去重：同一 lineIndex 多次成功时使用最先成功的
 * 4. 持续轮询追踪状态
 */

// Supabase 配置
const SUPABASE_URL = "https://qqlwechtvktkhuheoeja.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbHdlY2h0dmt0a2h1aGVvZWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTk2OTgsImV4cCI6MjA3OTczNTY5OH0.yGSijURBrllzdHYSqnqA792GAapWW9tK3y_ukUfj4XQ";

// Playground 开发环境使用代理路径，绕过 CORS
// 只在端口 5177（Playground）时使用代理，主应用（端口 3002）直接访问 Supabase
const isPlaygroundDev = typeof window !== 'undefined' && window.location.port === '5177';
const REST_API_BASE = isPlaygroundDev ? "/supabase-rest" : `${SUPABASE_URL}/rest/v1`;
const FUNCTIONS_BASE = isPlaygroundDev ? "/supabase-functions" : `${SUPABASE_URL}/functions/v1`;

const SUBMIT_TASK_URL = `${FUNCTIONS_BASE}/submit-task`;
const CHECK_TASK_URL = `${FUNCTIONS_BASE}/check-task`;

// ==================== 配置常量 ====================

const MAX_SUBMIT_RETRIES = 3;         // 提交任务的最大重试次数
const POLL_INTERVAL = 3000;           // 轮询间隔 3 秒
const POLL_TIMEOUT = 10 * 60 * 1000;  // 轮询总超时 10 分钟
const STUCK_TIMEOUT = 40000;          // 40 秒无更新则重新提交
const DEFAULT_BATCH_SIZE = 10;        // 默认每批并发数
const MAX_RESUBMIT_COUNT = 3;         // 每个 lineIndex 最多重新提交次数
const NEW_TASK_GRACE_PERIOD = 10000;  // 新任务 10 秒内不检测超时

// 当前会话 ID
let currentConversationId: string | null = null;

/**
 * 设置当前会话 ID
 */
export function setConversationId(id: string | null): void {
  currentConversationId = id;
  console.log(`[DifyClient] 设置 conversationId: ${id}`);
}

/**
 * 创建一个 Playground 专用的 conversation 记录
 * 用于解决 async_tasks 表的外键约束问题
 */
export async function createPlaygroundConversation(): Promise<string | null> {
  try {
    console.log("[DifyClient] 创建 Playground conversation...");
    
    const frontendId = `playground-${Date.now()}`;
    // 使用一个固定的 playground 用户 ID
    const playgroundUserId = "playground-user-" + Math.random().toString(36).slice(2, 10);
    
    const response = await fetch(
      `${REST_API_BASE}/chat_conversations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          title: "Image Diff Playground",
          frontend_id: frontendId,
          user_id: playgroundUserId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[DifyClient] 创建 conversation 失败:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const conversationId = data[0]?.id;
    
    if (conversationId) {
      console.log("[DifyClient] Playground conversation 创建成功:", conversationId);
      setConversationId(conversationId);
      return conversationId;
    }
    
    return null;
  } catch (error) {
    console.error("[DifyClient] 创建 conversation 异常:", error);
    return null;
  }
}

// ==================== 类型定义 ====================

interface OcrTaskResult {
  taskId: string;
  status: "pending" | "processing" | "done" | "failed";
  outputData?: {
    text: string;
    duration: number;
  };
  errorMessage?: string;
  triggerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OCRResult {
  lineIndex: number;
  text: string;
  error?: string;
  duration?: number;
}

export interface BatchOCROptions {
  /** 每批并发数，默认 10 */
  batchSize?: number;
  /** 进度回调 */
  onProgress?: (completed: number, total: number, result: OCRResult) => void;
}

interface TaskInfo {
  lineIndex: number;
  wording: string;
  imageDataUrl: string;
  imageName?: string;
}

interface ActiveTask {
  taskId: string;
  lineIndex: number;
  taskInfo: TaskInfo;
  submittedAt: number;      // 提交时间
  resubmitCount: number;    // 该任务已重新提交次数
  isNew: boolean;           // 是否是新提交的任务（给予宽限期）
}

// ==================== 工具函数 ====================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== API 函数 ====================

/**
 * 提交 OCR 任务（带重试）
 */
async function submitOcrTask(
  wording: string,
  imageData: string,
  imageName?: string
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  if (!currentConversationId) {
    return { success: false, error: "未设置 conversationId" };
  }
  
  let lastError = "未知错误";
  
  for (let attempt = 1; attempt <= MAX_SUBMIT_RETRIES; attempt++) {
    try {
      const response = await fetch(SUBMIT_TASK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "dify-ocr",
          conversationId: currentConversationId,
          inputData: { wording, imageData, imageName: imageName || "line-preview.png" },
        }),
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (attempt < MAX_SUBMIT_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
        return { success: false, error: lastError };
      }

      const result = await response.json();
      if (result.success && result.taskId) {
        return { success: true, taskId: result.taskId };
      }
      return { success: false, error: result.error || "提交失败" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "网络错误";
      if (attempt < MAX_SUBMIT_RETRIES) {
        await delay(1000 * attempt);
        continue;
      }
    }
  }
  
  return { success: false, error: lastError };
}

/**
 * 批量检查任务状态
 */
async function checkTasks(taskIds: string[]): Promise<{ success: boolean; tasks?: OcrTaskResult[] }> {
  try {
    const response = await fetch(CHECK_TASK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds }),
    });

    if (!response.ok) {
      return { success: false };
    }

    const result = await response.json();
    return { success: result.success, tasks: result.tasks };
  } catch (error) {
    console.error("[DifyClient] 检查任务失败:", error);
    return { success: false };
  }
}

// ==================== 核心逻辑 ====================

/**
 * 批量调用 Dify OCR
 * 
 * 实现：
 * 1. 分批并发：每批 batchSize 个任务同时提交，等全部完成再下一批
 * 2. 基于 updatedAt 超时检测：40秒无更新则重新提交
 * 3. 去重：同一 lineIndex 多次成功时使用最先成功的
 */
export async function batchCallDifyOCR(
  tasks: Array<{
    wording: string;
    imageDataUrl: string;
    imageName?: string;
    lineIndex: number;
  }>,
  options: BatchOCROptions | number = {}
): Promise<Array<OCRResult>> {
  const opts: BatchOCROptions = typeof options === 'number' 
    ? { batchSize: options } 
    : options;
  
  const batchSize = opts.batchSize || DEFAULT_BATCH_SIZE;
  const { onProgress } = opts;
  const totalCount = tasks.length;

  console.log(`[DifyClient] 批量 OCR: ${totalCount} 个任务，每批 ${batchSize} 个`);

  const startTime = Date.now();
  
  // 最终结果（lineIndex -> 结果），已有结果的不会被覆盖（去重）
  const finalResults: Map<number, OCRResult> = new Map();
  
  // 按批次处理
  for (let batchStart = 0; batchStart < tasks.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, tasks.length);
    const batchTasks = tasks.slice(batchStart, batchEnd);
    
    console.log(`[DifyClient] ========== 第 ${Math.floor(batchStart / batchSize) + 1} 批 (${batchTasks.length} 个) ==========`);
    
    // 处理这一批任务
    const batchResults = await processBatch(batchTasks);
    
    // 合并结果（去重：只保留最先成功的）
    for (const result of batchResults) {
      if (!finalResults.has(result.lineIndex)) {
        finalResults.set(result.lineIndex, result);
      }
    }
    
    // 报告进度
    const completedCount = finalResults.size;
    console.log(`[DifyClient] 已完成: ${completedCount}/${totalCount}`);
    onProgress?.(completedCount, totalCount, { lineIndex: -1, text: "" });
  }
  
  // 转换为数组并排序
  const results = Array.from(finalResults.values());
  results.sort((a, b) => a.lineIndex - b.lineIndex);
  
  const successCount = results.filter(r => !r.error).length;
  const failCount = results.filter(r => r.error).length;
  const totalDuration = Date.now() - startTime;
  
  console.log(`[DifyClient] 批量 OCR 完成: ${successCount} 成功, ${failCount} 失败, 耗时 ${totalDuration}ms`);
  
  return results;
}

/**
 * 处理一批任务（并发提交 + 轮询等待）
 */
async function processBatch(tasks: TaskInfo[]): Promise<OCRResult[]> {
  // 已完成的 lineIndex -> 结果（去重：第一个成功的优先）
  const completedResults: Map<number, OCRResult> = new Map();
  
  // 每个 lineIndex 的重新提交计数
  const resubmitCounts: Map<number, number> = new Map();
  
  // 活跃任务列表（taskId -> 任务信息）
  // 同一个 lineIndex 可能有多个任务同时在跑
  const activeTasks: Map<string, ActiveTask> = new Map();
  
  // 1. 并发提交所有任务
  console.log(`[DifyClient] 并发提交 ${tasks.length} 个任务...`);
  
  const submitPromises = tasks.map(task => 
    submitOcrTask(task.wording, task.imageDataUrl, task.imageName).then(result => ({
      task,
      ...result,
    }))
  );
  
  const submitResults = await Promise.all(submitPromises);
  
  for (const result of submitResults) {
    if (result.success && result.taskId) {
      activeTasks.set(result.taskId, {
        taskId: result.taskId,
        lineIndex: result.task.lineIndex,
        taskInfo: result.task,
        submittedAt: Date.now(),
        resubmitCount: 0,
        isNew: true,
      });
      console.log(`[DifyClient] ✓ 行 ${result.task.lineIndex} 提交成功: ${result.taskId.slice(-8)}`);
    } else {
      // 提交失败，直接记录错误
      completedResults.set(result.task.lineIndex, {
        lineIndex: result.task.lineIndex,
        text: "",
        error: result.error || "提交失败",
      });
      console.error(`[DifyClient] ✗ 行 ${result.task.lineIndex} 提交失败: ${result.error}`);
    }
  }
  
  if (activeTasks.size === 0) {
    return Array.from(completedResults.values());
  }
  
  // 2. 轮询等待所有任务完成
  const pollStartTime = Date.now();
  
  while (Date.now() - pollStartTime < POLL_TIMEOUT) {
    // 检查是否所有 lineIndex 都已完成
    const pendingLineIndices = new Set<number>();
    for (const task of activeTasks.values()) {
      if (!completedResults.has(task.lineIndex)) {
        pendingLineIndices.add(task.lineIndex);
      }
    }
    
    if (pendingLineIndices.size === 0) {
      console.log(`[DifyClient] 所有任务已完成`);
      break;
    }
    
    await delay(POLL_INTERVAL);
    
    const taskIds = Array.from(activeTasks.keys());
    console.log(`[DifyClient] 轮询 ${taskIds.length} 个任务 (${pendingLineIndices.size} 个 lineIndex 待完成)...`);
    
    const checkResult = await checkTasks(taskIds);
    
    if (!checkResult.success) {
      console.warn("[DifyClient] 查询失败，重试中...");
      continue;
    }
    
    const currentTime = Date.now();
    const returnedTasks = new Map((checkResult.tasks || []).map(t => [t.taskId, t]));
    
    // 收集需要新提交的任务（在循环外提交，避免边迭代边修改）
    const tasksToResubmit: ActiveTask[] = [];
    const tasksToRemove: string[] = [];
    
    // 处理每个任务
    for (const [taskId, activeTask] of activeTasks) {
      // 如果该 lineIndex 已经有结果了，删除这个任务
      if (completedResults.has(activeTask.lineIndex)) {
        tasksToRemove.push(taskId);
        continue;
      }
      
      const taskStatus = returnedTasks.get(taskId);
      
      if (!taskStatus) {
        // 任务在数据库中不存在
        const timeSinceSubmit = currentTime - activeTask.submittedAt;
        
        // 新任务给予宽限期
        if (timeSinceSubmit < NEW_TASK_GRACE_PERIOD) {
          console.log(`[DifyClient] 任务 ${taskId.slice(-8)} 刚提交 ${Math.round(timeSinceSubmit / 1000)}s，等待...`);
          continue;
        }
        
        console.warn(`[DifyClient] 任务 ${taskId.slice(-8)} 不存在，移除`);
        tasksToRemove.push(taskId);
        
        // 检查是否需要重新提交
        const currentResubmitCount = resubmitCounts.get(activeTask.lineIndex) || 0;
        if (currentResubmitCount < MAX_RESUBMIT_COUNT) {
          tasksToResubmit.push(activeTask);
        } else {
          completedResults.set(activeTask.lineIndex, {
            lineIndex: activeTask.lineIndex,
            text: "",
            error: "任务不存在（已达最大重试次数）",
          });
        }
        continue;
      }
      
      // 标记为非新任务
      activeTask.isNew = false;
      
      const updatedAt = taskStatus.updatedAt ? new Date(taskStatus.updatedAt).getTime() : activeTask.submittedAt;
      const timeSinceUpdate = currentTime - updatedAt;
      
      console.log(`[DifyClient] 任务 ${taskId.slice(-8)}: ${taskStatus.status}, 距上次更新 ${Math.round(timeSinceUpdate / 1000)}s`);
      
      if (taskStatus.status === "done") {
        // 成功完成 - 去重：第一个成功的优先
        if (!completedResults.has(activeTask.lineIndex)) {
          completedResults.set(activeTask.lineIndex, {
            lineIndex: activeTask.lineIndex,
            text: taskStatus.outputData?.text || "",
            duration: taskStatus.outputData?.duration,
          });
          console.log(`[DifyClient] ✓ 行 ${activeTask.lineIndex} 完成`);
        }
        tasksToRemove.push(taskId);
        
      } else if (taskStatus.status === "failed") {
        // 任务失败
        console.warn(`[DifyClient] 任务 ${taskId.slice(-8)} 失败: ${taskStatus.errorMessage}`);
        tasksToRemove.push(taskId);
        
        // 检查是否需要重新提交
        const currentResubmitCount = resubmitCounts.get(activeTask.lineIndex) || 0;
        if (currentResubmitCount < MAX_RESUBMIT_COUNT) {
          tasksToResubmit.push(activeTask);
        } else {
          completedResults.set(activeTask.lineIndex, {
            lineIndex: activeTask.lineIndex,
            text: "",
            error: taskStatus.errorMessage || "任务失败（已达最大重试次数）",
          });
        }
        
      } else if (timeSinceUpdate > STUCK_TIMEOUT) {
        // 超过 40 秒无更新，重新提交新任务
        console.warn(`[DifyClient] 行 ${activeTask.lineIndex} 卡住 ${Math.round(timeSinceUpdate / 1000)}s，重新提交`);
        
        // 不删除旧任务，让它继续跑（万一完成了就用它的结果）
        // 但提交一个新任务
        const currentResubmitCount = resubmitCounts.get(activeTask.lineIndex) || 0;
        if (currentResubmitCount < MAX_RESUBMIT_COUNT) {
          tasksToResubmit.push(activeTask);
        }
      }
    }
    
    // 删除需要删除的任务
    for (const taskId of tasksToRemove) {
      activeTasks.delete(taskId);
    }
    
    // 提交新任务
    for (const oldTask of tasksToResubmit) {
      // 如果该 lineIndex 已经完成，跳过
      if (completedResults.has(oldTask.lineIndex)) {
        continue;
      }
      
      const currentResubmitCount = resubmitCounts.get(oldTask.lineIndex) || 0;
      resubmitCounts.set(oldTask.lineIndex, currentResubmitCount + 1);
      
      console.log(`[DifyClient] 行 ${oldTask.lineIndex} 重新提交 (${currentResubmitCount + 1}/${MAX_RESUBMIT_COUNT})...`);
      
      const resubmitResult = await submitOcrTask(
        oldTask.taskInfo.wording,
        oldTask.taskInfo.imageDataUrl,
        oldTask.taskInfo.imageName
      );
      
      if (resubmitResult.success && resubmitResult.taskId) {
        activeTasks.set(resubmitResult.taskId, {
          taskId: resubmitResult.taskId,
          lineIndex: oldTask.lineIndex,
          taskInfo: oldTask.taskInfo,
          submittedAt: Date.now(),
          resubmitCount: currentResubmitCount + 1,
          isNew: true,
        });
        console.log(`[DifyClient] 新任务: ${resubmitResult.taskId.slice(-8)}`);
      } else {
        console.error(`[DifyClient] 重新提交失败: ${resubmitResult.error}`);
      }
    }
    
    console.log(`[DifyClient] 剩余 ${activeTasks.size} 个任务`);
  }
  
  // 超时的任务标记为失败
  for (const activeTask of activeTasks.values()) {
    if (!completedResults.has(activeTask.lineIndex)) {
      completedResults.set(activeTask.lineIndex, {
        lineIndex: activeTask.lineIndex,
        text: "",
        error: "任务超时",
      });
    }
  }
  
  return Array.from(completedResults.values());
}

/**
 * 单个 OCR 调用（简化接口）
 */
export async function callDifyOCR(
  wording: string,
  imageDataUrl: string,
  imageName?: string
): Promise<string> {
  const results = await batchCallDifyOCR([
    { wording, imageDataUrl, imageName, lineIndex: 0 }
  ]);
  
  if (results.length > 0 && !results[0].error) {
    return results[0].text;
  }
  
  throw new Error(results[0]?.error || "OCR 失败");
}
