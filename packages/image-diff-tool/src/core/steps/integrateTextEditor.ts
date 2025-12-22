/**
 * 集成文字编辑器子项目
 * 
 * 将 image-diff-tool 的 LineGroupInfo 转换为 text-editor-module 的 EditableLine，
 * 并调用子项目的 runTextEditor 函数进行渲染。
 */

// 导入子项目的能力
import {
  runTextEditor,
  type RunTextEditorInput,
  type RunTextEditorOutput,
  type EditableLine,
  type FontConfig,
  type CanvasTextObject,
  type CanvasHistoryState,
  DEFAULT_FONT_CONFIG,
  createInitialHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  lineToCanvasTextObject,
} from "@internal/text-editor-module";

import type { LineGroupInfo } from "../types/io";
import type { CoreContext } from "../types/context";

/**
 * 将 LineGroupInfo 转换为 EditableLine
 */
export function linesToEditableLines(lines: LineGroupInfo[]): EditableLine[] {
  return lines.map((line) => ({
    lineIndex: line.lineIndex,
    originalText: line.recognizedText || "",
    editedText: "", // 初始为空，使用 originalText
    boundingBox: line.boundingBox,
    contentColor: line.contentColor || [0, 0, 0],
  }));
}

/**
 * 集成文字编辑器能力
 * 
 * @param backgroundImage 背景图 dataUrl（原图 Before）
 * @param editableLines 可编辑的行数据
 * @param globalFontConfig 全局字体配置
 * @param ctx 上下文
 */
export async function integrateTextEditor(
  backgroundImage: string,
  editableLines: EditableLine[],
  globalFontConfig?: Partial<FontConfig>,
  ctx?: CoreContext
): Promise<RunTextEditorOutput> {
  const logger = ctx?.adapters?.logger;
  logger?.info?.("[IntegrateTextEditor] 调用子项目渲染", editableLines.length, "行");

  return runTextEditor(
    {
      backgroundImage,
      lines: editableLines,
      globalFontConfig,
    },
    ctx
  );
}

/**
 * 将 LineGroupInfo 转换为 CanvasTextObject
 */
export function linesToCanvasTextObjects(
  lines: LineGroupInfo[],
  globalFontConfig?: Partial<FontConfig>
): CanvasTextObject[] {
  return lines.map((line) => {
    const editableLine: EditableLine = {
      lineIndex: line.lineIndex,
      originalText: line.recognizedText || "",
      editedText: "",
      boundingBox: line.boundingBox,
      contentColor: line.contentColor || [0, 0, 0],
    };
    return lineToCanvasTextObject(editableLine, globalFontConfig);
  });
}

// 重新导出类型供 UI 层使用
export type {
  EditableLine,
  FontConfig,
  RunTextEditorInput,
  RunTextEditorOutput,
  CanvasTextObject,
  CanvasHistoryState,
};
export {
  DEFAULT_FONT_CONFIG,
  createInitialHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  lineToCanvasTextObject,
};

