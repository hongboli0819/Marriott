/**
 * 核心类型定义
 */

// ===== 消息相关 =====
export enum Role {
  USER = "user",
  MODEL = "model",
}

// ===== 设计模式 =====
export type DesignMode = 'ai-creative' | 'reference-image' | 'template-text';

// ===== 消息类型 =====
export type MessageType = 'text' | 'design-mode-selection' | 'image-generation-loading' | 'image-generation-result' | 'text-edit-loading' | 'text-edit-ready';

// ===== 设计模式选项配置 =====
export const DESIGN_MODE_OPTIONS = [
  {
    id: 'ai-creative' as DesignMode,
    label: 'AI自主发挥创意',
    description: '让 AI 根据文案内容自由发挥设计创意',
    icon: 'sparkles',
    status: 'developing' as const,  // 开发中
  },
  {
    id: 'reference-image' as DesignMode,
    label: '提供设计参考图',
    description: '上传参考图片，AI 会参考风格进行设计',
    icon: 'image',
    status: 'active' as const,
  },
  {
    id: 'template-text' as DesignMode,
    label: '提供模版只替换文字',
    description: '选择现有模版，仅替换文字内容',
    icon: 'template',
    status: 'active' as const,
  },
] as const;

// ===== 图片尺寸 =====
export type ImageSize = 
  | '1024x1024'    // 1:1
  | '1536x1024'    // 3:2 横版
  | '1024x1536'    // 2:3 竖版
  | '1920x1080'    // 16:9 横版
  | '1080x1920';   // 9:16 竖版

export const IMAGE_SIZE_OPTIONS = [
  { id: '1024x1024' as ImageSize, label: '1:1 正方形', description: '1024×1024', icon: 'square' },
  { id: '1536x1024' as ImageSize, label: '3:2 横版', description: '1536×1024', icon: 'landscape' },
  { id: '1024x1536' as ImageSize, label: '2:3 竖版', description: '1024×1536', icon: 'portrait' },
  { id: '1920x1080' as ImageSize, label: '16:9 横版', description: '1920×1080', icon: 'wide' },
  { id: '1080x1920' as ImageSize, label: '9:16 竖版', description: '1080×1920', icon: 'tall' },
] as const;

// ===== 设计模式配置（存储到数据库） =====
export type DesignModeConfig = 
  | { mode: 'ai-creative' }
  | { mode: 'reference-image'; images: string[]; size: ImageSize }
  | { mode: 'template-text'; image: string; size: ImageSize };

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  status?: string;           // Dify 返回的 status（"yes" 表示可编辑）
  messageDbId?: string;      // 数据库中的消息 ID，用于更新 response
  isConfirmed?: boolean;     // 用户是否点击了确认按钮（仅 status=yes 的消息有意义）
  messageType?: MessageType; // 消息类型（默认 'text'）
  designMode?: DesignMode;   // 用户选择的设计模式（仅 design-mode-selection 类型使用）
  designModeConfig?: DesignModeConfig;  // 设计模式完整配置（仅 design-mode-selection 类型使用）
  
  // 图片生成结果相关（仅 image-generation-result 类型使用）
  generatedImages?: string[];        // 生成的图片 base64 列表
  selectedImageIndex?: number | null; // 用户选择的图片索引
  step?: 1 | 2;                       // 生成步骤（1=背景图，2=效果图）
  
  // 文字编辑相关（仅 text-edit-ready 类型使用）
  diffAnalysisResult?: unknown;       // 差异分析结果
  editedImageUrl?: string;            // 编辑后的图片 URL
}

// ===== 聊天会话 =====
export interface ChatSession {
  id: string;                   // 前端标识（frontend_id），用于发送消息时关联对话
  dbId?: string;                // 数据库 UUID，用于查询消息
  title: string;
  messages: Message[];
  createdAt: number;
  difyConversationId?: string;  // Dify 的 conversation_id（用于多轮对话）
  designMode?: DesignMode;      // 用户选择的设计模式
  designModeConfig?: DesignModeConfig;  // 设计模式完整配置（图片、尺寸等）
  // Step1 生成的图片（持久化）
  generatedImages?: string[];
  selectedImageIndex?: number | null;
  // Step2 生成的图片（持久化）
  step2GeneratedImages?: string[];
  step2SelectedIndex?: number | null;
  // Step3 编辑相关（持久化）
  editedImage?: string;         // 编辑后的图片 URL
  canvasState?: unknown;        // Canvas 状态（用于持续编辑）
  diffAnalysis?: unknown;       // 差异分析结果
}

