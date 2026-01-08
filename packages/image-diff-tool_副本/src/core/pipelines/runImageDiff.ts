/**
 * 图像差异检测主流程
 */

import type { CoreFn } from "../types/functional";
import type { RunImageDiffInput, RunImageDiffOutput, DiffConfig, LineGroupInfo } from "../types/io";
import { computePixelDiff } from "../steps/computePixelDiff";
import { clusterDiffRegions } from "../steps/clusterDiffRegions";
import { 
  visualizeDiff, 
  createDiffMaskImage, 
  visualizeDiffByLine, 
  generateLinePreviewImage,
  generateReconstructedImage,
  LINE_COLORS 
} from "../steps/visualizeDiff";
import { loadImageAsImageData } from "../steps/loadImage";
import { groupRegionsByLine } from "../steps/groupRegionsByLine";
import { recognizeText } from "../steps/recognizeText";
import { recognizeTextWithDify } from "../steps/recognizeTextWithDify";

/**
 * 默认配置
 */
const DEFAULT_CONFIG: DiffConfig = {
  threshold: 100,
  minAreaSize: 10,
  dilateRadius: 0,
  boundingBoxPadding: 5,
  highlightColor: "#FF0000",
  enableLineGrouping: true,
  lineOverlapThreshold: 0.4,
  enableOcr: false,
  ocrLanguage: "chi_sim+eng",
  // 行合并后处理配置
  enableLineMerge: true,
  lineMergeCenterYThreshold: 30,
  lineMergeOverlapThreshold: 0.3,
  // X 距离阈值（像素）
  maxXGap: 55,
};

/**
 * 执行图像差异检测
 * 
 * @param input - 两张图片和配置
 * @param ctx - 上下文
 * @returns 差异分析结果
 */
