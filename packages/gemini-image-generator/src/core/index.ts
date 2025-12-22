/**
 * Gemini Image Generator - Core 模块入口
 * 
 * 遵循 L-Project 规范：统一导出 projectId、runProject 和类型
 */

// ==================== 项目标识 ====================

export const projectId = "gemini-image-generator";

// ==================== 主入口函数 ====================

export { runProject } from "./pipelines/runProject";

// ==================== 类型导出 ====================

// IO 类型
export type {
  AspectRatio,
  ImageResolution,
  ImageData,
  RunProjectInput,
  RunProjectOutput,
  GeneratedImage,
  GeminiApiRequest,
  GeminiApiResponse,
} from "./types/io";

// 常量配置
export {
  ASPECT_RATIO_OPTIONS,
  RESOLUTION_OPTIONS,
  DEFAULT_CONFIG,
} from "./types/io";

// Context 类型
export type {
  ApiClient,
  Logger,
  CoreContext,
} from "./types/context";

// 函数类型
export type { CoreFn } from "./types/functional";
