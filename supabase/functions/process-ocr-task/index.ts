/**
 * process-ocr-task Edge Function
 * 
 * 职责：执行实际的 OCR 任务（调用 Dify API）
 * 
 * 按照开发规范第10章实现：
 * 1. 使用乐观锁（trigger_id）防止重复处理
 * 2. 带重试的 Dify API 调用
 * 3. 更新任务状态和结果
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as base64Decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// 🔧 强制使用正确的 API Key（绕过可能错误配置的环境变量）
const DIFY_API_BASE = "https://dify-prod.tezign.com/v1";
const DIFY_API_KEY = "app-Yk22GvTsSujKQ1JCgNJoOG0U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ===== 配置常量 =====
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;
const REQUEST_TIMEOUT_MS = 120000;

interface ProcessOcrTaskRequest {
  taskId: string;
  triggerId: string;
}

interface OcrInputData {
  wording: string;
  imageData: string;  // Base64 图片数据
  imageName?: string;
}

interface DifyFileUploadResponse {
  id: string;
  name: string;
  size: number;
  extension: string;
  mime_type: string;
  created_by: string;
  created_at: number;
}

interface DifyChatRequest {
  inputs: Record<string, unknown>;
  query: string;
  response_mode: "blocking" | "streaming";
  user: string;
  files?: Array<{
    type: "image";
    transfer_method: "local_file";
    upload_file_id: string;
  }>;
}

interface DifyChatResponse {
  event: string;
  task_id: string;
  id: string;
  message_id: string;
  conversation_id: string;
  mode: string;
  answer: string;
  metadata: Record<string, unknown>;
  created_at: number;
}

// ===== 工具函数 =====

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = RETRY_BASE_DELAY_MS,
  maxDelay: number = RETRY_MAX_DELAY_MS
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
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

// ===== Dify 操作函数 =====

async function uploadFile(
  fileData: Uint8Array,
  fileName: string,
  user: string,
  requestId: string
): Promise<DifyFileUploadResponse> {
  console.log(`[${requestId}] 📤 上传文件: ${fileName}, 大小: ${fileData.length} bytes`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${requestId}] 上传尝试 ${attempt}/${MAX_RETRIES}...`);

      const formData = new FormData();
      const blob = new Blob([fileData], { type: "image/png" });
      formData.append("file", blob, fileName);
      formData.append("user", user);

      const response = await fetchWithTimeout(
        `${DIFY_API_BASE}/files/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIFY_API_KEY}`,
          },
          body: formData,
        },
        60000
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${requestId}] ❌ 上传失败 (尝试 ${attempt}): ${response.status} - ${errorText}`);

        if (attempt === MAX_RETRIES) {
          throw new Error(`文件上传失败: ${response.status} - ${errorText}`);
        }
        const backoffDelay = calculateBackoffDelay(attempt - 1);
        console.log(`[${requestId}] 等待 ${Math.round(backoffDelay)}ms 后重试上传...`);
        await delay(backoffDelay);
        continue;
      }

      const result = await response.json();
      console.log(`[${requestId}] ✅ 文件上传成功: id=${result.id}`);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[${requestId}] ❌ 上传异常 (尝试 ${attempt}): ${errorMsg}`);

      if (attempt === MAX_RETRIES) {
        throw error;
      }
      const backoffDelay = calculateBackoffDelay(attempt - 1);
      console.log(`[${requestId}] 等待 ${Math.round(backoffDelay)}ms 后重试上传...`);
      await delay(backoffDelay);
    }
  }

  throw new Error("文件上传失败: 所有重试均失败");
}

async function sendChatMessage(request: DifyChatRequest, requestId: string): Promise<DifyChatResponse> {
  console.log(`[${requestId}] 📨 发送聊天消息...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${requestId}] 发送尝试 ${attempt}/${MAX_RETRIES}...`);

      const response = await fetchWithTimeout(
        `${DIFY_API_BASE}/chat-messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIFY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        },
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${requestId}] ❌ 聊天失败 (尝试 ${attempt}): ${response.status} - ${errorText}`);

        // 某些错误不应重试
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new Error(`Dify 聊天失败 (不可重试): ${response.status} - ${errorText}`);
        }

        if (attempt === MAX_RETRIES) {
          throw new Error(`Dify 聊天失败: ${response.status} - ${errorText}`);
        }
        const backoffDelay = calculateBackoffDelay(attempt - 1);
        console.log(`[${requestId}] 等待 ${Math.round(backoffDelay)}ms 后重试聊天...`);
        await delay(backoffDelay);
        continue;
      }

      const result = await response.json();
      console.log(`[${requestId}] ✅ 聊天成功: message_id=${result.message_id}`);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[${requestId}] ❌ 聊天异常 (尝试 ${attempt}): ${errorMsg}`);

      if (errorMsg.includes("不可重试")) {
        throw error;
      }

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      const backoffDelay = calculateBackoffDelay(attempt - 1);
      console.log(`[${requestId}] 等待 ${Math.round(backoffDelay)}ms 后重试聊天...`);
      await delay(backoffDelay);
    }
  }

  throw new Error("聊天失败: 所有重试均失败");
}

// ===== 执行单个 OCR 任务 =====

async function executeOcr(
  wording: string,
  imageData: string,
  imageName: string,
  requestId: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    // Step 1: 解码并上传图片
    console.log(`[${requestId}] Step 1: 上传图片...`);
    
    let base64Data = imageData;
    if (base64Data.includes(",")) {
      base64Data = base64Data.split(",")[1];
    }
    
    const imageBytes = base64Decode(base64Data);
    console.log(`[${requestId}] 图片解码完成: ${imageBytes.length} bytes`);

    const uploadResult = await uploadFile(imageBytes, imageName, "image-diff-tool", requestId);

    // Step 2: 发送聊天请求
    console.log(`[${requestId}] Step 2: 调用 Dify 识别...`);

    const chatRequest: DifyChatRequest = {
      inputs: {
        wording: wording,
      },
      query: "请根据 wording 识别图片中的文字",
      response_mode: "blocking",
      user: "image-diff-tool",
      files: [
        {
          type: "image",
          transfer_method: "local_file",
          upload_file_id: uploadResult.id,
        },
      ],
    };

    const chatResponse = await sendChatMessage(chatRequest, requestId);
    const recognizedText = chatResponse.answer.trim();

    console.log(`[${requestId}] ✅ 识别完成: "${recognizedText.slice(0, 50)}${recognizedText.length > 50 ? "..." : ""}"`);

    return { success: true, text: recognizedText };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] ❌ OCR 失败: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

// ===== 主处理函数 =====

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = `ocr-process-${Date.now()}`;
  console.log(`[${requestId}] ========== process-ocr-task ==========`);

  try {
    const body: ProcessOcrTaskRequest = await req.json();
    const { taskId, triggerId } = body;

    console.log(`[${requestId}] 任务ID: ${taskId}`);
    console.log(`[${requestId}] 触发ID: ${triggerId}`);

    if (!taskId || !triggerId) {
      return new Response(
        JSON.stringify({ success: false, error: "缺少必要参数" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 使用乐观锁获取并更新任务状态
    const { data: task, error: updateError } = await supabase
      .from("async_tasks")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("trigger_id", triggerId)
      .eq("status", "pending")
      .select()
      .single();

    if (updateError || !task) {
      console.log(`[${requestId}] 任务已被其他实例处理或不存在`);
      return new Response(
        JSON.stringify({ success: false, error: "任务已被处理" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] 开始处理 OCR 任务`);
    
    const inputData: OcrInputData = task.input_data;
    const { wording, imageData, imageName = "line-preview.png" } = inputData;

    const startTime = Date.now();

    // 执行 OCR
    const result = await executeOcr(wording, imageData, imageName, requestId);

    const duration = Date.now() - startTime;

    // 更新任务结果
    const { error: finalUpdateError } = await supabase
      .from("async_tasks")
      .update({
        status: result.success ? "done" : "failed",
        completed_at: new Date().toISOString(),
        output_data: {
          text: result.text || "",
          duration: duration,
        },
        error_message: result.error || null,
      })
      .eq("id", taskId);

    if (finalUpdateError) {
      console.error(`[${requestId}] 更新任务状态失败:`, finalUpdateError);
    }

    console.log(`[${requestId}] 任务处理完成, 耗时: ${duration}ms`);
    return new Response(
      JSON.stringify({
        success: result.success,
        text: result.text,
        duration: duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${requestId}] 异常:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "服务器内部错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
