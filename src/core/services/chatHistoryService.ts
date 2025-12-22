/**
 * 聊天历史服务
 * 从 Supabase 数据库加载对话历史
 */

import { ChatSession, Message, Role, DesignMode, DesignModeConfig } from "@/core/types/io";

// Supabase 配置
const SUPABASE_URL = "https://qqlwechtvktkhuheoeja.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbHdlY2h0dmt0a2h1aGVvZWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTk2OTgsImV4cCI6MjA3OTczNTY5OH0.yGSijURBrllzdHYSqnqA792GAapWW9tK3y_ukUfj4XQ";

// 数据库类型
interface DbConversation {
  id: string;
  user_id: string;
  title: string | null;
  frontend_id: string | null;  // 前端生成的对话 ID，用于关联同一逻辑对话
  dify_conversation_id: string | null;
  design_mode: string | null;  // 用户选择的设计模式
  design_mode_config: DesignModeConfig | null;  // 设计模式完整配置
  created_at: string;
  updated_at: string;
  // Step1 生成的图片
  generated_images: string[] | null;
  selected_image_index: number | null;
  // Step2 生成的图片
  step2_generated_images: string[] | null;
  step2_selected_index: number | null;
  current_step: number | null;
  // Step3 编辑相关
  edited_image: string | null;      // 编辑后的图片 URL
  canvas_state: unknown | null;     // Canvas 状态（用于持续编辑）
  diff_analysis: unknown | null;    // 差异分析结果
}

interface DbMessage {
  id: string;
  conversation_id: string;
  dify_message_id: string | null;
  query: string;
  status: string | null;
  content: string | null;
  response: string | null;
  has_images: boolean;
  image_count: number;
  is_confirmed: boolean;  // 用户是否点击了确认按钮
  created_at: string;
}

/**
 * 获取所有对话列表（轻量级，不包含图片数据）
 * 
 * 优化：只加载必要字段，图片数据在选中对话时单独加载
 */
export async function fetchConversations(): Promise<ChatSession[]> {
  try {
    // 只加载必要字段，不加载 generated_images 和 step2_generated_images（太大）
    // 包含 edited_image, canvas_state, diff_analysis 用于恢复编辑状态
    const selectFields = "id,user_id,title,frontend_id,dify_conversation_id,design_mode,design_mode_config,created_at,updated_at,selected_image_index,step2_selected_index,current_step,edited_image,canvas_state,diff_analysis";
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?select=${selectFields}&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to fetch conversations:", response.status);
      return [];
    }

    const conversations: DbConversation[] = await response.json();

    // 转换为 ChatSession 格式（不包含消息和图片，会在选中时加载）
    // 重要：
    // - id: 使用 frontend_id，用于发送消息时关联对话
    // - dbId: 使用数据库 UUID，用于查询消息
    return conversations.map((conv) => ({
      id: conv.frontend_id || conv.id,  // 优先使用 frontend_id，兼容历史数据
      dbId: conv.id,                     // 数据库 UUID，用于查询消息
      title: conv.title || "New Conversation",
      messages: [],
      createdAt: new Date(conv.created_at).getTime(),
      difyConversationId: conv.dify_conversation_id || undefined,
      designMode: (conv.design_mode || undefined) as DesignMode | undefined,  // 用户选择的设计模式（null -> undefined）
      designModeConfig: conv.design_mode_config || undefined,  // 设计模式完整配置
      // 图片数据不在列表加载时获取，在选中对话时单独加载
      selectedImageIndex: conv.selected_image_index ?? undefined,
      step2SelectedIndex: conv.step2_selected_index ?? undefined,
      // 编辑相关状态
      editedImage: conv.edited_image || undefined,
      canvasState: conv.canvas_state || undefined,
      diffAnalysis: conv.diff_analysis || undefined,
    }));
  } catch (error) {
    console.error("[ChatHistory] Error fetching conversations:", error);
    return [];
  }
}

/**
 * 获取单个对话的图片数据（按需加载）
 * 
 * 用于在用户选中对话时加载图片数据，避免初始加载时加载大量数据
 */
