/**
 * 文字编辑弹窗组件
 * 
 * 用于编辑 AI 生成的效果图上的文字
 * - 拖拽移动文字
 * - 双击编辑文字内容
 * - 调整字体、字号、颜色
 * - 撤销/重做
 * - 导出最终图片
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Canvas as FabricCanvas } from "fabric";
import { FabricCanvas as FabricCanvasComponent } from "./FabricCanvas";
import { FloatingToolbar } from "./FloatingToolbar";
import { useCanvasHistory } from "@/shared/hooks/useCanvasHistory";
import type { CanvasTextObject, LineGroupInfo } from "@/shared/types/canvasEditorTypes";
import { lineToCanvasTextObject, DEFAULT_FONT_CONFIG } from "@/shared/types/canvasEditorTypes";

/**
 * Canvas 状态（用于保存和恢复编辑）
 */
export interface CanvasState {
  /** 文字对象列表 */
  textObjects: CanvasTextObject[];
  /** 保存时间 */
  savedAt: number;
}

export interface TextEditModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 背景图 URL（原始背景图，始终使用这个） */
  backgroundImage: string;
  /** 行信息（来自 image-diff-tool 分析结果，用于首次编辑） */
  lines: LineGroupInfo[];
  /** 导出回调（返回编辑后的图片 dataUrl 和 canvas 状态） */
  onExport: (imageDataUrl: string, canvasState: CanvasState) => void;
  /** 是否正在保存 */
  isSaving?: boolean;
  /** 已保存的 canvas 状态（用于恢复上次编辑） */
  savedCanvasState?: CanvasState | null;
}

/**
 * 将 LineGroupInfo 转换为 CanvasTextObject
 */
function linesToCanvasTextObjects(lines: LineGroupInfo[]): CanvasTextObject[] {
  return lines.map((line) => {
    // 构建 EditableLine 格式
    const editableLine = {
      lineIndex: line.lineIndex,
      originalText: line.recognizedText || "",
      editedText: "",
      boundingBox: line.boundingBox,
      contentColor: line.contentColor || [0, 0, 0] as [number, number, number],
    };
    return lineToCanvasTextObject(editableLine);
  });
}

