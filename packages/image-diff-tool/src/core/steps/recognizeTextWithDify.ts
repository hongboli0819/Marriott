/**
 * 使用 Dify 识别文字
 * 
 * 替代 OCR，通过 Dify API 识别每行白底图中的文字
 */

import type { LineGroupInfo } from "../types/io";
import type { CoreContext } from "../types/context";
import { batchCallDifyOCR } from "../services/difyClient";

/**
 * 识别结果
 */
export interface DifyRecognizedLine {
  lineIndex: number;
  recognizedText: string;
  error?: string;
}

/**
 * 输入参数
 */
export interface RecognizeTextWithDifyInput {
  /** 行分组信息（需要有 linePreviewImage） */
  lines: LineGroupInfo[];
  /** 参考文字（用户输入） */
  wording: string;
}

/**
 * 输出结果
 */
export interface RecognizeTextWithDifyOutput {
  /** 识别结果列表 */
  results: DifyRecognizedLine[];
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failCount: number;
}

/**
 * 使用 Dify 识别每行的文字
 * 
 * @param input - 输入参数
 * @param ctx - 上下文
 * @returns 识别结果
 */
export async function recognizeTextWithDify(
  input: RecognizeTextWithDifyInput,
  ctx?: CoreContext
): Promise<RecognizeTextWithDifyOutput> {
  const logger = ctx?.adapters?.logger;
  const { lines, wording } = input;

  logger?.info?.(`[RecognizeTextWithDify] 开始识别 ${lines.length} 行, wording 长度: ${wording.length}`);

  // 过滤出有白底图的行
  const linesWithPreview = lines.filter((line) => line.linePreviewImage);

  if (linesWithPreview.length === 0) {
    logger?.warn?.("[RecognizeTextWithDify] 没有行有白底图，跳过识别");
    return {
      results: [],
      successCount: 0,
      failCount: 0,
    };
  }

  logger?.info?.(`[RecognizeTextWithDify] ${linesWithPreview.length} 行有白底图`);

  // 构建任务列表
  const tasks = linesWithPreview.map((line) => ({
    wording,
    imageDataUrl: line.linePreviewImage!,
    imageName: `line-${line.lineIndex + 1}.png`,
    lineIndex: line.lineIndex,
  }));

  // 调用 Dify OCR（并发 10 个）
  const ocrResults = await batchCallDifyOCR(tasks, 10);

  // 转换结果
  const results: DifyRecognizedLine[] = ocrResults.map((r) => ({
    lineIndex: r.lineIndex,
    recognizedText: r.text,
    error: r.error,
  }));

  const successCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;

  logger?.info?.(`[RecognizeTextWithDify] 识别完成: ${successCount} 成功, ${failCount} 失败`);

  return {
    results,
    successCount,
    failCount,
  };
}

