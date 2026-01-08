/**
 * OCR 文字识别
 * 使用 Tesseract.js 识别图片中的文字
 */

import type { CoreContext } from "../types/context";
import type { BoundingBox } from "../types/io";
import type { LineGroup } from "./groupRegionsByLine";

export interface RecognizeTextInput {
  /** 图片（base64 DataURL） */
  imageDataUrl: string;
  /** 要识别的行列表 */
  lines: LineGroup[];
  /** 语言（默认中英混合） */
  language?: string;
  /** 边界框扩展（像素，默认 5） */
  padding?: number;
}

export interface RecognizedLine extends LineGroup {
  /** 识别出的文字 */
  recognizedText: string;
  /** 置信度（0-100） */
  confidence: number;
}

export interface RecognizeTextOutput {
  /** 识别结果 */
  lines: RecognizedLine[];
  /** 全部文字（按行拼接） */
  fullText: string;
}

/**
 * 裁剪图片区域
 */
async function cropImage(
  imageDataUrl: string,
  box: BoundingBox,
  padding: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      // 计算带 padding 的区域
      const x = Math.max(0, box.x - padding);
      const y = Math.max(0, box.y - padding);
      const width = Math.min(img.width - x, box.width + padding * 2);
      const height = Math.min(img.height - y, box.height + padding * 2);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      // 填充白色背景（提高 OCR 识别率）
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);

      // 绘制裁剪区域
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageDataUrl;
  });
}

/**
 * 动态加载 Tesseract.js
 */
async function loadTesseract(): Promise<typeof import("tesseract.js")> {
  // 动态导入 Tesseract.js
  const Tesseract = await import("tesseract.js");
  return Tesseract;
}

/**
 * 识别单行文字
 */
async function recognizeLine(
  Tesseract: typeof import("tesseract.js"),
  croppedImage: string,
  language: string,
  logger?: CoreContext["adapters"]
): Promise<{ text: string; confidence: number }> {
  try {
    const result = await Tesseract.recognize(croppedImage, language, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          logger?.logger?.info?.(`[OCR] 识别中: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence,
    };
  } catch (error) {
    logger?.logger?.error?.("[OCR] 识别失败:", error);
    return { text: "", confidence: 0 };
  }
}

/**
 * 批量识别文字
 */
export async function recognizeText(
  input: RecognizeTextInput,
  ctx?: CoreContext
): Promise<RecognizeTextOutput> {
  const logger = ctx?.adapters?.logger;
  const {
    imageDataUrl,
    lines,
    language = "chi_sim+eng", // 中文简体 + 英文
    padding = 5,
  } = input;

  logger?.info?.("[OCR] 开始识别, 行数:", lines.length);

  if (lines.length === 0) {
    return { lines: [], fullText: "" };
  }

  // 加载 Tesseract
  logger?.info?.("[OCR] 加载 Tesseract.js...");
  const Tesseract = await loadTesseract();

  const recognizedLines: RecognizedLine[] = [];

  // 逐行识别
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    logger?.info?.(`[OCR] 识别第 ${i + 1}/${lines.length} 行...`);

    // 裁剪行区域
    const croppedImage = await cropImage(imageDataUrl, line.boundingBox, padding);

    // OCR 识别
    const { text, confidence } = await recognizeLine(
      Tesseract,
      croppedImage,
      language,
      ctx?.adapters
    );

    recognizedLines.push({
      ...line,
      recognizedText: text,
      confidence,
    });

    logger?.info?.(`[OCR] 第 ${i + 1} 行: "${text}" (置信度: ${confidence.toFixed(1)}%)`);
  }

  // 拼接全文
  const fullText = recognizedLines
    .map((line) => line.recognizedText)
    .filter(Boolean)
    .join("\n");

  logger?.info?.("[OCR] 识别完成");

  return {
    lines: recognizedLines,
    fullText,
  };
}
