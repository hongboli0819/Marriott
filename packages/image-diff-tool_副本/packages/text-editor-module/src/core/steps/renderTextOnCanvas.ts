/**
 * Canvas 文字渲染
 * 在背景图上绘制文字
 */

import type { CoreContext } from "../types/context";
import type { EditableLine, FontConfig } from "../types/io";

interface RenderInput {
  backgroundImage: string;
  lines: EditableLine[];
}

/**
 * 加载图片为 Image 对象
 */
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`图片加载失败: ${err}`));
    img.src = dataUrl;
  });
}

/**
 * 在 Canvas 上渲染文字
 */
export async function renderTextOnCanvas(
  input: RenderInput,
  ctx?: CoreContext
): Promise<string> {
  const logger = ctx?.adapters?.logger;
  const { backgroundImage, lines } = input;

  logger?.info?.("[RenderText] 开始渲染", lines.length, "行文字");

  // 加载背景图
  const img = await loadImage(backgroundImage);

  // 创建 Canvas
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const canvasCtx = canvas.getContext("2d")!;

  // 绘制背景
  canvasCtx.drawImage(img, 0, 0);

  // 遍历每行绘制文字
  for (const line of lines) {
    const text = line.editedText || line.originalText;
    if (!text) continue;

    const { boundingBox, contentColor, fontConfig } = line;

    // 默认配置
    const config: FontConfig = {
      fontFamily: "Microsoft YaHei",
      fontWeight: "bold",
      fontStyle: "normal",
      letterSpacing: 0,
      fontSizeScale: 1.0,
      ...(fontConfig || {}),
    };

    // 计算字号（基于行高 × 缩放比例）
    const baseFontSize = Math.round(boundingBox.height * 0.85);
    const fontSize = Math.round(baseFontSize * config.fontSizeScale);

    // 设置字体
    canvasCtx.font = `${config.fontStyle} ${config.fontWeight} ${fontSize}px "${config.fontFamily}", "PingFang SC", Arial, sans-serif`;

    // 设置字间距（Canvas 2D 标准支持）
    if ("letterSpacing" in canvasCtx) {
      (canvasCtx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${config.letterSpacing}px`;
    }

    // 设置颜色
    const [r, g, b] = contentColor;
    canvasCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;

    // 计算中心点
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;

    // 设置对齐方式
    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "middle";

    // 绘制文字
    canvasCtx.fillText(text, centerX, centerY);

    logger?.info?.(
      `[RenderText] 行${line.lineIndex + 1}: "${text}" @ (${Math.round(centerX)}, ${Math.round(centerY)}), 字号=${fontSize}px`
    );
  }

  return canvas.toDataURL("image/png");
}

