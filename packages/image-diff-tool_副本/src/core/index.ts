/**
 * L-Core 对外导出入口
 * 
 * 使用方式：
 * import { runImageDiff, projectId } from "@internal/image-diff-tool";
 */

// 项目标识
export const projectId = "image-diff-tool";
export const projectName = "图片差异检测工具";

// 版本标识（用于验证是否接入了副本版本）
export const IMAGE_DIFF_VERSION = "副本版本-含X距离检查算法-v2";

// 模块加载时验证
console.log("🔧 [image-diff-tool] 加载版本:", IMAGE_DIFF_VERSION);

// 主能力函数
export { runImageDiff } from "./pipelines/runImageDiff";

// OCR 配置（用于设置 conversationId）
export { setConversationId } from "./services/difyClient";

// 步骤函数（可选导出，供高级用户使用）
export { computePixelDiff } from "./steps/computePixelDiff";
export { clusterDiffRegions } from "./steps/clusterDiffRegions";
export { visualizeDiff, createDiffMaskImage, visualizeDiffByLine, generateLinePreviewImage, generateReconstructedImage } from "./steps/visualizeDiff";
export { loadImageAsImageData, imageDataToDataUrl } from "./steps/loadImage";
export { groupRegionsByLine } from "./steps/groupRegionsByLine";
export { recognizeText } from "./steps/recognizeText";

// 文字编辑器集成（子项目）
export {
  integrateTextEditor,
  linesToEditableLines,
  linesToCanvasTextObjects,
  DEFAULT_FONT_CONFIG,
  createInitialHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  lineToCanvasTextObject,
} from "./steps/integrateTextEditor";

// 类型导出
export type {
  DiffConfig,
  DiffRegion,
  BoundingBox,
  Point,
  LineGroupInfo,
  RGBColor,
  ComputePixelDiffInput,
  ComputePixelDiffOutput,
  ClusterDiffRegionsInput,
  ClusterDiffRegionsOutput,
  RunImageDiffInput,
  RunImageDiffOutput,
} from "./types/io";

export type {
  LineGroup,
  GroupRegionsByLineInput,
  GroupRegionsByLineOutput,
} from "./steps/groupRegionsByLine";

export type {
  RecognizeTextInput,
  RecognizeTextOutput,
  RecognizedLine,
} from "./steps/recognizeText";

export type { CoreContext, Logger } from "./types/context";
export type { CoreFn } from "./types/functional";

// 文字编辑器类型（来自子项目）
export type {
  EditableLine,
  FontConfig,
  RunTextEditorInput,
  RunTextEditorOutput,
  CanvasTextObject,
  CanvasHistoryState,
} from "./steps/integrateTextEditor";

