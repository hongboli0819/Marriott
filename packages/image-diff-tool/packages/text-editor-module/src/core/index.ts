/**
 * 文字编辑器模块 - L-Core 对外导出入口
 */

// 项目 ID
export const projectId = "text-editor-module";

// 主函数
export { runTextEditor } from "./pipelines/runTextEditor";

// 步骤函数
export { applyFontConfig } from "./steps/applyFontConfig";
export { renderTextOnCanvas } from "./steps/renderTextOnCanvas";

// 类型导出
export type {
  FontConfig,
  EditableLine,
  RunTextEditorInput,
  RunTextEditorOutput,
  RGBColor,
  BoundingBox,
  CanvasTextObject,
  CanvasHistoryState,
} from "./types/io";

export {
  DEFAULT_FONT_CONFIG,
  createInitialHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  lineToCanvasTextObject,
} from "./types/io";

export type { CoreContext, Logger } from "./types/context";
export type { CoreFn } from "./types/functional";

