/**
 * Gemini Image Generator - 输入/输出类型定义
 * 
 * 遵循 L-Project 规范：纯函数的 DTO 类型
 */

// ==================== 基础类型 ====================

/** 宽高比选项 */
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";

/** 分辨率选项 */
export type ImageResolution = "1K" | "2K" | "4K";

/** 图片数据 */
export interface ImageData {
  base64: string;
  mimeType: string;
}

// ==================== runProject 输入/输出 ====================

/** runProject 输入 */
export interface RunProjectInput {
  /** 生成提示词 */
  prompt: string;
  
  /** 参考图片（base64 数组，可选） */
  referenceImages?: ImageData[];
  
  /** 宽高比 */
  aspectRatio: AspectRatio;
  
  /** 分辨率 */
  resolution: ImageResolution;
  
  /** 生成数量（1-10） */
  count: number;
}

/** 生成的单张图片 */
export interface GeneratedImage {
  /** 图片 base64 数据 */
  base64: string;
  
  /** AI 返回的文字说明（可选） */
  text?: string;
  
  /** 生成时间戳 */
  timestamp: number;
}

/** runProject 输出 */
export interface RunProjectOutput {
  /** 是否成功 */
  success: boolean;
  
  /** 生成的图片列表 */
  generatedImages: GeneratedImage[];
  
  /** 错误信息（失败时） */
  error?: string;
  
  /** 成功生成的数量 */
  successCount: number;
  
  /** 请求的总数量 */
  totalCount: number;
}

// ==================== API 请求/响应类型 ====================

/** Edge Function 请求参数 */
export interface GeminiApiRequest {
  prompt: string;
  images: ImageData[];
  aspectRatio: AspectRatio;
  imageSize: ImageResolution;
}

/** Edge Function 响应 */
export interface GeminiApiResponse {
  success: boolean;
  imageBase64?: string;
  text?: string;
  error?: string;
}

// ==================== 常量配置 ====================

/** 宽高比选项配置 */
export const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 (正方形)" },
  { value: "16:9", label: "16:9 (横屏)" },
  { value: "9:16", label: "9:16 (竖屏)" },
  { value: "3:2", label: "3:2 (相机横版)" },
  { value: "2:3", label: "2:3 (相机竖版)" },
];

/** 分辨率选项配置 */
export const RESOLUTION_OPTIONS: { value: ImageResolution; label: string }[] = [
  { value: "1K", label: "1K (标准)" },
  { value: "2K", label: "2K (高清)" },
  { value: "4K", label: "4K (超高清)" },
];

/** 默认配置 */
export const DEFAULT_CONFIG = {
  aspectRatio: "1:1" as AspectRatio,
  resolution: "1K" as ImageResolution,
  count: 1,
  maxCount: 10,
  minCount: 1,
} as const;
