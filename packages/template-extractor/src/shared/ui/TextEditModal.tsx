/**
 * 文字编辑弹窗组件
 * 
 * 用于编辑提取的模版文字
 * - 拖拽移动文字
 * - 双击编辑文字内容
 * - 调整字体、字号、颜色
 * - 支持多选批量编辑
 * - 撤销/重做
 * - 放大/缩小
 * - 导出最终图片
 * - 🔒 锁定/解锁区域
 * - ✏️ 可编辑区域绘制
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { Canvas as FabricCanvasType } from "fabric";
import { FabricCanvas, type FabricCanvasRef } from "./FabricCanvas";
import { FloatingToolbar } from "./FloatingToolbar";
import { useCanvasHistory } from "../hooks/useCanvasHistory";
import type { FontFamily } from "../lib/fontParser";
import type { 
  CanvasTextObject, 
  CanvasState,
  LineGroupInfo,
  EditorMode,
  EditableZone,
  ReplaceableZone,
} from "../types/canvasEditorTypes";
import { 
  lineGroupToCanvasTextObject,
  DEFAULT_FONT_CONFIG,
} from "../types/canvasEditorTypes";

// 从 core 导入的 CanvasTextObject 类型可能略有不同，做一个兼容类型
interface CoreCanvasTextObject {
  id: string;
  type?: string;
  text: string;
  left: number;
  top: number;
  width?: number;
  height?: number;
  fontSize: number;
  fontFamily: string;
  fill: string;
  textAlign?: string;
  fontWeight?: string;
  fontStyle?: string;
}

export interface TextEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  backgroundImage: string;
  lines: LineGroupInfo[];
  /** 直接传入的 Canvas 文字对象（优先使用） */
  initialCanvasObjects?: CoreCanvasTextObject[];
  /** 已上传的字体家族列表 */
  fontFamilies?: FontFamily[];
  /** 默认字体配置 */
  defaultFontConfig?: {
    fontFamily: string;
    fontWeight: number;
  };
  onExport: (imageDataUrl: string, canvasState: CanvasState) => void;
  isSaving?: boolean;
  savedCanvasState?: CanvasState | null;
  /** 编辑器模式：template-edit = 模版制作, template-use = 使用模版 */
  editorMode?: EditorMode;
}

