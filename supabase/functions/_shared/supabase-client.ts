/**
 * Supabase 客户端
 * 
 * 简化版：只用 frontend_id 来标识对话
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== 类型定义 =====

export interface ChatConversation {
  id?: string;
  user_id: string;
  title?: string;
  frontend_id?: string;
  created_at?: string;
}

export interface ChatMessage {
  id?: string;
  conversation_id: string;
  dify_conversation_id?: string;
  dify_message_id?: string;
  query: string;
  status?: string;
  content?: string;
  response?: string;
  has_images?: boolean;
  image_count?: number;
  query_sequence?: number;
  created_at?: string;
}

// ===== 数据库操作 =====

/**
 * 通过 frontend_id 获取或创建对话
 * 
 * 查找逻辑（确保多轮对话正确关联）：
 * 1. 先通过 frontend_id 查找
 * 2. 如果找不到，再通过 id（主键）查找（兼容历史数据或边界情况）
 * 3. 都找不到才创建新对话
 */
export async function getOrCreateConversationByFrontendId(
  frontendId: string,
  title?: string
): Promise<ChatConversation | null> {
  console.log(`[DB] 查找对话: frontend_id=${frontendId}`);

  // Step 1: 先通过 frontend_id 查找
  const { data: existingByFrontendId, error: findError1 } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("frontend_id", frontendId)
    .single();

  if (existingByFrontendId && !findError1) {
    console.log(`[DB] 通过 frontend_id 找到对话: ${existingByFrontendId.id}`);
    return existingByFrontendId as ChatConversation;
  }

  // Step 2: 如果 frontend_id 找不到，尝试通过 id（主键）查找
  // 这是兼容性兜底：处理历史数据或前端传来 UUID 的情况
  console.log(`[DB] frontend_id 未找到，尝试通过 id 查找...`);
  const { data: existingById, error: findError2 } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("id", frontendId)
    .single();

  if (existingById && !findError2) {
    console.log(`[DB] 通过 id 找到对话: ${existingById.id}`);
    return existingById as ChatConversation;
  }

  // Step 3: 都找不到，创建新对话
  console.log(`[DB] 未找到对话，创建新对话...`);
  const { data: created, error: createError } = await supabase
    .from("chat_conversations")
    .insert({
      user_id: "marriott-user",
      title: title || "New Chat",
      frontend_id: frontendId,
    })
    .select()
    .single();

  if (createError) {
    console.error(`[DB] 创建失败:`, createError);
    return null;
  }

  console.log(`[DB] 创建成功: ${created.id}`);
  return created as ChatConversation;
}

/**
 * 获取对话的消息数量
 */
export async function getMessageCount(conversationId: string): Promise<number> {
  const { count, error } = await supabase
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (error) {
    console.error(`[DB] 获取消息数量失败:`, error);
    return 0;
  }

  return count || 0;
}

/**
 * 获取对话的最后一条消息的 content
 */
export async function getLastMessageContent(conversationId: string): Promise<string> {
  console.log(`[DB] 获取 chat_history: conversation_id=${conversationId}`);

  const { data: message, error } = await supabase
    .from("chat_messages")
    .select("content, query_sequence")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !message) {
    console.log(`[DB] 无历史消息`);
    return "";
  }

  const content = message.content || "";
  console.log(`[DB] 找到历史: 序号=${message.query_sequence}, 长度=${content.length}`);
  return content;
}

/**
 * 保存消息
 */
export async function saveMessage(message: ChatMessage): Promise<ChatMessage | null> {
  console.log(`[DB] 保存消息: conversation=${message.conversation_id}, 序号=${message.query_sequence}`);

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(message)
    .select()
    .single();

  if (error) {
    console.error(`[DB] 保存失败:`, error);
    return null;
  }

  return data as ChatMessage;
}
