/**
 * 文字编辑器主函数
 * 
 * 功能：
 * 1. 合并全局字体配置和每行的字体配置
 * 2. 在背景图上渲染文字
 * 3. 返回渲染后的图片
 */

import type { CoreFn } from "../types/functional";
import type { RunTextEditorInput, RunTextEditorOutput } from "../types/io";
import { renderTextOnCanvas } from "../steps/renderTextOnCanvas";
import { applyFontConfig } from "../steps/applyFontConfig";

export const runTextEditor: CoreFn<RunTextEditorInput, RunTextEditorOutput> = async (
  input,
  ctx
) => {
  const logger = ctx?.adapters?.logger;
  const { backgroundImage, lines, globalFontConfig } = input;

  logger?.info?.("[TextEditor] 开始处理", lines.length, "行文字");

  // Step 1: 为每行应用字体配置
  const processedLines = lines.map((line) =>
    applyFontConfig(line, globalFontConfig)
  );

  // Step 2: 在 Canvas 上渲染文字
  const renderedImage = await renderTextOnCanvas(
    { backgroundImage, lines: processedLines },
    ctx
  );

  logger?.info?.("[TextEditor] 渲染完成");

  return {
    renderedImage,
    processedLines,
  };
};