export const TextEditModal: React.FC<TextEditModalProps> = ({
  isOpen,
  onClose,
  backgroundImage,
  lines,
  initialCanvasObjects,
  fontFamilies = [],
  defaultFontConfig,
  onExport,
  isSaving = false,
  savedCanvasState,
  editorMode = "template-edit",
}) => {
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvasType | null>(null);
  const [selectedObject, setSelectedObject] = useState<CanvasTextObject | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [isMultipleSelection, setIsMultipleSelection] = useState(false);
  const [zoom, setZoom] = useState(1);
  
  // 模版编辑功能状态
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [editableZones, setEditableZones] = useState<EditableZone[]>(
    savedCanvasState?.editableZones || []
  );
  
  // 可替换区域状态（图片占位）
  const [isDrawingReplaceableZone, setIsDrawingReplaceableZone] = useState(false);
  const [replaceableZones, setReplaceableZones] = useState<ReplaceableZone[]>(
    savedCanvasState?.replaceableZones || []
  );
  
  const fabricCanvasRef = useRef<FabricCanvasRef>(null);
  
  const [globalFont] = useState({
    fontFamily: defaultFontConfig?.fontFamily || DEFAULT_FONT_CONFIG.fontFamily,
    fontWeight: String(defaultFontConfig?.fontWeight) || DEFAULT_FONT_CONFIG.fontWeight,
    fontStyle: DEFAULT_FONT_CONFIG.fontStyle as "normal" | "italic",
    fontSize: 24,
  });
  
  const {
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    initHistory,
    saveState,
    undo,
    redo,
    clearHistory,
  } = useCanvasHistory(fabricCanvas);
  
  // 转换为 Canvas 文字对象
  // 优先级：savedCanvasState > initialCanvasObjects > lines
  const canvasTextObjects = useMemo(() => {
    // 1. 如果有保存的 canvas 状态，使用它（继续编辑）
    if (savedCanvasState?.textObjects && savedCanvasState.textObjects.length > 0) {
      console.log("[TextEditModal] 使用保存的 canvas 状态:", savedCanvasState.textObjects.length, "个文字对象");
      return savedCanvasState.textObjects;
    }
    
    // 2. 如果有直接传入的 canvas 对象（来自 image-diff-tool）
    if (initialCanvasObjects && initialCanvasObjects.length > 0) {
      console.log("[TextEditModal] 使用传入的 canvas 对象:", initialCanvasObjects.length, "个");
      return initialCanvasObjects.map((obj, idx) => ({
        id: obj.id || `text-${idx}`,
        text: obj.text || `文字 ${idx + 1}`,
        left: obj.left || 0,
        top: obj.top || 0,
        width: obj.width,
        height: obj.height,
        fontFamily: obj.fontFamily || globalFont.fontFamily,
        fontWeight: obj.fontWeight || globalFont.fontWeight,
        fontStyle: (obj.fontStyle as "normal" | "italic") || DEFAULT_FONT_CONFIG.fontStyle,
        fontSize: obj.fontSize || 24,
        fill: obj.fill || "#FFFFFF",
        isOriginal: true,
        originalLineIndex: idx,
      }));
    }
    
    // 3. 从 lines 创建
    if (lines && lines.length > 0) {
      console.log("[TextEditModal] 从 lines 创建文字对象:", lines.length, "行");
      return lines.map((line) => lineGroupToCanvasTextObject(line));
    }
    
    return [];
  }, [lines, initialCanvasObjects, savedCanvasState, globalFont]);
  
  const handleCanvasReady = useCallback((canvas: FabricCanvasType) => {
    setFabricCanvas(canvas);
  }, []);
  
  // 多选状态变化
  const handleMultipleSelectionChange = useCallback((count: number, isMultiple: boolean) => {
    setSelectedCount(count);
    setIsMultipleSelection(isMultiple);
  }, []);
  
  // 初始化历史
  useEffect(() => {
    if (fabricCanvas && canvasTextObjects.length > 0) {
      const timer = setTimeout(() => {
        initHistory();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [fabricCanvas, canvasTextObjects, initHistory]);
  
  // 缩放控制 (1% - 300%)
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      if (prev < 0.1) return Math.min(prev + 0.01, 3);
      if (prev < 0.5) return Math.min(prev + 0.05, 3);
      return Math.min(prev + 0.1, 3);
    });
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      if (prev <= 0.1) return Math.max(prev - 0.01, 0.01);
      if (prev <= 0.5) return Math.max(prev - 0.05, 0.01);
      return Math.max(prev - 0.1, 0.01);
    });
  }, []);
  
  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);
  
  const handleZoomFit = useCallback(() => {
    setZoom(0.3);
  }, []);
  
  // 修改选中对象的样式（支持多选）
  const handleStyleChange = useCallback(
    (property: string, value: string | number) => {
      if (!fabricCanvasRef.current) return;
      
      fabricCanvasRef.current.applyStyleToSelection({
        [property]: value,
      });
      
      // 更新选中对象的显示
      if (selectedObject) {
        setSelectedObject((prev) =>
          prev ? { ...prev, [property]: value } : null
        );
      }
    },
    [selectedObject]
  );
  
  // 删除选中对象（支持多选）
  const handleDeleteObject = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.deleteSelection();
    setSelectedObject(null);
    setSelectedCount(0);
    setIsMultipleSelection(false);
  }, []);
  
  // 导出 Canvas 图片和状态
  const handleExport = useCallback(() => {
    if (!fabricCanvas) return;
    
    // 🔑 导出前临时隐藏可编辑区域矩形（绿色区域）和可替换区域矩形（紫色区域）
    const hiddenRects: any[] = [];
    fabricCanvas.getObjects().forEach((obj) => {
      if ((obj as any).isEditableZone || (obj as any).isReplaceableZone) {
        hiddenRects.push(obj);
        obj.set("visible", false);
      }
    });
    fabricCanvas.renderAll();
    
    const dataUrl = fabricCanvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1,
    });
    
    // 🔑 导出后恢复区域矩形的可见性
    hiddenRects.forEach((obj) => {
      obj.set("visible", true);
    });
    fabricCanvas.renderAll();
    
    const textObjects: CanvasTextObject[] = [];
    fabricCanvas.getObjects().forEach((obj) => {
      if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
        const textObj = obj as any;
        textObjects.push({
          id: textObj.id || `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: textObj.text || '',
          left: textObj.left || 0,
          top: textObj.top || 0,
          width: textObj.width,
          height: textObj.height,
          fontFamily: textObj.fontFamily || 'Arial',
          fontWeight: textObj.fontWeight || 'normal',
          fontStyle: textObj.fontStyle || 'normal',
          fontSize: textObj.fontSize || 24,
          fill: textObj.fill || '#000000',
          isOriginal: textObj.isOriginal,
          originalLineIndex: textObj.originalLineIndex,
          editableMode: textObj.editableMode,
        });
      }
    });
    
    const canvasState: CanvasState = {
      textObjects,
      editableZones,
      replaceableZones,
      savedAt: Date.now(),
    };
    
    onExport(dataUrl, canvasState);
  }, [fabricCanvas, onExport, editableZones, replaceableZones]);
  
  // ===== 模版编辑功能回调 =====
  
  // 获取选中对象是否锁定
  const isSelectionLocked = useMemo(() => {
    return fabricCanvasRef.current?.isSelectionLocked() || false;
  }, [selectedObject]);
  
  // 锁定/解锁选中对象
  const handleToggleLock = useCallback(() => {
    fabricCanvasRef.current?.toggleLock();
    // 触发重新获取选中状态
    setSelectedObject((prev) => prev ? { ...prev } : null);
  }, []);
  
  // 开始/结束绘制可编辑区域
  const handleToggleDrawZone = useCallback(() => {
    setIsDrawingZone((prev) => !prev);
  }, []);
  
  // 绘制可编辑区域完成
  const handleDrawZoneComplete = useCallback((zone: EditableZone) => {
    setEditableZones((prev) => [...prev, zone]);
    setIsDrawingZone(false);
  }, []);
  
  // 删除可编辑区域
  const handleEditableZoneRemove = useCallback((zoneId: string) => {
    setEditableZones((prev) => prev.filter((zone) => zone.id !== zoneId));
  }, []);

  // 更新可编辑区域（移动/缩放）
  const handleEditableZoneUpdate = useCallback((updatedZone: EditableZone) => {
    setEditableZones((prev) => 
      prev.map((zone) => zone.id === updatedZone.id ? updatedZone : zone)
    );
  }, []);

  // ===== 可替换区域处理 =====
  // 开始/结束绘制可替换区域
  const handleToggleDrawReplaceableZone = useCallback(() => {
    setIsDrawingReplaceableZone((prev) => !prev);
  }, []);

  // 绘制可替换区域完成
  const handleDrawReplaceableZoneComplete = useCallback((zone: ReplaceableZone) => {
    setReplaceableZones((prev) => [...prev, zone]);
    setIsDrawingReplaceableZone(false);
  }, []);

  // 删除可替换区域
  const handleReplaceableZoneRemove = useCallback((zoneId: string) => {
    setReplaceableZones((prev) => prev.filter((zone) => zone.id !== zoneId));
  }, []);

  // 更新可替换区域（移动/缩放）
  const handleReplaceableZoneUpdate = useCallback((updatedZone: ReplaceableZone) => {
    setReplaceableZones((prev) =>
      prev.map((zone) => zone.id === updatedZone.id ? updatedZone : zone)
    );
  }, []);

  // 处理图片上传（使用模版模式）
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricCanvas) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      
      // 动态导入 fabric 来创建图片
      import("fabric").then(({ FabricImage, Rect }) => {
        FabricImage.fromURL(imgUrl).then((img) => {
          if (!img || replaceableZones.length === 0) {
            console.warn("[TextEditModal] 无法创建图片或没有可替换区域");
            return;
          }

          // 使用第一个可替换区域
          const zone = replaceableZones[0];

          // 创建裁剪路径
          const clipRect = new Rect({
            left: zone.x,
            top: zone.y,
            width: zone.width,
            height: zone.height,
            absolutePositioned: true,
          });

          // 计算缩放比例，使图片覆盖整个区域
          const scaleX = zone.width / (img.width || 1);
          const scaleY = zone.height / (img.height || 1);
          const scale = Math.max(scaleX, scaleY);

          img.set({
            left: zone.x,
            top: zone.y,
            scaleX: scale,
            scaleY: scale,
            clipPath: clipRect,
            // 自定义属性
            selectable: true,
            evented: true,
            hasControls: true,
            hasBorders: true,
            lockRotation: false,
            cornerColor: "#a855f7",
            cornerSize: 10,
            transparentCorners: false,
          } as any);

          // 添加自定义标记
          (img as any).isReplaceableImage = true;
          (img as any).containingZoneId = zone.id;

          fabricCanvas.add(img);
          // 将图片移到底层（在可替换区域之上，在其他内容之下）
          // 找到可替换区域的位置，将图片放在其上方
          const zoneRect = fabricCanvas.getObjects().find(
            (obj) => (obj as any).isReplaceableZone && (obj as any).zoneId === zone.id
          );
          if (zoneRect) {
            const zoneIndex = fabricCanvas.getObjects().indexOf(zoneRect);
            fabricCanvas.moveTo(img, zoneIndex + 1);
          }
          
          fabricCanvas.setActiveObject(img);
          fabricCanvas.renderAll();
        });
      });
    };
    reader.readAsDataURL(file);

    // 清空 input 以允许重复上传同一文件
    e.target.value = "";
  }, [fabricCanvas, replaceableZones]);
  
  // 键盘快捷键
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.ctrlKey && e.shiftKey && e.key === "z") ||
        (e.ctrlKey && e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
      
      // 缩放快捷键
      if (e.ctrlKey && e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      }
      if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      }
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, undo, redo, onClose, handleZoomIn, handleZoomOut, handleZoomReset]);
  
  // 关闭时清理
  const handleClose = useCallback(() => {
    clearHistory();
    setSelectedObject(null);
    setSelectedCount(0);
    setIsMultipleSelection(false);
    setZoom(1);
    onClose();
  }, [clearHistory, onClose]);
  
  if (!isOpen) return null;
  
  const modalContent = (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 px-4 py-3 bg-slate-900 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            {editorMode === "template-edit" ? "✏️ 编辑模版" : "📋 使用模版"}
          </h2>
          {editorMode === "template-edit" && (
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded">
              制作模式
            </span>
          )}
          {editorMode === "template-use" && (
            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 text-xs rounded">
              使用模式
            </span>
          )}
          <span className="text-sm text-gray-400">
            {canvasTextObjects.length} 个文字对象
          </span>
          {fontFamilies.length > 0 && (
            <span className="text-sm text-indigo-400">
              • {fontFamilies.length} 个自定义字体
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* 缩放控制 */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={handleZoomOut}
              className="w-8 h-8 rounded flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              title="缩小 (Ctrl+-)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="w-16 text-center text-sm text-white font-medium">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="w-8 h-8 rounded flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              title="放大 (Ctrl+=)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={handleZoomReset}
              className="px-2 h-8 rounded text-xs text-white hover:bg-white/10 transition-colors"
              title="重置 (Ctrl+0)"
            >
              100%
            </button>
            <button
              onClick={handleZoomFit}
              className="px-2 h-8 rounded text-xs text-white hover:bg-white/10 transition-colors"
              title="适应窗口"
            >
              适应
            </button>
          </div>
          
          <div className="w-px h-6 bg-white/20" />
          
          {/* 撤销/重做 */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="px-3 py-1.5 text-sm rounded border border-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
            title="撤销 (Ctrl+Z)"
          >
            ↩ {undoCount > 0 && `(${undoCount})`}
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="px-3 py-1.5 text-sm rounded border border-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
            title="重做 (Ctrl+Shift+Z)"
          >
            ↪ {redoCount > 0 && `(${redoCount})`}
          </button>
          
          <div className="w-px h-6 bg-white/20" />
          
          {/* 添加图片按钮 - 仅在使用模版模式且有可替换区域时显示 */}
          {editorMode === "template-use" && replaceableZones.length > 0 && (
            <label className="px-4 py-1.5 text-sm rounded bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white cursor-pointer transition-colors flex items-center gap-2">
              📷 添加图片
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </label>
          )}
          
          {/* 导出/下载按钮 - 根据模式显示不同文字 */}
          <button
            onClick={handleExport}
            disabled={!fabricCanvas || isSaving}
            className={`px-4 py-1.5 text-sm rounded text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ${
              editorMode === "template-use"
                ? "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
            }`}
          >
            {isSaving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {editorMode === "template-use" ? "下载中..." : "保存中..."}
              </>
            ) : editorMode === "template-use" ? (
              <>📥 下载图片</>
            ) : (
              <>💾 保存</>
            )}
          </button>
          
          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            title="关闭 (ESC)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* 浮动工具栏（始终显示，未选中时禁用） */}
      <div className="flex-shrink-0 px-4 py-2 bg-slate-800 border-b border-white/10">
        <FloatingToolbar
          selectedObject={selectedObject}
          selectedCount={selectedCount}
          isMultipleSelection={isMultipleSelection}
          fontFamilies={fontFamilies}
          onFontFamilyChange={(v) => handleStyleChange("fontFamily", v)}
          onFontWeightChange={(v) => handleStyleChange("fontWeight", v)}
          onFontStyleChange={(v) => handleStyleChange("fontStyle", v)}
          onFontSizeChange={(v) => handleStyleChange("fontSize", v)}
          onFillChange={(v) => handleStyleChange("fill", v)}
          onDelete={handleDeleteObject}
          onAlign={(type) => fabricCanvasRef.current?.alignSelection(type)}
          onDistributeVertically={() => fabricCanvasRef.current?.distributeVertically()}
          // 模版编辑功能
          editorMode={editorMode}
          isLocked={isSelectionLocked}
          onToggleLock={handleToggleLock}
          isDrawingZone={isDrawingZone}
          onToggleDrawZone={handleToggleDrawZone}
          isDrawingReplaceableZone={isDrawingReplaceableZone}
          onToggleDrawReplaceableZone={handleToggleDrawReplaceableZone}
        />
      </div>
      
      {/* Canvas 编辑区 - 全屏，可滚动查看完整图片，缩放时居中 */}
      <div className="flex-1 overflow-auto bg-slate-900/50 p-4 flex items-center justify-center">
        {backgroundImage && canvasTextObjects.length > 0 ? (
          <div 
            className="min-w-max min-h-max"
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out',
            }}
          >
            <FabricCanvas
              ref={fabricCanvasRef}
              backgroundImage={backgroundImage}
              initialTextObjects={canvasTextObjects}
              globalFontConfig={globalFont}
              onSelectionChange={setSelectedObject}
              onMultipleSelectionChange={handleMultipleSelectionChange}
              onCanvasReady={handleCanvasReady}
              onStateChange={saveState}
              // 模版编辑功能
              editorMode={editorMode}
              editableZones={editableZones}
              isDrawingZone={isDrawingZone}
              onDrawZoneComplete={handleDrawZoneComplete}
              onEditableZoneRemove={handleEditableZoneRemove}
              onEditableZoneUpdate={handleEditableZoneUpdate}
              // 可替换区域功能
              replaceableZones={replaceableZones}
              isDrawingReplaceableZone={isDrawingReplaceableZone}
              onDrawReplaceableZoneComplete={handleDrawReplaceableZoneComplete}
              onReplaceableZoneRemove={handleReplaceableZoneRemove}
              onReplaceableZoneUpdate={handleReplaceableZoneUpdate}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg">正在加载编辑器...</p>
              <p className="text-sm mt-2 text-gray-500">
                {!backgroundImage && "等待背景图加载"}
                {backgroundImage && canvasTextObjects.length === 0 && "未检测到文字区域"}
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* 底部状态栏 */}
      <div className="flex-shrink-0 px-4 py-2 bg-slate-900 border-t border-white/10 flex items-center justify-between text-xs text-gray-500">
        <div>
          {isDrawingZone ? (
            <span className="text-editable-zone">
              🖱️ 正在划定可编辑区域：按住鼠标拖动绘制矩形，松开完成
            </span>
          ) : isDrawingReplaceableZone ? (
            <span className="text-replaceable-zone">
              🖱️ 正在划定可替换区域：按住鼠标拖动绘制矩形，松开完成（用于放置图片）
            </span>
          ) : (
            <>💡 双击编辑 | 拖拽移动 | 框选多个后按 Delete 批量删除 | Ctrl+Z 撤销 | Ctrl+=/- 缩放</>
          )}
        </div>
        <div className="flex items-center gap-3">
          {editableZones.length > 0 && (
            <span className="text-editable-zone">
              ✏️ {editableZones.length} 个可编辑区域
            </span>
          )}
          {replaceableZones.length > 0 && (
            <span className="text-replaceable-zone">
              🖼️ {replaceableZones.length} 个可替换区域
            </span>
          )}
          <span>缩放: {Math.round(zoom * 100)}%</span>
          {isMultipleSelection && <span>已选中 {selectedCount} 个对象</span>}
        </div>
      </div>
    </div>
  );
  
  return createPortal(modalContent, document.body);
};
