/**
 * 差异可视化
 * 在原图上绘制差异区域的边界框
 */

import type { CoreContext } from "../types/context";
import type { DiffRegion, LineGroupInfo, RGBColor, BoundingBox } from "../types/io";
import { loadImageAsImageData } from "./loadImage";

/**
 * 预定义的行颜色池
 */
export const LINE_COLORS: RGBColor[] = [
  [255, 59, 48],    // 红
  [52, 199, 89],    // 绿
  [0, 122, 255],    // 蓝
  [255, 149, 0],    // 橙
  [175, 82, 222],   // 紫
  [90, 200, 250],   // 青
  [255, 45, 85],    // 粉
  [88, 86, 214],    // 靛蓝
];

export interface VisualizeDiffInput {
  /** 原图（base64 DataURL） */
  originalImage: string;
  /** 差异区域列表 */
  regions: DiffRegion[];
  /** 边界框内边距 */
  padding?: number;
  /** 高亮颜色 */
  highlightColor?: string;
  /** 线宽 */
  lineWidth?: number;
}

export interface VisualizeDiffOutput {
  /** 可视化结果（base64 DataURL） */
  visualizedImage: string;
}

/**
 * 可视化差异区域
 */
export async function visualizeDiff(
  input: VisualizeDiffInput,
  ctx?: CoreContext
): Promise<VisualizeDiffOutput> {
  const logger = ctx?.adapters?.logger;
  const {
    originalImage,
    regions,
    padding = 5,
    highlightColor = "#FF0000",
    lineWidth = 3,
  } = input;

  logger?.info?.("[Visualize] 绘制", regions.length, "个边界框");

  // 加载原图
  const imgData = await loadImageAsImageData(originalImage, ctx);
  const { width, height } = imgData;

  // 创建 Canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasCtx = canvas.getContext("2d")!;

  // 绘制原图
  canvasCtx.putImageData(imgData, 0, 0);

  // 绘制边界框
  canvasCtx.strokeStyle = highlightColor;
  canvasCtx.lineWidth = lineWidth;
  canvasCtx.font = "bold 16px Arial";
  canvasCtx.fillStyle = highlightColor;

  regions.forEach((region, index) => {
    const { x, y, width: w, height: h } = region.boundingBox;

    // 扩展边界框
    const px = Math.max(0, x - padding);
    const py = Math.max(0, y - padding);
    const pw = Math.min(width - px, w + padding * 2);
    const ph = Math.min(height - py, h + padding * 2);

    // 绘制矩形边框
    canvasCtx.strokeRect(px, py, pw, ph);

    // 绘制区域编号
    const label = `#${index + 1}`;
    const labelY = py > 20 ? py - 5 : py + ph + 18;
    
    // 绘制白色背景
    canvasCtx.fillStyle = "white";
    canvasCtx.fillRect(px, labelY - 14, 30, 18);
    
    // 绘制文字
    canvasCtx.fillStyle = highlightColor;
    canvasCtx.fillText(label, px + 2, labelY);
  });

  return {
    visualizedImage: canvas.toDataURL("image/png"),
  };
}

/**
 * 生成差异掩码高亮图
 */
export async function createDiffMaskImage(
  originalImage: string,
  labeledMask: ImageData,
  ctx?: CoreContext
): Promise<string> {
  const logger = ctx?.adapters?.logger;
  logger?.info?.("[Visualize] 生成差异掩码图");

  const imgData = await loadImageAsImageData(originalImage, ctx);
  const { width, height } = imgData;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasCtx = canvas.getContext("2d")!;

  // 绘制原图（降低亮度）
  canvasCtx.putImageData(imgData, 0, 0);
  canvasCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
  canvasCtx.fillRect(0, 0, width, height);

  // 叠加差异掩码
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d")!;
  maskCtx.putImageData(labeledMask, 0, 0);

  canvasCtx.drawImage(maskCanvas, 0, 0);

  return canvas.toDataURL("image/png");
}

/**
 * 按行绘制边界框输入
 */
export interface VisualizeDiffByLineInput {
  /** 原图（base64 DataURL） */
  originalImage: string;
  /** 行分组信息（需要包含 lineColor） */
  lines: LineGroupInfo[];
  /** 边界框内边距 */
  padding?: number;
  /** 线宽 */
  lineWidth?: number;
}

