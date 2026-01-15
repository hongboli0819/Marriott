/**
 * 浮动工具栏组件
 * 支持单选和多选编辑，提供字体、样式等编辑功能
 * 始终显示，没有选中对象时禁用
 * 
 * 🔒 支持模版编辑功能：锁定/解锁、可编辑区域绘制
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { CanvasTextObject, EditorMode } from "../types/canvasEditorTypes";
import type { FontFamily } from "../lib/fontParser";
import { weightToName } from "../lib/fontParser";
import type { AlignType } from "./FabricCanvas";

export interface FloatingToolbarProps {
  /** 选中的对象（单选） */
  selectedObject: CanvasTextObject | null;
  /** 选中的对象数量（多选时 > 1） */
  selectedCount: number;
  /** 是否多选模式 */
  isMultipleSelection: boolean;
  /** 已上传的字体家族列表 */
  fontFamilies: FontFamily[];
  /** 字体家族变化 */
  onFontFamilyChange: (fontFamily: string) => void;
  /** 字重变化 */
  onFontWeightChange: (fontWeight: string) => void;
  /** 字体样式变化 */
  onFontStyleChange: (fontStyle: "normal" | "italic") => void;
  /** 字号变化 */
  onFontSizeChange: (fontSize: number) => void;
  /** 颜色变化 */
  onFillChange: (fill: string) => void;
  /** 删除 */
  onDelete: () => void;
  /** 对齐（仅多选时可用） */
  onAlign?: (type: AlignType) => void;
  /** 均分垂直间距（仅多选时可用） */
  onDistributeVertically?: () => void;
  
  // ===== 模版编辑功能 =====
  /** 编辑器模式 */
  editorMode?: EditorMode;
  /** 选中对象是否锁定 */
  isLocked?: boolean;
  /** 锁定/解锁回调 */
  onToggleLock?: () => void;
  /** 是否正在绘制可编辑区域 */
  isDrawingZone?: boolean;
  /** 开始/结束绘制可编辑区域 */
  onToggleDrawZone?: () => void;
  /** 是否正在绘制可替换区域 */
  isDrawingReplaceableZone?: boolean;
  /** 开始/结束绘制可替换区域 */
  onToggleDrawReplaceableZone?: () => void;
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

/**
 * 默认字体列表（当没有上传自定义字体时使用）
 */
