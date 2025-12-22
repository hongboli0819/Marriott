/**
 * 浮动工具栏组件
 * 
 * 从 image-diff-tool 复制，用于 Marriott 项目的文字编辑功能
 * 
 * 选中文字对象时显示，提供字体、样式等编辑功能
 */

import React from "react";
import type { CanvasTextObject } from "@/shared/types/canvasEditorTypes";

export interface FloatingToolbarProps {
  /** 选中的文字对象 */
  selectedObject: CanvasTextObject | null;
  /** 修改字体 */
  onFontFamilyChange: (fontFamily: string) => void;
  /** 修改字重 */
  onFontWeightChange: (fontWeight: string) => void;
  /** 修改字体样式 */
  onFontStyleChange: (fontStyle: "normal" | "italic") => void;
  /** 修改字号 */
  onFontSizeChange: (fontSize: number) => void;
  /** 修改颜色 */
  onFillChange: (fill: string) => void;
  /** 删除对象 */
  onDelete: () => void;
}

/**
 * RGB 字符串转 HEX
 */
function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return "#000000";

  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  selectedObject,
  onFontFamilyChange,
  onFontWeightChange,
  onFontStyleChange,
  onFontSizeChange,
  onFillChange,
  onDelete,
}) => {
  if (!selectedObject) return null;

  const isBold = selectedObject.fontWeight === "bold" || Number(selectedObject.fontWeight) >= 700;
  const isItalic = selectedObject.fontStyle === "italic";

  return (
    <div className="flex items-center gap-2 p-3 bg-background border border-border rounded-lg shadow-lg flex-wrap">
      {/* 字体选择 */}
      <select
        value={selectedObject.fontFamily}
        onChange={(e) => onFontFamilyChange(e.target.value)}
        className="w-32 h-9 px-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="Microsoft YaHei">微软雅黑</option>
        <option value="SimHei">黑体</option>
        <option value="SimSun">宋体</option>
        <option value="KaiTi">楷体</option>
        <option value="Arial">Arial</option>
        <option value="Times New Roman">Times</option>
      </select>

      {/* 字号 */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={selectedObject.fontSize}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
          className="w-16 h-9 px-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          min={8}
          max={200}
        />
        <span className="text-xs text-muted-foreground">px</span>
      </div>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-border" />

      {/* 粗体 */}
      <button
        onClick={() => onFontWeightChange(isBold ? "normal" : "bold")}
        className={`w-9 h-9 rounded-md border font-bold transition-colors ${
          isBold 
            ? "bg-marriott-600 text-white border-marriott-600" 
            : "bg-background border-border hover:bg-muted"
        }`}
        title="粗体"
      >
        B
      </button>

      {/* 斜体 */}
      <button
        onClick={() => onFontStyleChange(isItalic ? "normal" : "italic")}
        className={`w-9 h-9 rounded-md border italic transition-colors ${
          isItalic 
            ? "bg-marriott-600 text-white border-marriott-600" 
            : "bg-background border-border hover:bg-muted"
        }`}
        title="斜体"
      >
        I
      </button>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-border" />

      {/* 颜色选择器 */}
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={selectedObject.fill.startsWith("rgb") ? rgbToHex(selectedObject.fill) : selectedObject.fill}
          onChange={(e) => onFillChange(e.target.value)}
          className="w-9 h-9 rounded border border-border cursor-pointer"
          title="文字颜色"
        />
      </div>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-border" />

      {/* 删除按钮 */}
      <button
        onClick={onDelete}
        className="h-9 px-3 rounded-md border border-border text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1"
        title="删除"
      >
        🗑️ 删除
      </button>

      {/* 对象信息 */}
      <div className="text-xs text-muted-foreground ml-auto">
        位置: ({Math.round(selectedObject.left)}, {Math.round(selectedObject.top)})
        {selectedObject.isOriginal && (
          <span className="ml-2 text-marriott-600">
            [识别行{(selectedObject.originalLineIndex || 0) + 1}]
          </span>
        )}
      </div>
    </div>
  );
};