/**
 * 按行可视化差异区域
 * 每行用不同颜色的边界框标注，只显示行号
 */
export async function visualizeDiffByLine(
  input: VisualizeDiffByLineInput,
  ctx?: CoreContext
): Promise<{ visualizedImage: string }> {
  const logger = ctx?.adapters?.logger;
  const { originalImage, lines, padding = 5, lineWidth = 3 } = input;

  logger?.info?.("[VisualizeByLine] 绘制", lines.length, "个行边界框");

  // 加载原图
  const imgData = await loadImageAsImageData(originalImage, ctx);
  const { width, height } = imgData;

  // 创建 Canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasCtx = canvas.getContext("2d")!;

  // 绘制原图
  canvasCtx.putImageData(imgData, 0, 0);

  // 按行绘制边界框
  lines.forEach((line, index) => {
    const { x, y, width: w, height: h } = line.boundingBox;
    const lineColor = line.lineColor || LINE_COLORS[index % LINE_COLORS.length];
    const [r, g, b] = lineColor;
    const color = `rgb(${r}, ${g}, ${b})`;

    // 扩展边界框
    const px = Math.max(0, x - padding);
    const py = Math.max(0, y - padding);
    const pw = Math.min(width - px, w + padding * 2);
    const ph = Math.min(height - py, h + padding * 2);

    // 绘制矩形边框
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = lineWidth;
    canvasCtx.strokeRect(px, py, pw, ph);

    // 绘制行号标签
    const label = `行${index + 1}`;
    canvasCtx.font = "bold 14px Arial";
    const labelY = py > 20 ? py - 5 : py + ph + 16;

    // 白色背景
    const textWidth = canvasCtx.measureText(label).width;
    canvasCtx.fillStyle = "white";
    canvasCtx.fillRect(px, labelY - 12, textWidth + 6, 16);

    // 彩色文字
    canvasCtx.fillStyle = color;
    canvasCtx.fillText(label, px + 3, labelY);
  });

  return { visualizedImage: canvas.toDataURL("image/png") };
}

/**
 * 生成行白底预览图输入
 */
export interface GenerateLinePreviewImageInput {
  /** 原图 ImageData（用于提取实际颜色） */
  originalImageData: ImageData;
  /** 差异掩码（二值图，白色=差异） */
  diffMask: ImageData;
  /** 行的边界框 */
  boundingBox: BoundingBox;
  /** 边界框内边距 */
  padding?: number;
}

/**
 * 生成行白底预览图输出
 */
export interface GenerateLinePreviewImageOutput {
  /** 预览图（dataUrl） */
  previewImage: string;
  /** 差异内容的主色调（出现最多的颜色） */
  contentColor: RGBColor;
}

/**
 * 生成行的白底预览图
 * 在白色背景上绘制该行的差异像素，使用原图中的实际颜色
 * 同时计算差异内容的主色调
 */
