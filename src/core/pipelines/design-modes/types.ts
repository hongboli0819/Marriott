/**
 * 设计模式管道 - 类型定义
 */

import type { ImageSize } from "@/core/types/io";

// ==================== 任务状态 ====================

export type TaskStatus = "idle" | "generating" | "selecting" | "completed" | "failed";

// ==================== Step 1: 生成背景图 ====================

export interface Step1Input {
  /** 对话 ID */
  conversationId: string;
  
  /** 用户确认的文案 */
  confirmedText: string;
  
  /** 参考图片 URL 列表 */
  referenceImageUrls: string[];
  
  /** 用户选择的尺寸 */
  size: ImageSize;
}

export interface Step1Output {
  /** 是否成功 */
  success: boolean;
  
  /** 生成的图片 base64 列表 */
  generatedImages: string[];
  
  /** 成功数量 */
  successCount: number;
  
  /** 总数量 */
  totalCount: number;
  
  /** 错误信息 */
  error?: string;
}

// ==================== Step 2: 添加文字生成最终图 ====================

export interface Step2Input {
  /** 对话 ID */
  conversationId: string;
  
  /** 用户确认的文案 */
  confirmedText: string;
  
  /** Step1 选中的背景图 (base64) */
  selectedBackgroundImage: string;
  
  /** 用户选择的尺寸 */
  size: ImageSize;
}

export interface Step2Output {
  /** 是否成功 */
  success: boolean;
  
  /** 生成的图片 base64 列表 */
  generatedImages: string[];
  
  /** 成功数量 */
  successCount: number;
  
  /** 总数量 */
  totalCount: number;
  
  /** 错误信息 */
  error?: string;
}

// ==================== 多步骤任务状态 ====================

export type GenerationStep = 1 | 2;

// ==================== 任务状态 ====================

export interface GenerationTask {
  /** 任务状态 */
  status: TaskStatus;
  
  /** 当前步骤 (1=生成背景图, 2=添加文字) */
  currentStep: GenerationStep;
  
  /** 生成的图片（base64） */
  generatedImages: string[];
  
  /** 用户选择的图片索引 */
  selectedIndex: number | null;
  
  /** 错误信息 */
  error?: string;
  
  /** 进度（0-100） */
  progress: number;
}

// ==================== 初始状态 ====================

export const INITIAL_TASK: GenerationTask = {
  status: "idle",
  currentStep: 1,
  generatedImages: [],
  selectedIndex: null,
  error: undefined,
  progress: 0,
};
