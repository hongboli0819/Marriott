/**
 * @internal/template-extractor/shared
 *
 * 模版提取器 - Shared 层导出
 * 包含可复用的 UI 组件、Hooks、类型定义
 *
 * 注意：这些组件需要 React 环境才能运行
 * Core 层（纯函数）请使用 @internal/template-extractor
 */

// ============================================
// UI 组件
// ============================================

export { TextEditModal } from "./ui/TextEditModal";
export type { TextEditModalProps } from "./ui/TextEditModal";

export { FabricCanvas } from "./ui/FabricCanvas";
export type { FabricCanvasProps, FabricCanvasRef, AlignType } from "./ui/FabricCanvas";

export { FloatingToolbar } from "./ui/FloatingToolbar";
export type { FloatingToolbarProps } from "./ui/FloatingToolbar";

export { FontUploader } from "./ui/FontUploader";
export type { FontUploaderProps } from "./ui/FontUploader";

// ============================================
// Hooks
// ============================================

export { useFontStore } from "./hooks/useFontStore";
export type { FontStore, UseFontStoreReturn } from "./hooks/useFontStore";

export { useCanvasHistory } from "./hooks/useCanvasHistory";

// ============================================
// Types - Canvas Editor
// ============================================

export type {
  RGBColor,
  EditableMode,
  EditorMode,
  EditableZone,
  ReplaceableZone,
  BoundingBox,
  FontConfig,
  EditableLine,
  LineGroupInfo,
  CanvasTextObject,
  CanvasHistoryState,
  CanvasState,
} from "./types/canvasEditorTypes";

export {
  DEFAULT_FONT_CONFIG,
  createInitialHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  lineToCanvasTextObject,
  lineGroupToCanvasTextObject,
} from "./types/canvasEditorTypes";

// ============================================
// Lib - Font Parser
// ============================================

export type { FontVariant, FontFamily } from "./lib/fontParser";

export {
  isFontFile,
  parseFontFile,
  getMiddleWeight,
  weightToName,
  registerFont,
  processFontFiles,
} from "./lib/fontParser";

// ============================================
// Lib - Utils
// ============================================

export { cn } from "./lib/utils";
