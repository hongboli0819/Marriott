/**
 * Dify Chat 模块 - 输入输出类型定义
 */

// ===== 输入类型 =====

/**
 * 上传的文件信息（Base64 格式）
 */
export interface FileInfo {
  data: string;         // Base64 编码的文件数据
  fileName: string;     // 文件名
  mimeType: string;     // MIME 类型，如 image/jpeg, image/png
}

/**
 * Dify 聊天请求输入
 */
export interface DifyChatInput {
  query: string;                    // 用户问题
  files?: FileInfo[];               // 上传的图片（多张）
  conversationId?: string;          // 本地对话 ID
  difyConversationId?: string;      // Dify 的 conversation_id（多轮对话）
  user?: string;                    // 用户标识
}

// ===== 输出类型 =====

/**
 * Dify 聊天响应输出
 */
export interface DifyChatOutput {
  success: boolean;
  response: string;                 // 从 Dify 响应中提取的 response 字段（展示给用户）
  status: string;                   // Dify 返回的 status 字段
  content: string;                  // Dify 返回的 content 字段
  conversationId: string;           // 本地会话 ID
  difyConversationId: string;       // Dify 的 conversation_id
  messageId: string;                // 消息 ID
  error?: string;                   // 错误信息
}

// ===== Dify API 相关类型 =====

/**
 * Dify 原始响应格式（answer 字段解析后的内容）
 */
export interface DifyRawResponse {
  status: string;
  content: string;
  response: string;                 // 只需要提取这个字段展示
}

/**
 * Dify chat-messages API 响应
 */
export interface DifyChatMessagesResponse {
  event: string;
  task_id: string;
  id: string;                       // message_id
  message_id: string;
  conversation_id: string;
  mode: string;
  answer: string;                   // JSON 字符串，需要解析
  metadata: Record<string, unknown>;
  created_at: number;
}

/**
 * Dify 文件上传响应
 */
export interface DifyFileUploadResponse {
  id: string;                       // upload_file_id
  name: string;
  size: number;
  extension: string;
  mime_type: string;
  created_by: string;
  created_at: number;
}

/**
 * Edge Function 请求体
 */
export interface EdgeFunctionRequest {
  query: string;
  files?: FileInfo[];
  conversationId?: string;          // 本地对话 ID
  difyConversationId?: string;      // Dify 的 conversation_id
  user?: string;
}

/**
 * Edge Function 响应体
 */
export interface EdgeFunctionResponse {
  success: boolean;
  response?: string;
  status?: string;
  content?: string;
  conversationId?: string;          // 本地对话 ID
  difyConversationId?: string;      // Dify 的 conversation_id
  messageId?: string;
  error?: string;
}