const DEFAULT_FONTS = [
  { name: "Microsoft YaHei", displayName: "微软雅黑" },
  { name: "SimHei", displayName: "黑体" },
  { name: "SimSun", displayName: "宋体" },
  { name: "KaiTi", displayName: "楷体" },
  { name: "Arial", displayName: "Arial" },
  { name: "Times New Roman", displayName: "Times" },
];

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  selectedObject,
  selectedCount,
  isMultipleSelection,
  fontFamilies,
  onFontFamilyChange,
  onFontWeightChange,
  onFontStyleChange,
  onFontSizeChange,
  onFillChange,
  onDelete,
  onAlign,
  onDistributeVertically,
  // 模版编辑功能
  editorMode = "template-edit",
  isLocked = false,
  onToggleLock,
  isDrawingZone = false,
  onToggleDrawZone,
  isDrawingReplaceableZone = false,
  onToggleDrawReplaceableZone,
}) => {
  // 是否有选中对象
  const hasSelection = selectedObject !== null || isMultipleSelection;
  
  // 🔒 在使用模版模式下，只能改字的对象禁用样式修改
  const isTextOnlyMode = editorMode === "template-use" && selectedObject?.isTextOnlyEditable;

  // 本地字号输入状态
  const [fontSizeInput, setFontSizeInput] = useState<string>("24");
  const lastValidFontSize = useRef<number>(24);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当选中对象变化时，更新字号输入值
  useEffect(() => {
    if (selectedObject?.fontSize) {
      const fontSize = selectedObject.fontSize;
      setFontSizeInput(String(fontSize));
      lastValidFontSize.current = fontSize;
    }
  }, [selectedObject?.fontSize]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // 字号输入变化处理（带 1 秒延迟）
  const handleFontSizeInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      
      // 清除之前的定时器
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // 如果输入为空，保持显示但不应用变化
      if (value === "" || value.trim() === "") {
        setFontSizeInput(value);
        return;
      }

      const numValue = parseInt(value, 10);
      
      // 如果不是有效数字，只更新显示
      if (isNaN(numValue)) {
        setFontSizeInput(value);
        return;
      }

      // 更新显示值
      setFontSizeInput(value);

      // 只有有效范围内的数值才触发延迟更新
      if (numValue >= 8 && numValue <= 200 && hasSelection) {
        debounceTimer.current = setTimeout(() => {
          onFontSizeChange(numValue);
          lastValidFontSize.current = numValue;
        }, 1000);
      }
    },
    [hasSelection, onFontSizeChange]
  );

  // 字号输入失焦时，如果为空或无效则恢复上次有效值
  const handleFontSizeBlur = useCallback(() => {
    if (fontSizeInput === "" || fontSizeInput.trim() === "") {
      setFontSizeInput(String(lastValidFontSize.current));
      return;
    }
    
    const numValue = parseInt(fontSizeInput, 10);
    if (isNaN(numValue) || numValue < 8 || numValue > 200) {
      setFontSizeInput(String(lastValidFontSize.current));
    }
  }, [fontSizeInput]);

  // 当前字体家族
  const currentFontFamily = selectedObject?.fontFamily || "Microsoft YaHei";

  // 查找当前字体家族的可用字重
  const currentFamily = fontFamilies.find((f) => f.name === currentFontFamily);
  const availableWeights = currentFamily?.variants.map((v) => v.fontWeight) || [];

  // 判断粗体和斜体状态
  const isBold = selectedObject
    ? selectedObject.fontWeight === "bold" || Number(selectedObject.fontWeight) >= 700
    : false;
  const isItalic = selectedObject?.fontStyle === "italic";

  // 当前字重数值
  const currentWeightValue = selectedObject
    ? Number(selectedObject.fontWeight) || (isBold ? 700 : 400)
    : 400;

  // 禁用样式（无选中或使用模版模式下只能改字）
  const disabledClass = !hasSelection ? "opacity-50 cursor-not-allowed" : "";
  const styleDisabledClass = !hasSelection || isTextOnlyMode ? "opacity-50 cursor-not-allowed" : "";

  return (
    <div
      className={`flex items-center gap-2 p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg shadow-lg flex-wrap ${
        !hasSelection ? "opacity-70" : ""
      }`}
    >
      {/* 多选指示 */}
      {isMultipleSelection ? (
        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-md">
          <span className="text-sm text-indigo-300">
            ✓ 已选中 {selectedCount} 个对象
          </span>
        </div>
      ) : isTextOnlyMode ? (
        <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/20 border border-amber-400/30 rounded-md">
          <span className="text-sm text-amber-300">
            📝 只能修改文字内容
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1 bg-gray-500/20 border border-gray-400/30 rounded-md">
          <span className="text-sm text-gray-400">
            {hasSelection ? "已选中 1 个对象" : "未选中"}
          </span>
        </div>
      )}

      {/* 分隔线 */}
      <div className="w-px h-6 bg-white/20" />

      {/* 字体选择 */}
      <select
        value={currentFontFamily}
        onChange={(e) => onFontFamilyChange(e.target.value)}
        disabled={!hasSelection || isTextOnlyMode}
        className={`w-36 h-9 px-2 rounded-md border border-white/20 bg-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${styleDisabledClass}`}
        title={isTextOnlyMode ? "使用模版模式：此内容只能修改文字" : "选择字体"}
      >
        {fontFamilies.length > 0 ? (
          // 使用上传的自定义字体
          fontFamilies.map((family) => (
            <option
              key={family.id}
              value={family.name}
              className="bg-slate-800"
              style={{ fontFamily: family.name }}
            >
              {family.displayName}
            </option>
          ))
        ) : (
          // 使用默认字体
          DEFAULT_FONTS.map((font) => (
            <option key={font.name} value={font.name} className="bg-slate-800">
              {font.displayName}
            </option>
          ))
        )}
      </select>

      {/* 字重选择（仅当有上传字体时显示下拉框） */}
      {availableWeights.length > 0 ? (
        <select
          value={currentWeightValue}
          onChange={(e) => onFontWeightChange(e.target.value)}
          disabled={!hasSelection || isTextOnlyMode}
          className={`w-32 h-9 px-2 rounded-md border border-white/20 bg-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${styleDisabledClass}`}
          title={isTextOnlyMode ? "使用模版模式：此内容只能修改文字" : "选择字重"}
        >
          {availableWeights.map((weight) => (
            <option key={weight} value={weight} className="bg-slate-800">
              {weightToName(weight)} ({weight})
            </option>
          ))}
        </select>
      ) : (
        // 没有上传字体时，显示粗体切换按钮
        <button
          onClick={() => onFontWeightChange(isBold ? "normal" : "bold")}
          disabled={!hasSelection || isTextOnlyMode}
          className={`w-9 h-9 rounded-md border font-bold transition-colors ${
            isBold
              ? "bg-indigo-500 text-white border-indigo-500"
              : "bg-white/10 border-white/20 text-white hover:bg-white/20"
          } ${styleDisabledClass}`}
          title={isTextOnlyMode ? "使用模版模式：此内容只能修改文字" : "粗体"}
        >
          B
        </button>
      )}

      {/* 字号（带 1 秒延迟，输入为空时不会触发更新） */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={fontSizeInput}
          onChange={handleFontSizeInputChange}
          onBlur={handleFontSizeBlur}
          onKeyDown={(e) => {
            // 只允许数字、退格、删除、方向键
            if (
              !/[0-9]/.test(e.key) &&
              !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"].includes(e.key)
            ) {
              e.preventDefault();
            }
          }}
          disabled={!hasSelection || isTextOnlyMode}
          className={`w-16 h-9 px-2 rounded-md border border-white/20 bg-white/10 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 ${styleDisabledClass}`}
          placeholder="24"
          title={isTextOnlyMode ? "使用模版模式：此内容只能修改文字" : "字号"}
        />
        <span className="text-xs text-gray-400">px</span>
      </div>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-white/20" />

      {/* 斜体 */}
      <button
        onClick={() => onFontStyleChange(isItalic ? "normal" : "italic")}
        disabled={!hasSelection || isTextOnlyMode}
        className={`w-9 h-9 rounded-md border italic transition-colors ${
          isItalic
            ? "bg-indigo-500 text-white border-indigo-500"
            : "bg-white/10 border-white/20 text-white hover:bg-white/20"
        } ${styleDisabledClass}`}
        title={isTextOnlyMode ? "使用模版模式：此内容只能修改文字" : "斜体"}
      >
        I
      </button>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-white/20" />

      {/* 颜色选择器 */}
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={
            selectedObject?.fill
              ? selectedObject.fill.startsWith("rgb")
                ? rgbToHex(selectedObject.fill)
                : selectedObject.fill
              : "#FFFFFF"
          }
          onChange={(e) => onFillChange(e.target.value)}
          disabled={!hasSelection || isTextOnlyMode}
          className={`w-9 h-9 rounded border border-white/20 cursor-pointer ${styleDisabledClass}`}
          title={isTextOnlyMode ? "使用模版模式：此内容只能修改文字" : "文字颜色"}
        />
      </div>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-white/20" />

      {/* 对齐和分布（仅多选时可用） */}
      <>
        {/* 对齐下拉框 */}
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value && onAlign && isMultipleSelection && selectedCount >= 2) {
              onAlign(e.target.value as AlignType);
              e.target.value = ""; // 重置选择
            }
          }}
          disabled={!isMultipleSelection || selectedCount < 2}
          className={`h-9 px-2 rounded-md border border-white/20 bg-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            !isMultipleSelection || selectedCount < 2 ? "opacity-50 cursor-not-allowed" : ""
          }`}
          title="对齐方式（选中2个以上对象可用）"
        >
          <option value="" disabled className="bg-slate-800">
            📐 对齐
          </option>
          <option value="left" className="bg-slate-800">
            ⬅️ 左对齐
          </option>
          <option value="center" className="bg-slate-800">
            ↔️ 居中对齐
          </option>
          <option value="right" className="bg-slate-800">
            ➡️ 右对齐
          </option>
        </select>

        {/* 均分垂直间距按钮 */}
        <button
          onClick={onDistributeVertically}
          disabled={!isMultipleSelection || selectedCount < 3}
          className={`h-9 px-3 rounded-md border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-colors text-sm ${
            !isMultipleSelection || selectedCount < 3 ? "opacity-50 cursor-not-allowed" : ""
          }`}
          title="均分垂直间距（选中3个以上对象可用）"
        >
          ↕️ 均分间距
        </button>

        <div className="w-px h-6 bg-white/20" />
      </>

      {/* ===== 模版编辑功能（仅模版制作模式显示） ===== */}
      {editorMode === "template-edit" && (
        <>
          {/* 锁定/解锁按钮 */}
          <button
            onClick={onToggleLock}
            disabled={!hasSelection}
            className={`h-9 px-3 rounded-md border transition-colors flex items-center gap-1 ${
              isLocked
                ? "bg-locked-zone/20 border-locked-zone/50 text-locked-zone"
                : "border-white/20 bg-white/10 text-white hover:bg-white/20"
            } ${disabledClass}`}
            title={isLocked ? "点击解锁" : "点击锁定（使用模版时不可编辑）"}
          >
            {isLocked ? "🔓 解锁" : "🔒 不可改动"}
          </button>

          {/* 可编辑区域绘制按钮 */}
          <button
            onClick={onToggleDrawZone}
            disabled={isDrawingReplaceableZone}
            className={`h-9 px-3 rounded-md border transition-colors flex items-center gap-1 ${
              isDrawingZone
                ? "bg-editable-zone/20 border-editable-zone/50 text-editable-zone"
                : "border-white/20 bg-white/10 text-white hover:bg-white/20"
            } ${isDrawingReplaceableZone ? "opacity-50 cursor-not-allowed" : ""}`}
            title={isDrawingZone ? "点击取消绘制" : "点击后用鼠标划定可编辑区域"}
          >
            {isDrawingZone ? "❌ 取消划定" : "✏️ 可编辑区域"}
          </button>

          {/* 可替换区域绘制按钮 */}
          <button
            onClick={onToggleDrawReplaceableZone}
            disabled={isDrawingZone}
            className={`h-9 px-3 rounded-md border transition-colors flex items-center gap-1 ${
              isDrawingReplaceableZone
                ? "bg-replaceable-zone/20 border-replaceable-zone/50 text-replaceable-zone"
                : "border-white/20 bg-white/10 text-white hover:bg-white/20"
            } ${isDrawingZone ? "opacity-50 cursor-not-allowed" : ""}`}
            title={isDrawingReplaceableZone ? "点击取消绘制" : "点击后用鼠标划定可替换区域（用于放置图片）"}
          >
            {isDrawingReplaceableZone ? "❌ 取消划定" : "🖼️ 可替换区域"}
          </button>

          <div className="w-px h-6 bg-white/20" />
        </>
      )}

      {/* 删除按钮 */}
      <button
        onClick={onDelete}
        disabled={!hasSelection || isTextOnlyMode}
        className={`h-9 px-3 rounded-md border border-white/20 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1 ${isTextOnlyMode ? styleDisabledClass : disabledClass}`}
        title={isTextOnlyMode ? "使用模版模式：此内容不可删除" : (isMultipleSelection ? `删除 ${selectedCount} 个对象` : "删除")}
      >
        🗑️ 删除{isMultipleSelection && ` (${selectedCount})`}
      </button>

      {/* 对象信息（仅单选时显示） */}
      {!isMultipleSelection && selectedObject && (
        <div className="text-xs text-gray-400 ml-auto">
          位置: ({Math.round(selectedObject.left)}, {Math.round(selectedObject.top)})
          {selectedObject.isOriginal && (
            <span className="ml-2 text-indigo-400">
              [识别行{(selectedObject.originalLineIndex || 0) + 1}]
            </span>
          )}
        </div>
      )}

      {/* 多选提示 */}
      {isMultipleSelection && (
        <div className="text-xs text-gray-400 ml-auto">
          修改将应用到所有选中对象
        </div>
      )}
    </div>
  );
};
