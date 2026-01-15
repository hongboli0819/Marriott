/**
 * @internal/template-extractor
 *
 * 模版提取器 - 从图片中提取可编辑模版
 *
 * 工作流程：
 * 1. 输入图片 → 计算宽高比，匹配最接近的标准比例
 * 2. 第一轮 Gemini → 原封不动复制图片（4K 高清）
 * 3. 第二轮 Gemini → 剔除图片中的文字
 * 4. image-diff-tool → 对比差异，识别文字区域
 * 5. 输出 → 背景图 + 文字对象列表（可编辑）
 *
 * @example
 * ```typescript
 * import { runTemplateExtraction } from '@internal/template-extractor';
 *
 * const result = await runTemplateExtraction({
 *   sourceImage: imageDataUrl,
 *   resolution: "4K",
 *   onProgress: (info) => console.log(info.message),
 * });
 *
 * if (result.success) {
 *   console.log(`识别 ${result.lines?.length} 行文字`);
 *   console.log(`背景图: ${result.backgroundImage}`);
 *   console.log(`可编辑对象:`, result.canvasTextObjects);
 * }
 * ```
 */

// ============================================
// Project Identity
// ============================================

export const projectId = "template-extractor";
export const projectName = "模版提取器";
export const projectVersion = "0.1.0";

// ============================================
// Types - Context
// ============================================

export type { CoreContext, Logger } from "./types/context";

// ============================================
// Types - Functional
// ============================================

export type { CoreFn } from "./types/functional";

// ============================================
// Types - IO
// ============================================

export type {
  SupportedAspectRatio,
  ImageResolution,
  AspectRatioConfig,
  BoundingBox,
  Point,
  RGBColor,
  TextRegion,
  LineInfo,
  CanvasTextObject,
  ProcessingStage,
  ProgressInfo,
  ProgressCallback,
  TimingInfo,
  TemplateExtractionInput,
  TemplateExtractionOutput,
} from "./types/io";

export { ASPECT_RATIO_CONFIG } from "./types/io";

// ============================================
// Main Pipeline
// ============================================

export { runTemplateExtraction } from "./pipelines/runTemplateExtraction";

// ============================================
// Steps (Advanced Usage)
// ============================================

export {
  matchAspectRatio,
  getImageSize,
  parseDataUrl,
  toDataUrl,
} from "./steps/matchAspectRatio";

export type {
  MatchAspectRatioInput,
  MatchAspectRatioOutput,
} from "./steps/matchAspectRatio";

export { callGeminiCopy } from "./steps/callGeminiCopy";
export type {
  CallGeminiCopyInput,
  CallGeminiCopyOutput,
} from "./steps/callGeminiCopy";

export { callGeminiRemoveText } from "./steps/callGeminiRemoveText";
export type {
  CallGeminiRemoveTextInput,
  CallGeminiRemoveTextOutput,
} from "./steps/callGeminiRemoveText";

export { analyzeTextDiff } from "./steps/analyzeTextDiff";
export type {
  AnalyzeTextDiffInput,
  AnalyzeTextDiffOutput,
} from "./steps/analyzeTextDiff";


