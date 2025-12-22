/**
 * Canvas 编辑器类型定义
 * 
 * 从 image-diff-tool/text-editor-module 复制，用于 Marriott 项目的文字编辑功能
 */

/**
 * RGB 颜色类型
 */
export type RGBColor = [number, number, number];

/**
 * 边界框
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 字体配置
 */
export interface FontConfig {
  /** 字体族：'Arial', 'SimHei', 'Microsoft YaHei' 等 */
  fontFamily: string;
  /** 字重：'normal' | 'bold' | '100'-'900' */
  fontWeight: string;
  /** 字体样式：'normal' | 'italic' */
  fontStyle: "normal" | "italic";
  /** 字间距（像素） */
  letterSpacing: number;
  /** 字号缩放比例（相对于自动计算的字号，1.0 = 100%） */
  fontSizeScale: number;
}

/**
 * 默认字体配置
 */
export const DEFAULT_FONT_CONFIG: FontConfig = {
  fontFamily: "Microsoft YaHei",
  fontWeight: "bold",
  fontStyle: "normal",
  letterSpacing: 0,
  fontSizeScale: 1.0,
};

/**
 * 可编辑的行数据
 */
export interface EditableLine {
  /** 行索引 */
  lineIndex: number;
  /** 原始 OCR 识别的文字 */
  originalText: string;
  /** 用户编辑后的文字（为空则使用 originalText） */
  editedText: string;
  /** 边界框位置 */
  boundingBox: BoundingBox;
  /** 该行的主色调（RGB） */
  contentColor: RGBColor;
  /** 该行的字体配置（可覆盖全局配置） */
  fontConfig?: Partial<FontConfig>;
}

/**
 * Canvas 文字对象
 */
export interface CanvasTextObject {
  /** 唯一标识 */
  id: string;
  /** 文字内容 */
  text: string;
  /** X 坐标 */
  left: number;
  /** Y 坐标 */
  top: number;
  /** 宽度 */
  width?: number;
  /** 高度 */
  height?: number;
  /** 字体族 */
  fontFamily: string;
  /** 字重 */
  fontWeight: string;
  /** 字体样式 */
  fontStyle: "normal" | "italic";
  /** 字号 */
  fontSize: number;
  /** 填充颜色 */
  fill: string;
  /** 是否为原始 OCR 行 */
  isOriginal?: boolean;
  /** 原始行索引 */
  originalLineIndex?: number;
}

/**
 * 画布历史状态
 */
export interface CanvasHistoryState {
  /** 历史状态栈（可撤销的） */
  past: string[];
  /** 当前状态（Canvas JSON） */
  present: string;
  /** 重做状态栈 */
  future: string[];
}

/**
 * 创建初始历史状态
 */
export function createInitialHistory(initialState: string): CanvasHistoryState {
  return {
    past: [],
    present: initialState,
    future: [],
  };
}

/**
 * 保存新状态到历史（纯函数）
 */
export function pushHistory(
  history: CanvasHistoryState,
  newState: string
): CanvasHistoryState {
  return {
    past: [...history.past, history.present],
    present: newState,
    future: [], // 新操作清空重做栈
  };
}

/**
 * 撤销（纯函数）
 */
export function undoHistory(
  history: CanvasHistoryState
): CanvasHistoryState | null {
  if (history.past.length === 0) return null;

  const newPast = [...history.past];
  const previousState = newPast.pop()!;

  return {
    past: newPast,
    present: previousState,
    future: [history.present, ...history.future],
  };
}

/**
 * 重做（纯函数）
 */
export function redoHistory(
  history: CanvasHistoryState
): CanvasHistoryState | null {
  if (history.future.length === 0) return null;

  const [nextState, ...restFuture] = history.future;

  return {
    past: [...history.past, history.present],
    present: nextState,
    future: restFuture,
  };
}

/**
 * 将 EditableLine 转换为 CanvasTextObject
 */
export function lineToCanvasTextObject(
  line: EditableLine,
  globalFontConfig?: Partial<FontConfig>
): CanvasTextObject {
  const config: FontConfig = {
    ...DEFAULT_FONT_CONFIG,
    ...(globalFontConfig || {}),
    ...(line.fontConfig || {}),
  };

  const fontSize = Math.round(line.boundingBox.height * 0.85 * config.fontSizeScale);
  const [r, g, b] = line.contentColor;

  return {
    id: `line-${line.lineIndex}`,
    text: line.editedText || line.originalText,
    left: line.boundingBox.x,
    top: line.boundingBox.y,
    width: line.boundingBox.width,
    height: line.boundingBox.height,
    fontFamily: config.fontFamily,
    fontWeight: config.fontWeight,
    fontStyle: config.fontStyle,
    fontSize,
    fill: `rgb(${r}, ${g}, ${b})`,
    isOriginal: true,
    originalLineIndex: line.lineIndex,
  };
}
