/**
 * Dify Chat Module - L-Core 入口
 * 
 * 符合 L-Project 开发规范
 * 只导出纯函数和类型，不包含任何 UI 组件或副作用
 */

// ===== 项目标识 =====
export const projectId = "dify-chat-module";
export const projectName = "Dify Chat Module";

// ===== 类型导出 =====
export type {
  // IO 类型
  FileInfo,
  DifyChatInput,
  DifyChatOutput,
  DifyRawResponse,
  DifyChatMessagesResponse,
  DifyFileUploadResponse,
  EdgeFunctionRequest,
  EdgeFunctionResponse,
} from "./types/io";

export type {
  // Context 类型
  ApiClient,
  Logger,
  ProgressCallback,
  StreamCallback,
  CoreContext,
} from "./types/context";

export type {
  // 函数式类型
  CoreFn,
} from "./types/functional";

// ===== 核心函数导出 =====
export { runDifyChat } from "./pipelines/runDifyChat";