export async function generateLinePreviewImage(
  input: GenerateLinePreviewImageInput,
  ctx?: CoreContext
): Promise<GenerateLinePreviewImageOutput> {
  const logger = ctx?.adapters?.logger;
  const { originalImageData, diffMask, boundingBox, padding = 5 } = input;
  const { x, y, width: boxWidth, height: boxHeight } = boundingBox;

  logger?.info?.("[LinePreview] 生成行预览图, 尺寸:", boxWidth, "x", boxHeight);

  // 创建白底 canvas
  const canvasWidth = boxWidth + padding * 2;
  const canvasHeight = boxHeight + padding * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const canvasCtx = canvas.getContext("2d")!;

  // 填充白色背景
  canvasCtx.fillStyle = "white";
  canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 获取 canvas 的 ImageData
  const imgData = canvasCtx.getImageData(0, 0, canvasWidth, canvasHeight);

  // 统计颜色分布（用于计算主色调）
  const colorCount = new Map<string, { count: number; r: number; g: number; b: number }>();

  // 遍历行边界框内的像素
  for (let py = y; py < y + boxHeight; py++) {
    for (let px = x; px < x + boxWidth; px++) {
      // 检查是否在 diffMask 范围内
      if (px < 0 || px >= diffMask.width || py < 0 || py >= diffMask.height) {
        continue;
      }

      const maskIdx = (py * diffMask.width + px) * 4;

      // 检查是否是差异像素（白色 = 差异）
      if (diffMask.data[maskIdx] === 255) {
        const targetX = px - x + padding;
        const targetY = py - y + padding;
        const targetIdx = (targetY * canvasWidth + targetX) * 4;

        // 从原图中提取实际颜色
        const sourceIdx = (py * originalImageData.width + px) * 4;
        const r = originalImageData.data[sourceIdx];
        const g = originalImageData.data[sourceIdx + 1];
        const b = originalImageData.data[sourceIdx + 2];

        imgData.data[targetIdx] = r;
        imgData.data[targetIdx + 1] = g;
        imgData.data[targetIdx + 2] = b;
        imgData.data[targetIdx + 3] = 255;

        // 量化颜色（减少颜色数量，每个通道分成16个级别）
        const quantR = Math.floor(r / 16) * 16;
        const quantG = Math.floor(g / 16) * 16;
        const quantB = Math.floor(b / 16) * 16;
        const colorKey = `${quantR},${quantG},${quantB}`;

        const existing = colorCount.get(colorKey);
        if (existing) {
          existing.count++;
        } else {
          colorCount.set(colorKey, { count: 1, r: quantR, g: quantG, b: quantB });
        }
      }
    }
  }

  canvasCtx.putImageData(imgData, 0, 0);

  // 找出出现最多的颜色（主色调）
  let dominantColor: RGBColor = [128, 128, 128]; // 默认灰色
  let maxCount = 0;

  for (const [, value] of colorCount) {
    if (value.count > maxCount) {
      maxCount = value.count;
      dominantColor = [value.r, value.g, value.b];
    }
  }

  logger?.info?.("[LinePreview] 主色调:", dominantColor);

  return {
    previewImage: canvas.toDataURL("image/png"),
    contentColor: dominantColor,
  };
}

/**
 * 生成重建图输入
 */
export interface GenerateReconstructedImageInput {
  /** 背景图（原图 Before） */
  backgroundImage: string;
  /** 行分组信息（包含位置、颜色、识别文字） */
  lines: LineGroupInfo[];
}

/**
 * 生成重建图
 * 在原图 Before 上用 OCR 识别的文字绘制，使用对应的颜色和位置
 */
export async function generateReconstructedImage(
  input: GenerateReconstructedImageInput,
  ctx?: CoreContext
): Promise<string> {
  const logger = ctx?.adapters?.logger;
  const { backgroundImage, lines } = input;

  logger?.info?.("[Reconstruct] 生成重建图, 行数:", lines.length);

  // 加载背景图
  const bgData = await loadImageAsImageData(backgroundImage, ctx);
  const { width, height } = bgData;

  // 创建画布
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasCtx = canvas.getContext("2d")!;

  // 绘制背景（原图 Before）
  canvasCtx.putImageData(bgData, 0, 0);

  // 遍历每一行，绘制文字
  for (const line of lines) {
    // 如果没有识别出文字，跳过
    if (!line.recognizedText) continue;

    const { boundingBox, contentColor, recognizedText } = line;
    const { x, y, width: boxWidth, height: boxHeight } = boundingBox;

    // 计算字体大小（让文字高度接近行高）
    const fontSize = Math.round(boxHeight * 0.85);

    // 设置文字样式
    const [r, g, b] = contentColor || [0, 0, 0];
    canvasCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    canvasCtx.font = `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;

    // 计算中心点
    const centerX = x + boxWidth / 2;
    const centerY = y + boxHeight / 2;

    // 设置对齐方式
    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "middle";

    // 绘制文字
    canvasCtx.fillText(recognizedText, centerX, centerY);

    logger?.info?.(
      `[Reconstruct] 行${line.lineIndex + 1}: "${recognizedText}" @ (${centerX}, ${centerY}), 字号=${fontSize}px, 颜色=rgb(${r},${g},${b})`
    );
  }

  return canvas.toDataURL("image/png");
}

