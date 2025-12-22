/**
 * Dify Chat Edge Function
 * 
 * 简化策略：
 * 1. 每次调用 Dify 都是新对话（不传 conversation_id）
 * 2. 通过 chat_history 传递上下文
 * 3. 用 frontend_id 唯一标识逻辑对话
 * 4. 追踪：对话ID + 问询序号
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { DifyService, DifyParsedResult } from "../_shared/dify-service.ts";
import { 
  getOrCreateConversationByFrontendId, 
  saveMessage,
  getLastMessageContent,
  getMessageCount,
  ChatMessage 
} from "../_shared/supabase-client.ts";

// ===== 环境变量 =====
const DIFY_API_BASE = Deno.env.get("DIFY_API_BASE") || "https://dify-prod.tezign.com/v1";
const DIFY_API_KEY = Deno.env.get("DIFY_API_KEY") || "app-Yk22GvTsSujKQ1JCgNJoOG0U";

// ===== 固定用户 ID =====
const FIXED_USER_ID = "marriott-user";

// ===== 类型定义 =====

interface FileInfo {
  data: string;
  fileName: string;
  mimeType: string;
}

interface RequestBody {
  query: string;
  files?: FileInfo[];
  conversationId?: string;  // 前端传来的对话 ID（唯一标识逻辑对话）
  user?: string;
}

interface ResponseBody {
  success: boolean;
  response?: string;
  status?: string;
  content?: string;
  conversationId?: string;
  difyConversationId?: string;
  messageId?: string;
  querySequence?: number;
  error?: string;
}

// ===== 主处理函数 =====

Deno.serve(async (req: Request) => {
  const requestStartTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  
  console.log(`\n========== [${requestId}] 新请求 ==========`);

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
    const { query, files, conversationId: frontendId } = body;

    console.log(`[${requestId}] 前端对话ID: ${frontendId || "(新对话)"}`);
    console.log(`[${requestId}] 问题: "${query?.slice(0, 50)}..."`);
    console.log(`[${requestId}] 图片: ${files?.length || 0} 个`);

    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 验证文件
    if (files?.length) {
      for (const file of files) {
        if (!file.mimeType.startsWith("image/")) {
          return new Response(
            JSON.stringify({ success: false, error: "Only image files are allowed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ===== Step 1: 获取/创建对话 + 获取 chat_history =====
    console.log(`[${requestId}] Step 1: 处理对话...`);
    
    let dbConversationId: string | undefined;
    let querySequence = 1;
    let chatHistory = "";

    if (frontendId) {
      // 有前端ID，查找或创建对话
      const conversation = await getOrCreateConversationByFrontendId(frontendId, query.slice(0, 50));
      
      if (conversation) {
        dbConversationId = conversation.id;
        
        // 获取问询序号
        querySequence = await getMessageCount(dbConversationId) + 1;
        
        // 获取上一次的 content 作为 chat_history
        if (querySequence > 1) {
          chatHistory = await getLastMessageContent(dbConversationId);
        }
        
        console.log(`[${requestId}] 对话: ${dbConversationId}, 第 ${querySequence} 次问询`);
        console.log(`[${requestId}] chat_history: ${chatHistory ? chatHistory.length + " 字符" : "(空)"}`);
      }
    } else {
      // 没有前端ID，创建新对话（生成临时ID）
      const tempFrontendId = `temp-${Date.now()}`;
      const conversation = await getOrCreateConversationByFrontendId(tempFrontendId, query.slice(0, 50));
      if (conversation) {
        dbConversationId = conversation.id;
        console.log(`[${requestId}] 新对话: ${dbConversationId}`);
      }
    }

    // ===== Step 2: 调用 Dify API =====
    console.log(`[${requestId}] Step 2: 调用 Dify...`);
    const difyStartTime = Date.now();
    
    const difyService = new DifyService(DIFY_API_BASE, DIFY_API_KEY);
    
    // 每次都是 Dify 新对话，上下文通过 chat_history 传递
    const result: DifyParsedResult = await difyService.chat(
      query, 
      files, 
      FIXED_USER_ID,  // 使用固定用户 ID
      undefined,      // 不传 conversation_id
      chatHistory
    );
    
    console.log(`[${requestId}] Dify 成功: ${Date.now() - difyStartTime}ms`);
    console.log(`[${requestId}] Dify conversation_id: ${result.conversationId}`);

    // ===== Step 3: 保存消息 =====
    console.log(`[${requestId}] Step 3: 保存消息...`);
    
    let dbMessageId: string | undefined;
    if (dbConversationId) {
      const messageData: ChatMessage = {
        conversation_id: dbConversationId,
        dify_conversation_id: result.conversationId,
        dify_message_id: result.messageId,
        query: query,
        status: result.status,
        content: result.content,
        response: result.response,
        has_images: (files?.length || 0) > 0,
        image_count: files?.length || 0,
        query_sequence: querySequence,
      };

      const saved = await saveMessage(messageData);
      if (saved) {
        dbMessageId = saved.id;
        console.log(`[${requestId}] 消息保存成功: ${dbMessageId}`);
      } else {
        console.log(`[${requestId}] 消息保存失败`);
      }
    }

    // ===== Step 4: 返回响应 =====
    const responseBody: ResponseBody = {
      success: true,
      response: result.response,
      status: result.status,
      content: result.content,
      conversationId: dbConversationId,
      difyConversationId: result.conversationId,
      messageId: dbMessageId,  // 返回数据库消息 ID（用于更新 response）
      querySequence: querySequence,
    };

    console.log(`[${requestId}] ✅ 完成: 对话=${dbConversationId}, 序号=${querySequence}, 耗时=${Date.now() - requestStartTime}ms`);

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] ❌ 错误: ${errorMessage}`);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
