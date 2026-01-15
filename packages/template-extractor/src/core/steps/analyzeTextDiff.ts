/**
 * 第三轮：使用 image-diff-tool 分析文字差异
 *
 * 注意：无文字版作为原图(imageA)，有文字版作为新图(imageB)
 * 这样差异区域就是"新增的文字"
 */

import type { CoreContext } from "../types/context";
import type { LineInfo, CanvasTextObject, TextRegion, BoundingBox } from "../types/io";
import { toDataUrl } from "./matchAspectRatio";

// ==================== 类型定义 ====================

export interface AnalyzeTextDiffInput {
  /** 无文字版图片 base64 (原图) */
  backgroundImage: string;
  /** 有文字版图片 base64 (新图) */
  textImage: string;
}

export interface AnalyzeTextDiffOutput {
  success: boolean;
  /** 识别的行信息 */
  lines?: LineInfo[];
  /** 可编辑的 Canvas 文字对象 */
  canvasTextObjects?: CanvasTextObject[];
  /** 差异可视化图 */
  diffVisualization?: string;
  /** 重建图 */
  reconstructedImage?: string;
  error?: string;
}

// ==================== 类型转换 ====================

interface DiffToolLineInfo {
  lineIndex: number;
  boundingBox: BoundingBox;
  regions?: Array<{
    id: number;
    boundingBox: BoundingBox;
    center: { x: number; y: number };
    pixelCount?: number;
  }>;
  text?: string;
  dominantColor?: { r: number; g: number; b: number };
}

/**
 * 将 image-diff-tool 的行信息转换为本模块的 LineInfo
 */
function convertLineInfo(diffLine: DiffToolLineInfo): LineInfo {
  const regions: TextRegion[] = (diffLine.regions || []).map((r) => ({
    id: r.id,
    boundingBox: r.boundingBox,
    center: r.center,
    text: undefined,
    color: undefined,
    fontSize: undefined,
  }));

  return {
    lineIndex: diffLine.lineIndex,
    boundingBox: diffLine.boundingBox,
    regions,
    text: diffLine.text,
    dominantColor: diffLine.dominantColor,
  };
}

// ==================== 主函数 ====================

/**
 * 分析文字差异
 */
export async function analyzeTextDiff(
  input: AnalyzeTextDiffInput,
  ctx?: CoreContext
): Promise<AnalyzeTextDiffOutput> {
  const { backgroundImage, textImage } = input;
  const { logger } = ctx?.adapters || {};

  logger?.info?.("[analyzeTextDiff] 开始第三轮：差异分析");

  try {
    // 动态导入 image-diff-tool（避免循环依赖）
    const imageDiffTool = await import("@internal/image-diff-tool");
    const { runImageDiff, linesToCanvasTextObjects } = imageDiffTool;

    // 确保图片是 DataURL 格式
    const imageA = toDataUrl(backgroundImage);
    const imageB = toDataUrl(textImage);

    logger?.debug?.("[analyzeTextDiff] 调用 runImageDiff...");

    // 调用 image-diff-tool
    // 无文字版作为 imageA（原图），有文字版作为 imageB（新图）
    const result = await runImageDiff(
      {
        imageA,
        imageB,
        wording: "", // 模版模式不需要预设文案
        config: {
          threshold: 50,
          minAreaSize: 10,
          enableLineGrouping: true,
          lineOverlapThreshold: 0.4,
          enableOcr: true,  // 启用 OCR 识别文字
        },
      },
      { adapters: { logger } }
    );

    logger?.info?.("[analyzeTextDiff] 差异分析完成", {
      regions: result.regions?.length || 0,
      lines: result.lines?.length || 0,
    });

    // 转换行信息
    const lines: LineInfo[] = (result.lines || []).map(convertLineInfo);

    // 转换为 Canvas 文字对象
    let canvasTextObjects: CanvasTextObject[] = [];
    if (result.lines && result.lines.length > 0) {
      try {
        const rawObjects = linesToCanvasTextObjects(result.lines);
        canvasTextObjects = rawObjects.map((obj: Record<string, unknown>, idx: number) => {
          // 确保 text 不为空，否则 Fabric.js 不会显示
          const text = String(obj.text || "").trim();
          return {
            id: String(obj.id || `text-${idx}`),
            type: "text" as const,
            text: text || `文字区域 ${idx + 1}`,  // 如果没有识别到文字，使用占位符
            left: Number(obj.left || 0),
            top: Number(obj.top || 0),
            width: Number(obj.width || 100),
            height: Number(obj.height || 30),
            fontSize: Number(obj.fontSize || 16),
            fontFamily: String(obj.fontFamily || "Microsoft YaHei"),
            fill: String(obj.fill || "#FFFFFF"),  // 默认白色，因为背景通常较深
            textAlign: (obj.textAlign as "left" | "center" | "right") || "left",
          };
        });
        
        logger?.info?.("[analyzeTextDiff] 创建了 Canvas 对象:", canvasTextObjects.length, "个");
      } catch (e) {
        logger?.warn?.("[analyzeTextDiff] 转换 Canvas 对象失败", { error: e });
      }
    }

    return {
      success: true,
      lines,
      canvasTextObjects,
      diffVisualization: result.visualizedImage,
      reconstructedImage: result.reconstructedImage,
    };
  } catch (error) {
    logger?.error?.("[analyzeTextDiff] 差异分析失败", { error });

    return {
      success: false,
      error: error instanceof Error ? error.message : "差异分析失败",
    };
  }
}

