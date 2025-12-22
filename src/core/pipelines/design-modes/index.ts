/**
 * 设计模式管道 - 统一入口
 */

// 类型
export type {
  TaskStatus,
  Step1Input,
  Step1Output,
  GenerationTask,
} from "./types";

export { INITIAL_TASK } from "./types";

// 提供设计参考图模式
export * as referenceImage from "./referenceImage";
