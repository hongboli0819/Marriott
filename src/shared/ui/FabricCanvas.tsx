/**
 * Fabric.js Canvas 编辑器组件
 * 
 * 从 image-diff-tool 复制，用于 Marriott 项目的文字编辑功能
 * 
 * 支持：
 * - 文字拖拽移动
 * - 点击空白处创建新文字
 * - 双击编辑文字
 * - 选中显示浮动工具栏
 */

import React, { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import type { CanvasTextObject } from "@/shared/types/canvasEditorTypes";
import { DEFAULT_FONT_CONFIG } from "@/shared/types/canvasEditorTypes";

export interface FabricCanvasProps {
  /** 背景图 dataUrl */
  backgroundImage: string;
  /** 初始文字对象列表 */
  initialTextObjects: CanvasTextObject[];
  /** 全局字体配置 */
  globalFontConfig?: {
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: "normal" | "italic";
    fontSize?: number;
  };
  /** 选中对象变化回调 */
  onSelectionChange?: (obj: CanvasTextObject | null) => void;
  /** Canvas 实例回调 */
  onCanvasReady?: (canvas: fabric.Canvas) => void;
  /** 状态变化回调（用于保存历史） */
  onStateChange?: () => void;
}

export const FabricCanvas: React.FC<FabricCanvasProps> = ({
  backgroundImage,
  initialTextObjects,
  globalFontConfig,
  onSelectionChange,
  onCanvasReady,
  onStateChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [_canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // 初始化 Canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: true,
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;
    onCanvasReady?.(canvas);

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  // 加载背景图
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !backgroundImage) return;

    let isCancelled = false;
    
    // 处理图片 URL 格式
    let imageUrl = backgroundImage;
    
    // 如果是纯 base64（没有 data: 前缀），添加前缀
    if (backgroundImage.startsWith('/9j/')) {
      imageUrl = `data:image/jpeg;base64,${backgroundImage}`;
    } else if (backgroundImage.startsWith('iVBOR')) {
      imageUrl = `data:image/png;base64,${backgroundImage}`;
    }
    // 如果是 Storage URL，直接使用
    // 如果已经是 data URL，直接使用
    
    console.log("[FabricCanvas] 加载背景图:", imageUrl.substring(0, 100) + "...");

    // 设置 crossOrigin 允许跨域图片导出
    fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
      // 检查是否已取消或 canvas 已销毁
      if (isCancelled || !fabricRef.current) return;

      const imgWidth = img.width || 800;
      const imgHeight = img.height || 600;

      // 设置 canvas 尺寸
      canvas.setWidth(imgWidth);
      canvas.setHeight(imgHeight);
      setCanvasSize({ width: imgWidth, height: imgHeight });

      // 设置背景图
      canvas.backgroundImage = img;
      canvas.renderAll();
      
      console.log("[FabricCanvas] 背景图加载完成:", imgWidth, "x", imgHeight);
    }).catch((err) => {
      console.error("[FabricCanvas] 加载背景图失败:", err);
    });

    return () => {
      isCancelled = true;
    };
  }, [backgroundImage]);

  // 添加初始文字对象
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || initialTextObjects.length === 0) return;

    // 清除现有文字对象（保留背景）
    const objects = canvas.getObjects();
    objects.forEach((obj) => {
      if (obj.type === "i-text") {
        canvas.remove(obj);
      }
    });

    // 添加新的文字对象
    initialTextObjects.forEach((textObj) => {
      const iText = new fabric.IText(textObj.text, {
        left: textObj.left,
        top: textObj.top,
        fontFamily: textObj.fontFamily,
        fontWeight: textObj.fontWeight as string,
        fontStyle: textObj.fontStyle,
        fontSize: textObj.fontSize,
        fill: textObj.fill,
        // 自定义属性
        id: textObj.id,
        isOriginal: textObj.isOriginal,
        originalLineIndex: textObj.originalLineIndex,
      } as fabric.ITextProps & { id: string; isOriginal: boolean; originalLineIndex: number });

      canvas.add(iText);
    });

    canvas.renderAll();
    onStateChange?.();
  }, [initialTextObjects]);

  // 双击空白处创建新文字（避免误触）
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleDoubleClick = (options: fabric.TPointerEventInfo) => {
      // 如果双击在已有对象上，不创建新文字（IText 自身会处理编辑）
      if (options.target) return;

      const pointer = canvas.getScenePoint(options.e);
      const newId = `text-${Date.now()}`;

      const newText = new fabric.IText("输入文字", {
        left: pointer.x,
        top: pointer.y,
        fontFamily: globalFontConfig?.fontFamily || DEFAULT_FONT_CONFIG.fontFamily,
        fontWeight: globalFontConfig?.fontWeight || DEFAULT_FONT_CONFIG.fontWeight,
        fontStyle: globalFontConfig?.fontStyle || DEFAULT_FONT_CONFIG.fontStyle,
        fontSize: globalFontConfig?.fontSize || 24,
        fill: "#000000",
        // 自定义属性
        id: newId,
        isOriginal: false,
      } as fabric.ITextProps & { id: string; isOriginal: boolean });

      canvas.add(newText);
      canvas.setActiveObject(newText);
      newText.enterEditing();
      newText.selectAll();
      canvas.renderAll();
    };

    canvas.on("mouse:dblclick", handleDoubleClick);
    return () => {
      canvas.off("mouse:dblclick", handleDoubleClick);
    };
  }, [globalFontConfig]);

  // 选中事件处理
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleSelection = () => {
      const activeObject = canvas.getActiveObject();
      if (activeObject && activeObject.type === "i-text") {
        const iText = activeObject as fabric.IText & { id?: string; isOriginal?: boolean; originalLineIndex?: number };
        onSelectionChange?.({
          id: iText.id || "",
          text: iText.text || "",
          left: iText.left || 0,
          top: iText.top || 0,
          fontFamily: iText.fontFamily || "Microsoft YaHei",
          fontWeight: String(iText.fontWeight || "normal"),
          fontStyle: (iText.fontStyle as "normal" | "italic") || "normal",
          fontSize: iText.fontSize || 24,
          fill: String(iText.fill || "#000000"),
          isOriginal: iText.isOriginal,
          originalLineIndex: iText.originalLineIndex,
        });
      } else {
        onSelectionChange?.(null);
      }
    };

    const handleDeselection = () => {
      onSelectionChange?.(null);
    };

    canvas.on("selection:created", handleSelection);
    canvas.on("selection:updated", handleSelection);
    canvas.on("selection:cleared", handleDeselection);

    return () => {
      canvas.off("selection:created", handleSelection);
      canvas.off("selection:updated", handleSelection);
      canvas.off("selection:cleared", handleDeselection);
    };
  }, [onSelectionChange]);

  // 状态变化事件（用于保存历史）
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleChange = () => {
      onStateChange?.();
    };

    canvas.on("object:modified", handleChange);
    canvas.on("object:added", handleChange);
    canvas.on("object:removed", handleChange);
    canvas.on("text:changed", handleChange);

    return () => {
      canvas.off("object:modified", handleChange);
      canvas.off("object:added", handleChange);
      canvas.off("object:removed", handleChange);
      canvas.off("text:changed", handleChange);
    };
  }, [onStateChange]);

  // 键盘快捷键
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete 删除选中对象
      if (e.key === "Delete" || e.key === "Backspace") {
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
          const iText = activeObject as fabric.IText;
          // 如果正在编辑文字，不删除对象
          if (iText.isEditing) return;
          canvas.remove(activeObject);
          canvas.renderAll();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto rounded-md border border-border bg-muted/30"
      style={{ maxHeight: "600px" }}
    >
      <canvas ref={canvasRef} />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        💡 双击空白处添加文字 | 双击文字编辑 | Delete 删除
      </div>
    </div>
  );
};