export const runImageDiff: CoreFn<RunImageDiffInput, RunImageDiffOutput> = async (
  input,
  ctx
) => {
  const logger = ctx?.adapters?.logger;
  const { imageA, imageB, config, wording } = input;
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // 是否使用 Dify 进行文字识别
  const useDifyOCR = !!wording?.trim();

  logger?.info?.("[ImageDiff] 开始差异检测...");
  const startTime = Date.now();

  // Step 1: 计算像素差异
  logger?.info?.("[ImageDiff] Step 1: 计算像素差异");
  const pixelDiffResult = await computePixelDiff(
    {
      imageA,
      imageB,
      threshold: finalConfig.threshold,
    },
    ctx
  );

  // Step 2: 聚类差异区域
  logger?.info?.("[ImageDiff] Step 2: 聚类差异区域");
  const clusterResult = await clusterDiffRegions(
    {
      diffMask: pixelDiffResult.diffMask,
      dilateRadius: finalConfig.dilateRadius,
      minAreaSize: finalConfig.minAreaSize,
    },
    ctx
  );

  // Step 3: 生成差异掩码图
  logger?.info?.("[ImageDiff] Step 3: 生成差异掩码图");
  const diffMaskImage = await createDiffMaskImage(
    imageB,
    clusterResult.labeledMask,
    ctx
  );

  // Step 4: 行分组（可选）
  let lines: LineGroupInfo[] | undefined;
  let visualizedImage: string;

  if (finalConfig.enableLineGrouping && clusterResult.regions.length > 0) {
    logger?.info?.("[ImageDiff] Step 4: 按行分组");
    const groupResult = await groupRegionsByLine(
      {
        regions: clusterResult.regions,
        overlapThreshold: finalConfig.lineOverlapThreshold,
        // 行合并后处理配置
        enableLineMerge: finalConfig.enableLineMerge,
        lineMergeCenterYThreshold: finalConfig.lineMergeCenterYThreshold,
        lineMergeOverlapThreshold: finalConfig.lineMergeOverlapThreshold,
        // X 距离阈值
        maxXGap: finalConfig.maxXGap,
      },
      ctx
    );

    // 构建 LineGroupInfo 并分配颜色
    lines = groupResult.lines.map((line, index) => ({
      lineIndex: line.lineIndex,
      regionIds: line.regions.map((r) => r.id),
      boundingBox: line.boundingBox,
      recognizedText: line.recognizedText,
      lineColor: LINE_COLORS[index % LINE_COLORS.length],
    }));

    // Step 5: 为每行生成白底预览图（使用原图实际颜色）并计算主色调
    logger?.info?.("[ImageDiff] Step 5: 生成行预览图");
    const originalImageData = await loadImageAsImageData(imageB, ctx);
    for (const line of lines) {
      const result = await generateLinePreviewImage(
        {
          originalImageData,
          diffMask: pixelDiffResult.diffMask,
          boundingBox: line.boundingBox,
          padding: 5,
        },
        ctx
      );
      line.linePreviewImage = result.previewImage;
      line.contentColor = result.contentColor;
    }

    // Step 6: 按行生成可视化图
    logger?.info?.("[ImageDiff] Step 6: 生成按行标注的可视化图");
    const visualizeResult = await visualizeDiffByLine(
      {
        originalImage: imageB,
        lines,
        padding: finalConfig.boundingBoxPadding,
      },
      ctx
    );
    visualizedImage = visualizeResult.visualizedImage;

    // Step 7: 文字识别（Dify 或 OCR）
    if (useDifyOCR) {
      // 使用 Dify 进行文字识别
      logger?.info?.("[ImageDiff] Step 7: 使用 Dify 识别文字");
      try {
        const difyResult = await recognizeTextWithDify(
          {
            lines,
            wording: wording!,
          },
          ctx
        );

        // 将识别结果填充到 lines
        for (const result of difyResult.results) {
          const line = lines.find((l) => l.lineIndex === result.lineIndex);
          if (line) {
            line.recognizedText = result.recognizedText?.replace(/\s+/g, "") || "";
          }
        }

        logger?.info?.(`[ImageDiff] Dify 识别完成: ${difyResult.successCount} 成功, ${difyResult.failCount} 失败`);
      } catch (difyError) {
        logger?.error?.("[ImageDiff] Dify 识别失败:", difyError);
      }
    } else {
      // 使用 OCR 进行文字识别
      logger?.info?.("[ImageDiff] Step 7: 自动 OCR 识别");
      try {
        // 构建 LineGroup 结构（recognizeText 需要的格式）
        const lineGroups = lines.map((line) => ({
          lineIndex: line.lineIndex,
          regions: line.regionIds
            .map((id) => clusterResult.regions.find((r) => r.id === id))
            .filter(Boolean) as typeof clusterResult.regions,
          boundingBox: line.boundingBox,
        }));

        const ocrResult = await recognizeText(
          {
            imageDataUrl: imageB,
            lines: lineGroups,
            language: finalConfig.ocrLanguage,
            padding: 10,
          },
          ctx
        );

        // 将识别结果填充到 lines（去除空格）
        for (const ocrLine of ocrResult.lines) {
          const line = lines.find((l) => l.lineIndex === ocrLine.lineIndex);
          if (line) {
            // 去除所有空格（包括全角空格）
            line.recognizedText = ocrLine.recognizedText?.replace(/\s+/g, "") || "";
            line.confidence = ocrLine.confidence;
          }
        }

        logger?.info?.("[ImageDiff] OCR 识别完成");
      } catch (ocrError) {
        logger?.error?.("[ImageDiff] OCR 识别失败:", ocrError);
      }
    }
  } else {
    // 没有行分组时，使用原来的按区域标注
    logger?.info?.("[ImageDiff] Step 4: 生成按区域标注的可视化图");
    const visualizeResult = await visualizeDiff(
      {
        originalImage: imageB,
        regions: clusterResult.regions,
        padding: finalConfig.boundingBoxPadding,
        highlightColor: finalConfig.highlightColor,
      },
      ctx
    );
    visualizedImage = visualizeResult.visualizedImage;
  }

  // Step 8: 生成重建图（如果有 OCR 结果）
  let reconstructedImage: string | undefined;
  let fullText: string | undefined;

  if (lines && lines.some((l) => l.recognizedText)) {
    logger?.info?.("[ImageDiff] Step 8: 生成重建图");
    try {
      reconstructedImage = await generateReconstructedImage(
        {
          backgroundImage: imageA, // 使用原图 Before 作为背景
          lines,
        },
        ctx
      );

      // 拼接全文
      fullText = lines
        .filter((l) => l.recognizedText)
        .map((l) => l.recognizedText)
        .join("\n");

      logger?.info?.("[ImageDiff] 重建图生成完成");
    } catch (reconstructError) {
      logger?.error?.("[ImageDiff] 重建图生成失败:", reconstructError);
    }
  }

  const elapsed = Date.now() - startTime;
  logger?.info?.("[ImageDiff] 完成! 耗时:", elapsed, "ms");
  logger?.info?.("[ImageDiff] 发现", clusterResult.regions.length, "个差异区域");
  if (lines) {
    logger?.info?.("[ImageDiff] 分组为", lines.length, "行");
  }

  return {
    regions: clusterResult.regions,
    visualizedImage,
    diffMaskImage,
    totalDiffPixels: pixelDiffResult.diffPixelCount,
    imageSize: pixelDiffResult.size,
    lines,
    fullText,
    reconstructedImage,
  };
};

