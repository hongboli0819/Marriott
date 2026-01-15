/**
 * Canvas 编辑器类型定义
 */

/**
 * RGB 颜色类型
 */
export type RGBColor = [number, number, number];

/**
 * 区域编辑模式
 * - default: 默认，使用模版时只能改文字内容
 * - locked: 锁定，使用模版时完全不可编辑
 * - editable-zone: 可编辑区域内的对象，使用模版时可完全自由编辑
 */
export type EditableMode = "default" | "locked" | "editable-zone";

/**
 * 编辑器模式
 * - template-edit: 模版制作模式，可定义区域
 * - template-use: 模版使用模式，根据定义限制编辑
 */
export type EditorMode = "template-edit" | "template-use";

/**
 * 可编辑区域（矩形区域）
 */
export interface EditableZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 可替换区域（用于图片占位）
 */
export interface ReplaceableZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  fontFamily: string;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  letterSpacing: number;
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
  lineIndex: number;
  originalText: string;
  editedText: string;
  boundingBox: BoundingBox;
  contentColor: RGBColor;
  fontConfig?: Partial<FontConfig>;
}

/**
 * 行分组信息（来自 image-diff-tool）
 */
export interface LineGroupInfo {
  lineIndex: number;
  regionIds?: number[];
  boundingBox: BoundingBox;
  recognizedText?: string;
  confidence?: number;
  lineColor?: RGBColor;
  contentColor?: RGBColor;
  linePreviewImage?: string;
}

/**
 * Canvas 文字对象
 */
export interface CanvasTextObject {
  id: string;
  text: string;
  left: number;
  top: number;
  width?: number;
  height?: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  fontSize: number;
  fill: string;
  isOriginal?: boolean;
  originalLineIndex?: number;
  /** 编辑模式：default | locked | editable-zone */
  editableMode?: EditableMode;
  /** 
   * 是否只能改文字（使用模版模式下，default 模式的对象）
   * 此标记用于告知工具栏禁用样式修改
   */
  isTextOnlyEditable?: boolean;
}

/**
 * 画布历史状态
 */
export interface CanvasHistoryState {
  past: string[];
  present: string;
  future: string[];
}

/**
 * Canvas 状态（用于保存和恢复编辑）
 */
export interface CanvasState {
  textObjects: CanvasTextObject[];
  /** 可编辑区域列表 */
  editableZones?: EditableZone[];
  /** 可替换区域列表（图片占位） */
  replaceableZones?: ReplaceableZone[];
  savedAt: number;
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
 * 保存新状态到历史
 */
export function pushHistory(
  history: CanvasHistoryState,
  newState: string
): CanvasHistoryState {
  return {
    past: [...history.past, history.present],
    present: newState,
    future: [],
  };
}

/**
 * 撤销
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
 * 重做
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

/**
 * 将 LineGroupInfo 转换为 CanvasTextObject
 */
export function lineGroupToCanvasTextObject(
  line: LineGroupInfo,
  globalFontConfig?: Partial<FontConfig>
): CanvasTextObject {
  const editableLine: EditableLine = {
    lineIndex: line.lineIndex,
    originalText: line.recognizedText || "",
    editedText: "",
    boundingBox: line.boundingBox,
    contentColor: line.contentColor || [0, 0, 0],
  };
  return lineToCanvasTextObject(editableLine, globalFontConfig);
}


