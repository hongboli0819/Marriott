/**
 * Dify OCR Edge Function
 * 
 * 用于 image-diff-tool 的文字识别
 * - 接收 wording（参考文字）和 图片（Base64）
 * - 调用 Dify API 识别图片中的文字
 * - 返回识别结果
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";

// 使用 Deno 标准库解码 Base64
import { decode as base64Decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

// ===== 环境变量 =====
const DIFY_API_BASE = Deno.env.get("DIFY_API_BASE") || "https://dify-prod.tezign.com/v1";
const DIFY_API_KEY = Deno.env.get("DIFY_API_KEY") || "app-Yk22GvTsSujKQ1JCgNJoOG0U";

// ===== 配置常量 =====
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;  // 初始重试延迟
const RETRY_MAX_DELAY_MS = 30000;  // 最大重试延迟
const REQUEST_TIMEOUT_MS = 120000; // 120 秒（留出安全边界，小于 Edge Function 150s 限制）

// ===== 类型定义 =====

interface RequestBody {
  wording: string;      // 参考文字
  imageData: string;    // Base64 图片数据（不含 data:image/xxx;base64, 前缀）
  imageName?: string;   // 图片文件名
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

/**
 * 计算指数退避延迟（带抖动）
 * @param attempt - 当前尝试次数（从 0 开始）
 * @param baseDelay - 基础延迟
 * @param maxDelay - 最大延迟
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = RETRY_BASE_DELAY_MS,
  maxDelay: number = RETRY_MAX_DELAY_MS
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay; // 添加抖动防止惊群效应
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
  user: string
): Promise<DifyFileUploadResponse> {
  console.log(`[DifyOCR] 📤 上传文件: ${fileName}, 大小: ${fileData.length} bytes`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[DifyOCR] 上传尝试 ${attempt}/${MAX_RETRIES}...`);

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
        60000 // 文件上传超时 60秒
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DifyOCR] ❌ 上传失败 (尝试 ${attempt}): ${response.status} - ${errorText}`);

        if (attempt === MAX_RETRIES) {
          throw new Error(`文件上传失败: ${response.status} - ${errorText}`);
        }
        const backoffDelay = calculateBackoffDelay(attempt - 1);
        console.log(`[DifyOCR] 等待 ${Math.round(backoffDelay)}ms 后重试上传...`);
        await delay(backoffDelay);
        continue;
      }

      const result = await response.json();
      console.log(`[DifyOCR] ✅ 文件上传成功: id=${result.id}`);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[DifyOCR] ❌ 上传异常 (尝试 ${attempt}): ${errorMsg}`);

      if (attempt === MAX_RETRIES) {
        throw error;
      }
      const backoffDelay = calculateBackoffDelay(attempt - 1);
      console.log(`[DifyOCR] 等待 ${Math.round(backoffDelay)}ms 后重试上传...`);
      await delay(backoffDelay);
    }
  }

  throw new Error("文件上传失败: 所有重试均失败");
}

async function sendChatMessage(request: DifyChatRequest): Promise<DifyChatResponse> {
  console.log(`[DifyOCR] 📨 发送聊天消息...`);
  console.log(`[DifyOCR] 📦 请求体 inputs:`, JSON.stringify(request.inputs));
  console.log(`[DifyOCR] 📦 请求体 query:`, request.query);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[DifyOCR] 发送尝试 ${attempt}/${MAX_RETRIES}...`);

      const requestBody = JSON.stringify(request);
      console.log(`[DifyOCR] 📦 完整请求体:`, requestBody.slice(0, 500));

      const response = await fetchWithTimeout(
        `${DIFY_API_BASE}/chat-messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIFY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
        },
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DifyOCR] ❌ 聊天失败 (尝试 ${attempt}): ${response.status} - ${errorText}`);

        // 某些错误不应重试
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new Error(`Dify 聊天失败 (不可重试): ${response.status} - ${errorText}`);
        }

        if (attempt === MAX_RETRIES) {
          throw new Error(`Dify 聊天失败: ${response.status} - ${errorText}`);
        }
        const backoffDelay = calculateBackoffDelay(attempt - 1);
        console.log(`[DifyOCR] 等待 ${Math.round(backoffDelay)}ms 后重试聊天...`);
        await delay(backoffDelay);
        continue;
      }

      const result = await response.json();
      console.log(`[DifyOCR] ✅ 聊天成功: message_id=${result.message_id}`);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[DifyOCR] ❌ 聊天异常 (尝试 ${attempt}): ${errorMsg}`);

      if (errorMsg.includes("不可重试")) {
        throw error;
      }

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      const backoffDelay = calculateBackoffDelay(attempt - 1);
      console.log(`[DifyOCR] 等待 ${Math.round(backoffDelay)}ms 后重试聊天...`);
      await delay(backoffDelay);
    }
  }

  throw new Error("聊天失败: 所有重试均失败");
}

// ===== 主处理函数 =====

Deno.serve(async (req: Request) => {
  const requestId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  console.log(`\n========== [${requestId}] Dify OCR 请求 ==========`);

  // CORS 预检
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 解析请求
    const body: RequestBody = await req.json();
    const { wording, imageData, imageName = "line-preview.png" } = body;

    console.log(`[${requestId}] wording 长度: ${wording?.length || 0} 字符`);
    console.log(`[${requestId}] imageData 长度: ${imageData?.length || 0} 字符`);

    if (!wording?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "wording is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!imageData) {
      return new Response(
        JSON.stringify({ success: false, error: "imageData is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startTime = Date.now();

    // Step 1: 解码并上传图片
    console.log(`[${requestId}] Step 1: 上传图片...`);
    
    // 移除可能存在的 data URL 前缀
    let base64Data = imageData;
    if (base64Data.includes(",")) {
      base64Data = base64Data.split(",")[1];
    }
    
    const imageBytes = base64Decode(base64Data);
    console.log(`[${requestId}] 图片解码完成: ${imageBytes.length} bytes`);

    const uploadResult = await uploadFile(imageBytes, imageName, "image-diff-tool");

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

    const chatResponse = await sendChatMessage(chatRequest);

    // 返回识别结果（answer 直接就是文字）
    const recognizedText = chatResponse.answer.trim();
    const duration = Date.now() - startTime;

    console.log(`[${requestId}] ✅ 识别完成: "${recognizedText.slice(0, 50)}${recognizedText.length > 50 ? "..." : ""}", 耗时: ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        text: recognizedText,
        duration: duration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] ❌ 错误: ${errorMessage}`);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