export const TextEditModal: React.FC<TextEditModalProps> = ({
  isOpen,
  onClose,
  backgroundImage,
  lines,
  onExport,
  isSaving = false,
  savedCanvasState,
}) => {
  // 始终使用原始背景图（这样文字才能保持可编辑）
  const effectiveBackgroundImage = backgroundImage;
  // Canvas 实例
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  
  // 选中的对象
  const [selectedObject, setSelectedObject] = useState<CanvasTextObject | null>(null);
  
  // 全局字体配置
  const [globalFont] = useState({
    fontFamily: DEFAULT_FONT_CONFIG.fontFamily,
    fontWeight: DEFAULT_FONT_CONFIG.fontWeight,
    fontStyle: DEFAULT_FONT_CONFIG.fontStyle as "normal" | "italic",
    fontSize: 24,
  });
  
  // 历史管理
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
  
  // 转换行数据为 Canvas 文字对象
  // 优先使用保存的状态（继续编辑），否则从 lines 创建（首次编辑）
  const canvasTextObjects = useMemo(() => {
    // 如果有保存的 canvas 状态，使用它（继续编辑）
    if (savedCanvasState?.textObjects && savedCanvasState.textObjects.length > 0) {
      console.log("[TextEditModal] 使用保存的 canvas 状态:", savedCanvasState.textObjects.length, "个文字对象");
      return savedCanvasState.textObjects;
    }
    // 否则从 lines 创建（首次编辑）
    if (!lines || lines.length === 0) return [];
    console.log("[TextEditModal] 从 lines 创建文字对象:", lines.length, "行");
    return linesToCanvasTextObjects(lines);
  }, [lines, savedCanvasState]);
  
  // Canvas 准备就绪
  const handleCanvasReady = useCallback((canvas: FabricCanvas) => {
    setFabricCanvas(canvas);
  }, []);
  
  // 初始化历史（在 canvas 和 textObjects 都准备好后）
  useEffect(() => {
    if (fabricCanvas && canvasTextObjects.length > 0) {
      const timer = setTimeout(() => {
        initHistory();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [fabricCanvas, canvasTextObjects, initHistory]);
  
  // 修改选中对象的样式
  const handleStyleChange = useCallback(
    (property: string, value: string | number) => {
      if (!fabricCanvas || !selectedObject) return;

      const activeObject = fabricCanvas.getActiveObject();
      if (!activeObject) return;

      activeObject.set(property as keyof typeof activeObject, value);
      fabricCanvas.renderAll();
      saveState();

      // 更新选中对象状态
      setSelectedObject((prev) =>
        prev ? { ...prev, [property]: value } : null
      );
    },
    [fabricCanvas, selectedObject, saveState]
  );
  
  // 删除选中对象
  const handleDeleteObject = useCallback(() => {
    if (!fabricCanvas) return;
    const activeObject = fabricCanvas.getActiveObject();
    if (activeObject) {
      fabricCanvas.remove(activeObject);
      fabricCanvas.renderAll();
      setSelectedObject(null);
      saveState();
    }
  }, [fabricCanvas, saveState]);
  
  // 导出 Canvas 图片和状态
  const handleExport = useCallback(() => {
    if (!fabricCanvas) return;
    
    // 1. 导出图片
    const dataUrl = fabricCanvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1,
    });
    
    // 2. 收集当前 canvas 中的文字对象状态
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
        });
      }
    });
    
    console.log("[TextEditModal] 导出 canvas 状态:", textObjects.length, "个文字对象");
    
    // 3. 创建 canvas 状态
    const canvasState: CanvasState = {
      textObjects,
      savedAt: Date.now(),
    };
    
    onExport(dataUrl, canvasState);
  }, [fabricCanvas, onExport]);
  
  // 键盘快捷键
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 关闭
      if (e.key === "Escape") {
        onClose();
        return;
      }
      
      // Ctrl+Z 撤销
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z 或 Ctrl+Y 重做
      if (
        (e.ctrlKey && e.shiftKey && e.key === "z") ||
        (e.ctrlKey && e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, undo, redo, onClose]);
  
  // 关闭时清理
  const handleClose = useCallback(() => {
    clearHistory();
    setSelectedObject(null);
    onClose();
  }, [clearHistory, onClose]);
  
  if (!isOpen) return null;
  
  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* 关闭按钮 */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      
      {/* 主内容区 */}
      <div className="bg-background rounded-lg shadow-2xl max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">编辑文字</h2>
            <p className="text-sm text-muted-foreground mt-1">
              双击文字编辑内容，拖拽调整位置
            </p>
          </div>
          
          {/* 工具栏 */}
          <div className="flex items-center gap-3">
            {/* 撤销/重做 */}
            <button
              onClick={undo}
              disabled={!canUndo}
              className="px-3 py-2 text-sm rounded-md border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted transition-colors"
              title="撤销 (Ctrl+Z)"
            >
              ← 撤销 {undoCount > 0 && `(${undoCount})`}
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="px-3 py-2 text-sm rounded-md border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted transition-colors"
              title="重做 (Ctrl+Shift+Z)"
            >
              重做 → {redoCount > 0 && `(${redoCount})`}
            </button>
            
            <div className="w-px h-6 bg-border" />
            
            {/* 导出按钮 */}
            <button
              onClick={handleExport}
              disabled={!fabricCanvas || isSaving}
              className="px-4 py-2 text-sm rounded-md bg-marriott-600 text-white hover:bg-marriott-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  保存中...
                </>
              ) : (
                <>
                  📥 保存并应用
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* 浮动工具栏（选中时显示） */}
        {selectedObject && (
          <div className="px-6 py-3 border-b border-border">
            <FloatingToolbar
              selectedObject={selectedObject}
              onFontFamilyChange={(v) => handleStyleChange("fontFamily", v)}
              onFontWeightChange={(v) => handleStyleChange("fontWeight", v)}
              onFontStyleChange={(v) => handleStyleChange("fontStyle", v)}
              onFontSizeChange={(v) => handleStyleChange("fontSize", v)}
              onFillChange={(v) => handleStyleChange("fill", v)}
              onDelete={handleDeleteObject}
            />
          </div>
        )}
        
        {/* Canvas 编辑区 */}
        <div className="flex-1 overflow-auto p-6 bg-muted/30">
          {effectiveBackgroundImage && canvasTextObjects.length > 0 ? (
            <FabricCanvasComponent
              backgroundImage={effectiveBackgroundImage}
              initialTextObjects={canvasTextObjects}
              globalFontConfig={globalFont}
              onSelectionChange={setSelectedObject}
              onCanvasReady={handleCanvasReady}
              onStateChange={saveState}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>正在加载编辑器...</p>
              </div>
            </div>
          )}
        </div>
        
        {/* 底部提示 */}
        <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground">
          💡 快捷键: Ctrl+Z 撤销 | Ctrl+Shift+Z 重做 | Delete 删除 | ESC 关闭
        </div>
      </div>
    </div>
  );
  
  return createPortal(modalContent, document.body);
};