export async function fetchConversationImages(conversationId: string): Promise<{
  generatedImages?: string[];
  step2GeneratedImages?: string[];
} | null> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}&select=generated_images,step2_generated_images`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to fetch conversation images:", response.status);
      return null;
    }

    const data = await response.json();
    if (data.length === 0) {
      return null;
    }

    const conv = data[0];
    return {
      generatedImages: conv.generated_images || undefined,
      step2GeneratedImages: conv.step2_generated_images || undefined,
    };
  } catch (error) {
    console.error("[ChatHistory] Error fetching conversation images:", error);
    return null;
  }
}

/**
 * 获取某个对话的所有消息
 */
export async function fetchMessages(conversationId: string): Promise<Message[]> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?conversation_id=eq.${conversationId}&select=*&order=created_at.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to fetch messages:", response.status);
      return [];
    }

    const messages: DbMessage[] = await response.json();

    // 将数据库消息转换为前端消息格式（每条记录生成用户消息和 AI 消息）
    const chatMessages: Message[] = [];

    for (const msg of messages) {
      // 用户消息
      chatMessages.push({
        id: `${msg.id}-user`,
        role: Role.USER,
        content: msg.query,
        timestamp: new Date(msg.created_at).getTime(),
      });

      // AI 响应消息
      if (msg.response) {
        chatMessages.push({
          id: `${msg.id}-ai`,
          role: Role.MODEL,
          content: msg.response,
          timestamp: new Date(msg.created_at).getTime() + 1,
          status: msg.status || undefined,      // 包含 status 字段
          messageDbId: msg.id,                   // 数据库消息 ID，用于更新
          isConfirmed: msg.is_confirmed || false, // 用户是否已确认
        });
      }
    }

    return chatMessages;
  } catch (error) {
    console.error("[ChatHistory] Error fetching messages:", error);
    return [];
  }
}

/**
 * 删除对话
 */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    return response.ok;
  } catch (error) {
    console.error("[ChatHistory] Error deleting conversation:", error);
    return false;
  }
}

/**
 * 更新消息的 response 内容
 * 用于用户编辑 status=yes 的消息后保存
 */
export async function updateMessageResponse(
  messageId: string,
  newResponse: string
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Updating message response: ${messageId}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?id=eq.${messageId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          response: newResponse,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to update message:", response.status);
      return false;
    }

    console.log("[ChatHistory] Message response updated successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error updating message:", error);
    return false;
  }
}

/**
 * 更新对话的设计模式
 * 用于用户选择设计模式后保存
 */
export async function updateConversationDesignMode(
  conversationId: string,
  designMode: DesignMode
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Updating conversation design_mode: ${conversationId} -> ${designMode}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          design_mode: designMode,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to update design_mode:", response.status);
      return false;
    }

    console.log("[ChatHistory] Design mode updated successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error updating design_mode:", error);
    return false;
  }
}

/**
 * 更新消息的确认状态
 * 用于用户点击确认按钮后标记 is_confirmed=true
 */
export async function updateMessageConfirmed(
  messageId: string,
  isConfirmed: boolean = true
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Updating message is_confirmed: ${messageId} -> ${isConfirmed}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?id=eq.${messageId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          is_confirmed: isConfirmed,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to update is_confirmed:", response.status);
      return false;
    }

    console.log("[ChatHistory] Message confirmed status updated successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error updating is_confirmed:", error);
    return false;
  }
}

/**
 * 更新对话的设计模式完整配置
 * 用于用户选择设计模式并上传图片后保存
 */
export async function updateConversationDesignModeConfig(
  conversationId: string,
  config: DesignModeConfig
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Updating conversation design_mode_config:`, config);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          design_mode: config.mode,
          design_mode_config: config,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to update design_mode_config:", response.status);
      return false;
    }

    console.log("[ChatHistory] Design mode config updated successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error updating design_mode_config:", error);
    return false;
  }
}

/**
 * 保存生成的图片到对话
 * @param conversationId 对话 ID
 * @param images 生成的图片 base64 数组
 */
export async function saveGeneratedImages(
  conversationId: string,
  images: string[]
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Saving ${images.length} generated images`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          generated_images: images,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to save generated images:", response.status);
      return false;
    }

    console.log("[ChatHistory] Generated images saved successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error saving generated images:", error);
    return false;
  }
}

/**
 * 保存用户选择的图片索引
 * @param conversationId 对话 ID
 * @param index 用户选择的图片索引
 */
export async function saveSelectedImageIndex(
  conversationId: string,
  index: number
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Saving selected image index: ${index}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          selected_image_index: index,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to save selected image index:", response.status);
      return false;
    }

    console.log("[ChatHistory] Selected image index saved successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error saving selected image index:", error);
    return false;
  }
}

/**
 * 保存 Step2 生成的图片到对话
 * @param conversationId 对话 ID
 * @param images 生成的图片 base64 数组
 */
export async function saveStep2GeneratedImages(
  conversationId: string,
  images: string[]
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Saving ${images.length} Step2 generated images`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          step2_generated_images: images,
          current_step: 2,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to save Step2 generated images:", response.status);
      return false;
    }

    console.log("[ChatHistory] Step2 generated images saved successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error saving Step2 generated images:", error);
    return false;
  }
}

/**
 * 保存 Step2 用户选择的图片索引（最终效果图）
 * @param conversationId 对话 ID
 * @param index 用户选择的图片索引
 */
export async function saveStep2SelectedIndex(
  conversationId: string,
  index: number
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Saving Step2 selected image index: ${index}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          step2_selected_index: index,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to save Step2 selected index:", response.status);
      return false;
    }

    console.log("[ChatHistory] Step2 selected index saved successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error saving Step2 selected index:", error);
    return false;
  }
}

/**
 * 保存编辑后的图片 URL 和 Canvas 状态
 * @param conversationId 对话 ID
 * @param editedImageUrl 编辑后的图片 URL
 * @param canvasState 可选的 Canvas 状态（用于持续编辑）
 */
export async function saveEditedImage(
  conversationId: string,
  editedImageUrl: string,
  canvasState?: unknown
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Saving edited image for conversation: ${conversationId}`);
    
    // 构建更新数据
    const updateData: Record<string, unknown> = {
      edited_image: editedImageUrl,
    };
    
    // 如果有 canvas 状态，也保存
    if (canvasState) {
      updateData.canvas_state = canvasState;
      console.log(`[ChatHistory] Also saving canvas state`);
    }
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to save edited image:", response.status);
      return false;
    }

    console.log("[ChatHistory] Edited image and canvas state saved successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error saving edited image:", error);
    return false;
  }
}

/**
 * 保存差异分析结果
 * @param conversationId 对话 ID
 * @param diffAnalysis 差异分析结果 JSON
 */
export async function saveDiffAnalysis(
  conversationId: string,
  diffAnalysis: unknown
): Promise<boolean> {
  try {
    console.log(`[ChatHistory] Saving diff analysis for conversation: ${conversationId}`);
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations?id=eq.${conversationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          diff_analysis: diffAnalysis,
        }),
      }
    );

    if (!response.ok) {
      console.error("[ChatHistory] Failed to save diff analysis:", response.status);
      return false;
    }

    console.log("[ChatHistory] Diff analysis saved successfully");
    return true;
  } catch (error) {
    console.error("[ChatHistory] Error saving diff analysis:", error);
    return false;
  }
}
