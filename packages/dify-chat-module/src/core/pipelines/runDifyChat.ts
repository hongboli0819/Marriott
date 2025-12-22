/**
 * Dify Chat 主能力函数
 * 调用 Edge Function 发送聊天请求
 */

import type { CoreContext, StreamCallback } from "../types/context";
import type { 
  DifyChatInput, 
  DifyChatOutput, 
  EdgeFunctionRequest, 
  EdgeFunctionResponse 
} from "../types/io";

/**
 * 运行 Dify 聊天
 * 
 * @param ctx - 核心上下文（依赖注入）
 * @param input - 聊天输入
 * @param onStream - 流式响应回调（可选）
 * @returns 聊天输出
 */
export async function runDifyChat(
  ctx: CoreContext,
  input: DifyChatInput,
  onStream?: StreamCallback
): Promise<DifyChatOutput> {
  const { api, logger } = ctx.adapters;
  const { edgeFunctionUrl, timeout } = ctx.config;

  logger.info("[DifyChat] 开始发送请求", { 
    query: input.query.slice(0, 50) + "...",
    filesCount: input.files?.length || 0,
    conversationId: input.conversationId,
    difyConversationId: input.difyConversationId,
  });

  try {
    // 构建请求体
    const requestBody: EdgeFunctionRequest = {
      query: input.query,
      files: input.files,
      conversationId: input.conversationId,
      difyConversationId: input.difyConversationId,
      user: input.user || `marriott-user-${ctx.random()}`,
    };

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.warn("[DifyChat] 请求超时", { timeout });
    }, timeout);

    try {
      // 调用 Edge Function
      const response = await api.post<EdgeFunctionResponse>(
        edgeFunctionUrl,
        requestBody,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.success) {
        logger.error("[DifyChat] Edge Function 返回错误", { error: response.error });
        return {
          success: false,
          response: "",
          status: "",
          content: "",
          conversationId: input.conversationId || "",
          difyConversationId: input.difyConversationId || "",
          messageId: "",
          error: response.error || "Unknown error",
        };
      }

      logger.info("[DifyChat] 请求成功", {
        conversationId: response.conversationId,
        difyConversationId: response.difyConversationId,
        messageId: response.messageId,
        status: response.status,
        responseLength: response.response?.length,
      });

      // 如果有流式回调，模拟流式输出
      if (onStream && response.response) {
        await simulateStreaming(response.response, onStream);
      }

      return {
        success: true,
        response: response.response || "",
        status: response.status || "",
        content: response.content || "",
        conversationId: response.conversationId || input.conversationId || "",
        difyConversationId: response.difyConversationId || input.difyConversationId || "",
        messageId: response.messageId || "",
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes("aborted")) {
      logger.error("[DifyChat] 请求超时", { timeout });
      return {
        success: false,
        response: "",
        status: "",
        content: "",
        conversationId: input.conversationId || "",
        difyConversationId: input.difyConversationId || "",
        messageId: "",
        error: `请求超时（${timeout / 1000}秒）`,
      };
    }

    logger.error("[DifyChat] 请求失败", { error: errorMessage });
    return {
      success: false,
      response: "",
      status: "",
      content: "",
      conversationId: input.conversationId || "",
      difyConversationId: input.difyConversationId || "",
      messageId: "",
      error: errorMessage,
    };
  }
}

/**
 * 模拟流式输出
 */
async function simulateStreaming(
  text: string,
  onChunk: StreamCallback
): Promise<void> {
  const chars = Array.from(text);
  const totalChars = chars.length;
  const targetDuration = 4000; // 4 秒内完成
  const interval = Math.max(5, Math.min(20, targetDuration / totalChars));

  return new Promise((resolve) => {
    let index = 0;
    const timer = setInterval(() => {
      if (index < chars.length) {
        const chunkSize = Math.min(3, chars.length - index);
        const chunk = chars.slice(index, index + chunkSize).join("");
        onChunk(chunk);
        index += chunkSize;
      } else {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}
