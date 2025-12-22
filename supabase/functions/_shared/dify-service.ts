/**
 * Dify API 服务封装
 * 用于 Edge Function 调用 Dify API
 * 
 * 增强版：添加详细日志、重试机制、超时处理
 */

// 使用 Deno 标准库解码 Base64
import { decode as base64Decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

// ===== 配置常量 =====
const MAX_CHAT_HISTORY_LENGTH = 2000;  // chat_history 最大字符数
const MAX_RETRIES = 3;                  // 最大重试次数
const RETRY_DELAY_MS = 2000;           // 重试延迟（毫秒）
const REQUEST_TIMEOUT_MS = 120000;     // 请求超时（120秒）

// ===== 类型定义 =====

interface FileInfo {
  data: string;       // Base64 数据
  fileName: string;
  mimeType: string;
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
  conversation_id?: string;
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

/**
 * Dify 解析后的响应结果
 */
export interface DifyParsedResult {
  status: string;
  content: string;
  response: string;
  conversationId: string;
  messageId: string;
  rawAnswer: string;
}

// ===== 工具函数 =====

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带超时的 fetch
 */
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

/**
 * 截断字符串到指定长度
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + "...(已截断)";
}

// ===== Dify 服务类 =====

export class DifyService {
  private apiBase: string;
  private apiKey: string;

  constructor(apiBase: string, apiKey: string) {
    this.apiBase = apiBase;
    this.apiKey = apiKey;
  }

  /**
   * 上传文件到 Dify（带重试）
   */
  async uploadFile(
    fileData: Uint8Array,
    fileName: string,
    _mimeType: string,
    user: string
  ): Promise<DifyFileUploadResponse> {
    const fixedMimeType = "image/jpeg";
    console.log(`[DifyService] 📤 开始上传文件: ${fileName}, 大小: ${fileData.length} bytes, 类型: ${fixedMimeType}`);
    
    const startTime = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[DifyService] 上传尝试 ${attempt}/${MAX_RETRIES}...`);
        
        const formData = new FormData();
        const blob = new Blob([fileData], { type: fixedMimeType });
        formData.append("file", blob, fileName);
        formData.append("user", user);

        const response = await fetchWithTimeout(
          `${this.apiBase}/files/upload`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: formData,
          },
          60000  // 文件上传超时 60秒
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[DifyService] ❌ 上传失败 (尝试 ${attempt}): ${response.status} - ${errorText}`);
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Dify 文件上传失败: ${response.status} - ${errorText}`);
          }
          await delay(RETRY_DELAY_MS);
          continue;
        }

        const result = await response.json();
        const duration = Date.now() - startTime;
        console.log(`[DifyService] ✅ 文件上传成功: id=${result.id}, 耗时: ${duration}ms`);
        return result;
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[DifyService] ❌ 上传异常 (尝试 ${attempt}): ${errorMsg}`);
        
        if (errorMsg.includes("aborted")) {
          console.error(`[DifyService] ⏰ 上传超时`);
        }
        
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        await delay(RETRY_DELAY_MS);
      }
    }

    throw new Error("文件上传失败: 所有重试均失败");
  }

  /**
   * 发送聊天消息（带重试和详细日志）
   */
  async sendChatMessage(request: DifyChatRequest): Promise<DifyChatResponse> {
    const requestBody = JSON.stringify(request);
    const requestSize = requestBody.length;
    
    console.log(`[DifyService] 📨 准备发送聊天消息:`);
    console.log(`  - query: "${request.query.slice(0, 100)}..."`);
    console.log(`  - conversation_id: ${request.conversation_id || "(新对话)"}`);
    console.log(`  - files: ${request.files?.length || 0} 个`);
    console.log(`  - chat_history 长度: ${String(request.inputs.chat_history || "").length} 字符`);
    console.log(`  - 请求体大小: ${requestSize} bytes`);
    
    const startTime = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[DifyService] 发送尝试 ${attempt}/${MAX_RETRIES}...`);
        
        const response = await fetchWithTimeout(
          `${this.apiBase}/chat-messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: requestBody,
          },
          REQUEST_TIMEOUT_MS
        );

        const duration = Date.now() - startTime;
        console.log(`[DifyService] 收到响应: status=${response.status}, 耗时: ${duration}ms`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[DifyService] ❌ 聊天失败 (尝试 ${attempt}): ${response.status} - ${errorText}`);
          
          // 某些错误不应重试
          if (response.status === 400 || response.status === 401 || response.status === 403) {
            throw new Error(`Dify 聊天失败 (不可重试): ${response.status} - ${errorText}`);
          }
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Dify 聊天失败: ${response.status} - ${errorText}`);
          }
          await delay(RETRY_DELAY_MS);
          continue;
        }

        const result = await response.json();
        console.log(`[DifyService] ✅ 聊天成功: message_id=${result.message_id}, conversation_id=${result.conversation_id}`);
        return result;
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[DifyService] ❌ 聊天异常 (尝试 ${attempt}): ${errorMsg}`);
        
        if (errorMsg.includes("aborted")) {
          console.error(`[DifyService] ⏰ 请求超时 (${REQUEST_TIMEOUT_MS}ms)`);
        }
        
        // 如果是不可重试的错误，直接抛出
        if (errorMsg.includes("不可重试")) {
          throw error;
        }
        
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        
        console.log(`[DifyService] 等待 ${RETRY_DELAY_MS}ms 后重试...`);
        await delay(RETRY_DELAY_MS);
      }
    }

    throw new Error("聊天失败: 所有重试均失败");
  }

  /**
   * 上传多个文件并获取 upload_file_id 列表
   */
  async uploadFiles(
    files: FileInfo[],
    user: string
  ): Promise<string[]> {
    const uploadIds: string[] = [];
    console.log(`[DifyService] 📂 开始上传 ${files.length} 个文件...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`[DifyService] 处理文件 ${i + 1}/${files.length}: ${file.fileName}`);
      
      try {
        // 使用 Deno 标准库解码 Base64
        const bytes = base64Decode(file.data);
        console.log(`[DifyService] Base64 解码完成: ${bytes.length} bytes`);

        const uploadResult = await this.uploadFile(
          bytes,
          file.fileName,
          file.mimeType,
          user
        );

        uploadIds.push(uploadResult.id);
      } catch (error) {
        console.error(`[DifyService] ❌ 文件处理失败 ${file.fileName}:`, error);
        throw error;
      }
    }

    console.log(`[DifyService] ✅ 所有文件上传完成: ${uploadIds.join(", ")}`);
    return uploadIds;
  }

  /**
   * 构建完整的聊天请求并发送
   * 
   * @param query - 用户问题
   * @param files - 上传的图片
   * @param user - 用户标识
   * @param conversationId - Dify 的 conversation_id（多轮对话）
   * @param chatHistory - 上一次问询的 content（用于 inputs.chat_history）
   */
  async chat(
    query: string,
    files: FileInfo[] | undefined,
    user: string,
    conversationId?: string,
    chatHistory?: string
  ): Promise<DifyParsedResult> {
    console.log(`[DifyService] ========== 开始聊天 ==========`);
    console.log(`[DifyService] 用户: ${user}`);
    console.log(`[DifyService] 对话ID: ${conversationId || "(新对话)"}`);
    console.log(`[DifyService] 问题: "${query.slice(0, 100)}${query.length > 100 ? "..." : ""}"`);
    console.log(`[DifyService] 图片数量: ${files?.length || 0}`);
    console.log(`[DifyService] chat_history 原始长度: ${chatHistory?.length || 0} 字符`);
    
    const overallStartTime = Date.now();

    // 上传文件（如果有）
    let fileRefs: DifyChatRequest["files"] = undefined;
    if (files && files.length > 0) {
      const fileStartTime = Date.now();
      console.log(`[DifyService] 📤 开始上传 ${files.length} 个文件...`);
      const uploadIds = await this.uploadFiles(files, user);
      fileRefs = uploadIds.map((id) => ({
        type: "image" as const,
        transfer_method: "local_file" as const,
        upload_file_id: id,
      }));
      console.log(`[DifyService] ✅ 文件上传总耗时: ${Date.now() - fileStartTime}ms`);
    }

    // 构建 inputs，包含 chat_history（截断到最大长度）
    const inputs: Record<string, unknown> = {};
    if (chatHistory && chatHistory.length > 0) {
      // 截断 chat_history 防止请求过大
      const truncatedHistory = truncateString(chatHistory, MAX_CHAT_HISTORY_LENGTH);
      inputs.chat_history = truncatedHistory;
      console.log(`[DifyService] chat_history: ${truncatedHistory.length} 字符 (原始: ${chatHistory.length}, 限制: ${MAX_CHAT_HISTORY_LENGTH})`);
    } else {
      inputs.chat_history = "";
      console.log(`[DifyService] chat_history: 空 (第一次问询)`);
    }

    // 发送聊天请求
    const chatRequest: DifyChatRequest = {
      inputs,
      query,
      response_mode: "blocking",
      user,
      files: fileRefs,
    };

    if (conversationId) {
      chatRequest.conversation_id = conversationId;
      console.log(`[DifyService] 使用现有对话: ${conversationId}`);
    } else {
      console.log(`[DifyService] 创建新对话`);
    }

    const chatStartTime = Date.now();
    console.log(`[DifyService] 📨 发送聊天请求...`);
    
    const chatResponse = await this.sendChatMessage(chatRequest);
    
    console.log(`[DifyService] ✅ 聊天请求耗时: ${Date.now() - chatStartTime}ms`);
    console.log(`[DifyService] 返回的 conversation_id: ${chatResponse.conversation_id}`);
    console.log(`[DifyService] 返回的 message_id: ${chatResponse.message_id}`);

    // 解析 answer 中的 status、content、response 字段
    let status = "";
    let content = "";
    let response = chatResponse.answer;
    
    try {
      const answerJson = JSON.parse(chatResponse.answer);
      if (answerJson) {
        if (typeof answerJson.status === "string") {
          status = answerJson.status;
        }
        if (typeof answerJson.content === "string") {
          content = answerJson.content;
        }
        if (typeof answerJson.response === "string") {
          response = answerJson.response;
        }
        console.log(`[DifyService] 解析 JSON 响应: status="${status}", content长度=${content.length}, response长度=${response.length}`);
      }
    } catch {
      console.log(`[DifyService] 响应不是 JSON 格式，使用原始 answer`);
      response = chatResponse.answer;
    }

    const totalDuration = Date.now() - overallStartTime;
    console.log(`[DifyService] ========== 聊天完成 (总耗时: ${totalDuration}ms) ==========`);

    return {
      status,
      content,
      response,
      conversationId: chatResponse.conversation_id,
      messageId: chatResponse.message_id,
      rawAnswer: chatResponse.answer,
    };
  }
}
