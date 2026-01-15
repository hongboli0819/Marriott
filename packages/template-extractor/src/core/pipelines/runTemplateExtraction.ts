/**
 * 模版提取主流程
 *
 * 输入图片 → 匹配宽高比 → Gemini复制 → Gemini剔除文字 → 差异分析 → 可编辑模版
 */

import type { CoreFn } from "../types/functional";
import type {
  TemplateExtractionInput,
  TemplateExtractionOutput,
  ProgressInfo,
  ProcessingStage,
  TimingInfo,
} from "../types/io";

import {
  matchAspectRatio,
  getImageSize,
  parseDataUrl,
  toDataUrl,
} from "../steps/matchAspectRatio";
import { callGeminiCopy } from "../steps/callGeminiCopy";
import { callGeminiRemoveText } from "../steps/callGeminiRemoveText";
import { analyzeTextDiff } from "../steps/analyzeTextDiff";

// ==================== 辅助函数 ====================

/**
 * 发送进度更新
 */
function emitProgress(
  onProgress: ((info: ProgressInfo) => void) | undefined,
  stage: ProcessingStage,
  progress: number,
  message: string
): void {
  onProgress?.({ stage, progress, message });
}

// ==================== 主流程 ====================

/**
 * 运行模版提取流程
 *
 * @example
 * ```typescript
 * const result = await runTemplateExtraction({
 *   sourceImage: imageDataUrl,
 *   resolution: "4K",
 *   onProgress: (info) => console.log(info.message),
 * });
 *
 * if (result.success) {
 *   console.log(`识别 ${result.lines?.length} 行文字`);
 *   console.log(`背景图: ${result.backgroundImage}`);
 * }
 * ```
 */
export const runTemplateExtraction: CoreFn<
  TemplateExtractionInput,
  TemplateExtractionOutput
> = async (input, ctx) => {
  const { sourceImage, resolution = "4K", onProgress } = input;
  const { logger } = ctx?.adapters || {};

  const timing: TimingInfo = {
    analyze: 0,
    copy: 0,
    removeText: 0,
    diffAnalysis: 0,
    total: 0,
  };
  const totalStart = Date.now();

  logger?.info?.("[runTemplateExtraction] 开始模版提取", { resolution });

  try {
    // ========== 阶段 1: 分析图片 ==========
    emitProgress(onProgress, "analyzing", 5, "正在分析图片...");
    const analyzeStart = Date.now();

    // 获取图片尺寸
    const imageSize = await getImageSize(sourceImage);
    logger?.info?.("[runTemplateExtraction] 图片尺寸", imageSize);

    // 匹配宽高比
    const ratioResult = matchAspectRatio(imageSize);
    logger?.info?.("[runTemplateExtraction] 匹配宽高比", {
      matched: ratioResult.matchedRatio,
      original: ratioResult.originalRatio.toFixed(3),
      diff: ratioResult.diffPercent.toFixed(1) + "%",
    });

    timing.analyze = Date.now() - analyzeStart;
    emitProgress(
      onProgress,
      "analyzing",
      10,
      `宽高比匹配: ${ratioResult.label}`
    );

    // 解析图片数据
    const { base64, mimeType } = parseDataUrl(sourceImage);

    // ========== 阶段 2: 第一轮 Gemini - 复制 ==========
    emitProgress(onProgress, "copying", 15, `正在复制图片 (${resolution})...`);
    const copyStart = Date.now();

    const copyResult = await callGeminiCopy(
      {
        imageBase64: base64,
        mimeType,
        aspectRatio: ratioResult.matchedRatio,
        resolution,
        onRetry: (attempt, maxRetries, error) => {
          emitProgress(
            onProgress,
            "copying",
            15 + attempt * 5,
            `🔄 复制失败，正在重试 (${attempt}/${maxRetries})... 原因: ${error}`
          );
        },
      },
      ctx
    );

    if (!copyResult.success || !copyResult.imageBase64) {
      throw new Error(copyResult.error || "第一轮复制失败");
    }

    timing.copy = Date.now() - copyStart;
    logger?.info?.("[runTemplateExtraction] 第一轮完成", {
      duration: timing.copy + "ms",
    });
    emitProgress(onProgress, "copying", 40, "复制完成");

    // ========== 阶段 3: 第二轮 Gemini - 剔除文字 ==========
    emitProgress(onProgress, "removing-text", 45, "正在剔除文字...");
    const removeStart = Date.now();

    const removeResult = await callGeminiRemoveText(
      {
        imageBase64: copyResult.imageBase64,
        mimeType: "image/png",
        aspectRatio: ratioResult.matchedRatio,
        resolution,
        onRetry: (attempt, maxRetries, error) => {
          emitProgress(
            onProgress,
            "removing-text",
            45 + attempt * 5,
            `🔄 剔除文字失败，正在重试 (${attempt}/${maxRetries})... 原因: ${error}`
          );
        },
      },
      ctx
    );

    if (!removeResult.success || !removeResult.imageBase64) {
      throw new Error(removeResult.error || "第二轮剔除文字失败");
    }

    timing.removeText = Date.now() - removeStart;
    logger?.info?.("[runTemplateExtraction] 第二轮完成", {
      duration: timing.removeText + "ms",
    });
    emitProgress(onProgress, "removing-text", 70, "剔除文字完成");

    // ========== 阶段 4: 差异分析 ==========
    emitProgress(onProgress, "diff-analyzing", 75, "正在分析文字差异...");
    const diffStart = Date.now();

    const diffResult = await analyzeTextDiff(
      {
        backgroundImage: removeResult.imageBase64, // 无文字版 (原图)
        textImage: copyResult.imageBase64, // 有文字版 (新图)
      },
      ctx
    );

    if (!diffResult.success) {
      throw new Error(diffResult.error || "差异分析失败");
    }

    timing.diffAnalysis = Date.now() - diffStart;
    timing.total = Date.now() - totalStart;

    logger?.info?.("[runTemplateExtraction] 差异分析完成", {
      lines: diffResult.lines?.length || 0,
      duration: timing.diffAnalysis + "ms",
    });

    emitProgress(onProgress, "completed", 100, "模版提取完成");

    logger?.info?.("[runTemplateExtraction] ✅ 全部完成", {
      lines: diffResult.lines?.length || 0,
      totalDuration: timing.total + "ms",
    });

    return {
      success: true,
      originalSize: imageSize,
      matchedAspectRatio: ratioResult.matchedRatio,
      copyImage: toDataUrl(copyResult.imageBase64),
      backgroundImage: toDataUrl(removeResult.imageBase64),
      lines: diffResult.lines,
      canvasTextObjects: diffResult.canvasTextObjects,
      diffVisualization: diffResult.diffVisualization,
      reconstructedImage: diffResult.reconstructedImage,
      timing,
    };
  } catch (error) {
    timing.total = Date.now() - totalStart;
    const errorMessage = error instanceof Error ? error.message : "未知错误";

    logger?.error?.("[runTemplateExtraction] ❌ 失败", {
      error: errorMessage,
      duration: timing.total + "ms",
    });
    emitProgress(onProgress, "failed", 0, errorMessage);

    return {
      success: false,
      error: errorMessage,
      timing,
    };
  }
};

