/**
 * Fabric.js Canvas 编辑器组件
 * 
 * 支持：
 * - 文字拖拽移动
 * - 双击空白处创建新文字
 * - 双击编辑文字
 * - 选中显示浮动工具栏
 * - 多选批量编辑和删除
 * - 🔒 锁定/解锁功能
 * - ✏️ 可编辑区域绘制
 * - 📋 模版使用模式的编辑限制
 */

import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import * as fabric from "fabric";
import type { CanvasTextObject, EditableZone, EditorMode, EditableMode, ReplaceableZone } from "../types/canvasEditorTypes";
import { DEFAULT_FONT_CONFIG } from "../types/canvasEditorTypes";
import { getEditableZoneColor, getLockedZoneColor, getReplaceableZoneColor } from "../lib/cssUtils";

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
  /** 选中对象变化回调（单选） */
  onSelectionChange?: (obj: CanvasTextObject | null) => void;
  /** 多选状态变化回调 */
  onMultipleSelectionChange?: (count: number, isMultiple: boolean) => void;
  /** Canvas 实例回调 */
  onCanvasReady?: (canvas: fabric.Canvas) => void;
  /** 状态变化回调（用于保存历史） */
  onStateChange?: () => void;
  
  // ===== 模版编辑功能 =====
  /** 编辑器模式：template-edit = 模版制作, template-use = 使用模版 */
  editorMode?: EditorMode;
  /** 可编辑区域列表 */
  editableZones?: EditableZone[];
  /** 是否处于绘制可编辑区域模式 */
  isDrawingZone?: boolean;
  /** 绘制可编辑区域完成回调 */
  onDrawZoneComplete?: (zone: EditableZone) => void;
  /** 可编辑区域删除回调 */
  onEditableZoneRemove?: (zoneId: string) => void;
  /** 可编辑区域更新回调（移动/调整大小） */
  onEditableZoneUpdate?: (zone: EditableZone) => void;
  
  // ===== 可替换区域功能（图片占位） =====
  /** 可替换区域列表 */
  replaceableZones?: ReplaceableZone[];
  /** 是否处于绘制可替换区域模式 */
  isDrawingReplaceableZone?: boolean;
  /** 绘制可替换区域完成回调 */
  onDrawReplaceableZoneComplete?: (zone: ReplaceableZone) => void;
  /** 可替换区域删除回调 */
  onReplaceableZoneRemove?: (zoneId: string) => void;
  /** 可替换区域更新回调（移动/调整大小） */
  onReplaceableZoneUpdate?: (zone: ReplaceableZone) => void;
}

export type AlignType = "left" | "center" | "right";

export interface FabricCanvasRef {
  /** 批量应用样式到选中的对象 */
  applyStyleToSelection: (style: Partial<{
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: "normal" | "italic";
    fontSize: number;
    fill: string;
  }>) => void;
  /** 删除选中的对象 */
  deleteSelection: () => void;
  /** 获取 Canvas 实例 */
  getCanvas: () => fabric.Canvas | null;
  /** 对齐选中的对象 */
  alignSelection: (type: AlignType) => void;
  /** 均分垂直间距 */
  distributeVertically: () => void;
  
  // ===== 模版编辑功能 =====
  /** 切换选中对象的锁定状态 */
  toggleLock: () => void;
  /** 获取选中对象的锁定状态 */
  isSelectionLocked: () => boolean;
  /** 删除指定的可编辑区域 */
  removeEditableZone: (zoneId: string) => void;
}

export const FabricCanvas = forwardRef<FabricCanvasRef, FabricCanvasProps>(({
  backgroundImage,
  initialTextObjects,
  globalFontConfig,
  onSelectionChange,
  onMultipleSelectionChange,
  onCanvasReady,
  onStateChange,
  // 模版编辑功能
  editorMode = "template-edit",
  editableZones = [],
  isDrawingZone = false,
  onDrawZoneComplete,
  onEditableZoneRemove,
  onEditableZoneUpdate,
  // 可替换区域功能
  replaceableZones = [],
  isDrawingReplaceableZone = false,
  onDrawReplaceableZoneComplete,
  onReplaceableZoneRemove,
  onReplaceableZoneUpdate,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [_canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  
  // 绘制可编辑区域的临时状态
  const drawingRef = useRef<{
    startPoint: { x: number; y: number } | null;
    rect: fabric.Rect | null;
  }>({ startPoint: null, rect: null });
  
  // 绘制可替换区域的临时状态
  const drawingReplaceableRef = useRef<{
    startPoint: { x: number; y: number } | null;
    rect: fabric.Rect | null;
  }>({ startPoint: null, rect: null });
  
  // 追踪初始对象是否已加载（避免重复加载导致状态重置）
  const initialObjectsLoadedRef = useRef<string>("");
  // 追踪画布是否已初始化
  const [canvasReady, setCanvasReady] = useState(false);
  // 追踪对象是否已加载完成
  const [objectsLoaded, setObjectsLoaded] = useState(false);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    applyStyleToSelection: (style) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      // 处理多选
      if (activeObject.type === "activeselection" || activeObject.type === "activeSelection") {
        const selection = activeObject as fabric.ActiveSelection;
        selection.getObjects().forEach((obj) => {
          if (obj.type === "i-text" || obj.type === "textbox") {
            Object.assign(obj, style);
            (obj as fabric.IText).set(style as any);
          }
        });
      } else if (activeObject.type === "i-text" || activeObject.type === "textbox") {
        // 单选
        Object.assign(activeObject, style);
        (activeObject as fabric.IText).set(style as any);
      }

      canvas.renderAll();
      onStateChange?.();
    },

    deleteSelection: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      // 处理多选
      if (activeObject.type === "activeselection" || activeObject.type === "activeSelection") {
        const selection = activeObject as fabric.ActiveSelection;
        const objectsToRemove = selection.getObjects();
        canvas.discardActiveObject();
        objectsToRemove.forEach((obj) => {
          canvas.remove(obj);
        });
      } else {
        canvas.remove(activeObject);
      }

      canvas.renderAll();
      onStateChange?.();
    },

    getCanvas: () => fabricRef.current,

    // 对齐选中的对象
    alignSelection: (type: AlignType) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      // 只处理多选
      if (activeObject.type !== "activeselection" && activeObject.type !== "activeSelection") {
        return;
      }

      const selection = activeObject as fabric.ActiveSelection;
      const objects = selection.getObjects();
      if (objects.length < 2) return;

      // 获取对象宽度（考虑缩放）
      const getWidth = (obj: fabric.FabricObject) => {
        return (obj.width || 0) * (obj.scaleX || 1);
      };

      // 在 Fabric.js 中，IText 的 originX 默认是 'left'
      // 所以 obj.left 就是左边缘的位置
      // 右边缘 = left + width
      // 中心 = left + width/2

      if (type === "left") {
        // 左对齐：所有对象的左边缘对齐到最左边
        const leftEdges = objects.map((o) => o.left || 0);
        const minLeft = Math.min(...leftEdges);
        
        objects.forEach((obj) => {
          obj.set("left", minLeft);
        });
      } else if (type === "right") {
        // 右对齐：所有对象的右边缘对齐到最右边
        const rightEdges = objects.map((o) => (o.left || 0) + getWidth(o));
        const maxRight = Math.max(...rightEdges);
        
        objects.forEach((obj) => {
          const width = getWidth(obj);
          obj.set("left", maxRight - width);
        });
      } else if (type === "center") {
        // 居中对齐：所有对象的中心点对齐到平均中心
        const centers = objects.map((o) => (o.left || 0) + getWidth(o) / 2);
        const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
        
        objects.forEach((obj) => {
          const width = getWidth(obj);
          obj.set("left", avgCenter - width / 2);
        });
      }

      // 需要先取消选择再重新选择，以更新选区边界
      canvas.discardActiveObject();
      const newSelection = new fabric.ActiveSelection(objects, { canvas });
      canvas.setActiveObject(newSelection);
      canvas.requestRenderAll();
      onStateChange?.();
    },

    // 均分垂直间距
    distributeVertically: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      // 只处理多选
      if (activeObject.type !== "activeselection" && activeObject.type !== "activeSelection") {
        return;
      }

      const selection = activeObject as fabric.ActiveSelection;
      const objects = [...selection.getObjects()];
      if (objects.length < 3) return; // 至少3个对象才能分布

      // 在 ActiveSelection 中，对象的 top 是相对于选区中心的
      // 获取对象高度
      const getHeight = (obj: fabric.FabricObject) => {
        return (obj.height || 0) * (obj.scaleY || 1);
      };

      // 获取对象的相对顶部边缘（考虑高度和中心原点）
      const getRelativeTop = (obj: fabric.FabricObject) => {
        const top = obj.top || 0;
        const height = getHeight(obj);
        return top - height / 2;
      };

      // 按相对 top 排序
      objects.sort((a, b) => (a.top || 0) - (b.top || 0));

      // 最上和最下的对象位置不变
      const first = objects[0];
      const last = objects[objects.length - 1];
      const firstTop = first.top || 0;
      const lastTop = last.top || 0;

      // 计算中间对象需要均匀分布的位置
      const totalSpan = lastTop - firstTop;
      const step = totalSpan / (objects.length - 1);

      // 重新分布中间的对象
      for (let i = 1; i < objects.length - 1; i++) {
        const newTop = firstTop + step * i;
        objects[i].set("top", newTop);
      }

      // 需要先取消选择再重新选择，以更新选区边界
      canvas.discardActiveObject();
      const newSelection = new fabric.ActiveSelection(objects, { canvas });
      canvas.setActiveObject(newSelection);
      canvas.requestRenderAll();
      onStateChange?.();
    },

    // ===== 模版编辑功能 =====
    
    // 切换选中对象的锁定状态
    toggleLock: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;

      const toggleObjectLock = (obj: fabric.FabricObject) => {
        if (obj.type !== "i-text") return;
        
        const textObj = obj as fabric.IText & { editableMode?: EditableMode };
        const currentMode = textObj.editableMode || "default";
        const newMode: EditableMode = currentMode === "locked" ? "default" : "locked";
        
        // 更新编辑模式
        (textObj as any).editableMode = newMode;
        
        if (newMode === "locked") {
          // 锁定：禁用移动和缩放，但保持可选（用于解锁）
          obj.set({
            lockMovementX: true,
            lockMovementY: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
            hasControls: false,
            borderColor: getLockedZoneColor(),
          });
        } else {
          // 解锁：恢复正常编辑
          obj.set({
            lockMovementX: false,
            lockMovementY: false,
            lockScalingX: false,
            lockScalingY: false,
            lockRotation: false,
            hasControls: true,
            borderColor: undefined,
          });
        }
      };

      // 处理多选
      if (activeObject.type === "activeselection" || activeObject.type === "activeSelection") {
        const selection = activeObject as fabric.ActiveSelection;
        selection.getObjects().forEach(toggleObjectLock);
      } else {
        toggleObjectLock(activeObject);
      }

      canvas.renderAll();
      onStateChange?.();
    },

    // 获取选中对象的锁定状态
    isSelectionLocked: () => {
      const canvas = fabricRef.current;
      if (!canvas) return false;

      const activeObject = canvas.getActiveObject();
      if (!activeObject) return false;

      if (activeObject.type === "i-text" || activeObject.type === "textbox") {
        const textObj = activeObject as fabric.IText & { editableMode?: EditableMode };
        return textObj.editableMode === "locked";
      }

      // 多选时，检查第一个对象
      if (activeObject.type === "activeselection" || activeObject.type === "activeSelection") {
        const selection = activeObject as fabric.ActiveSelection;
        const textObjs = selection.getObjects().filter(obj => obj.type === "i-text" || obj.type === "textbox");
        if (textObjs.length > 0) {
          const first = textObjs[0] as fabric.IText & { editableMode?: EditableMode };
          return first.editableMode === "locked";
        }
      }

      return false;
    },

    // 删除可编辑区域
    removeEditableZone: (zoneId: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const objects = canvas.getObjects();
      const zoneRect = objects.find((obj) => (obj as any).zoneId === zoneId);
      if (zoneRect) {
        canvas.remove(zoneRect);
        canvas.renderAll();
      }
    },
  }), [onStateChange]);

  // 初始化 Canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: true,
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;
    setCanvasReady(true);
    onCanvasReady?.(canvas);

    return () => {
      canvas.dispose();
      fabricRef.current = null;
      setCanvasReady(false);
      setObjectsLoaded(false);
      // 重置加载标记，以便下次打开时重新加载
      initialObjectsLoadedRef.current = "";
    };
  }, []);

  // 加载背景图
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !backgroundImage) return;

    let isCancelled = false;
    
    let imageUrl = backgroundImage;
    
    if (backgroundImage.startsWith('/9j/')) {
      imageUrl = `data:image/jpeg;base64,${backgroundImage}`;
    } else if (backgroundImage.startsWith('iVBOR')) {
      imageUrl = `data:image/png;base64,${backgroundImage}`;
    }

    fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
      if (isCancelled || !fabricRef.current) return;

      const imgWidth = img.width || 800;
      const imgHeight = img.height || 600;

      canvas.setWidth(imgWidth);
      canvas.setHeight(imgHeight);
      setCanvasSize({ width: imgWidth, height: imgHeight });

      canvas.backgroundImage = img;
      canvas.renderAll();
    }).catch((err) => {
      console.error("[FabricCanvas] 加载背景图失败:", err);
    });

    return () => {
      isCancelled = true;
    };
  }, [backgroundImage]);

  // 添加初始文字对象（只在 initialTextObjects 真正变化时执行）
  useEffect(() => {
    const canvas = fabricRef.current;
    // 等待画布准备就绪
    if (!canvasReady || !canvas || initialTextObjects.length === 0) return;

    // 生成初始对象的唯一标识，用于判断是否真的变化了
    const objectsKey = initialTextObjects.map(obj => `${obj.id}:${obj.text}`).join('|');
    
    // 如果对象没有变化，跳过重新加载
    if (initialObjectsLoadedRef.current === objectsKey) {
      return;
    }
    initialObjectsLoadedRef.current = objectsKey;

    console.log("[FabricCanvas] 加载初始文字对象:", initialTextObjects.length, "个");

    // 清除现有的文字对象
    const objects = canvas.getObjects();
    objects.forEach((obj) => {
      if (obj.type === "i-text" || obj.type === "textbox") {
        canvas.remove(obj);
      }
    });

    // 查找对象所在的可编辑区域
    const findZoneForPosition = (left: number, top: number): EditableZone | null => {
      return editableZones.find((zone) =>
        left >= zone.x &&
        left <= zone.x + zone.width &&
        top >= zone.y &&
        top <= zone.y + zone.height
      ) || null;
    };

    // 添加初始文字对象
    initialTextObjects.forEach((textObj) => {
      const editableMode = textObj.editableMode || "default";
      const containingZone = editorMode === "template-use" 
        ? findZoneForPosition(textObj.left, textObj.top) 
        : null;
      
      const objectProps: any = {
        left: textObj.left,
        top: textObj.top,
        fontFamily: textObj.fontFamily,
        fontWeight: textObj.fontWeight as string,
        fontStyle: textObj.fontStyle,
        fontSize: textObj.fontSize,
        fill: textObj.fill,
        id: textObj.id,
        isOriginal: textObj.isOriginal,
        originalLineIndex: textObj.originalLineIndex,
        editableMode: editableMode,
      };

      // 🔑 使用 IText（动态宽度），在可编辑区域内标记区域ID用于边界限制
      const iText = new fabric.IText(textObj.text, objectProps as fabric.ITextProps);
      
      if (containingZone && editorMode === "template-use") {
        (iText as any).containingZoneId = containingZone.id;
        (iText as any).isInEditableZone = true;
      }
      
      canvas.add(iText);
    });

    canvas.renderAll();
    setObjectsLoaded(true);
    onStateChange?.();
  }, [canvasReady, initialTextObjects]);
  
  // 🔒 使用模版模式下应用编辑限制（等待对象加载完成后执行）
  useEffect(() => {
    const canvas = fabricRef.current;
    // 必须等待对象加载完成
    if (!canvas || !objectsLoaded || editorMode !== "template-use") return;

    console.log("[FabricCanvas] 应用使用模版限制，对象数量:", canvas.getObjects().filter(o => o.type === "i-text" || o.type === "textbox").length);

    // 查找对象所在的可编辑区域
    const findContainingZone = (left: number, top: number): EditableZone | null => {
      return editableZones.find((zone) =>
        left >= zone.x &&
        left <= zone.x + zone.width &&
        top >= zone.y &&
        top <= zone.y + zone.height
      ) || null;
    };

    canvas.getObjects().forEach((obj) => {
      if ((obj as any).isEditableZone) return;
      if (obj.type !== "i-text" && obj.type !== "textbox") return;

      const textObj = obj as fabric.IText & { editableMode?: EditableMode };
      const mode = textObj.editableMode || "default";
      const containingZone = findContainingZone(obj.left || 0, obj.top || 0);

      console.log("[FabricCanvas] 对象:", (obj as any).id, "模式:", mode, "所在区域:", containingZone?.id);

      if (mode === "locked") {
        obj.set({
          selectable: false,
          evented: false,
          editable: false,
        });
        (obj as any).isInEditableZone = false;
        (obj as any).containingZoneId = null;
      } else if (containingZone) {
        obj.set({
          selectable: true,
          evented: true,
          lockMovementX: false,
          lockMovementY: false,
          lockScalingX: false,
          lockScalingY: false,
          hasControls: true,
          editable: true,
        });
        (obj as any).isInEditableZone = true;
        (obj as any).isTextOnlyEditable = false;
        // 🔑 存储所属区域ID，用于移动限制
        (obj as any).containingZoneId = containingZone.id;
      } else {
        obj.set({
          selectable: true,
          evented: true,
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
          hasControls: false,
          editable: true,
        });
        (obj as any).isTextOnlyEditable = true;
        (obj as any).isInEditableZone = false;
        (obj as any).containingZoneId = null;
      }
    });

    canvas.renderAll();
  }, [objectsLoaded, editorMode, editableZones]);

  // 查找指定位置所在的可编辑区域
  const findZoneAtPoint = useCallback((x: number, y: number): EditableZone | null => {
    return editableZones.find((zone) =>
      x >= zone.x &&
      x <= zone.x + zone.width &&
      y >= zone.y &&
      y <= zone.y + zone.height
    ) || null;
  }, [editableZones]);

  // 双击空白处创建新文字
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleDoubleClick = (options: fabric.TPointerEventInfo) => {
      if (options.target) return;

      const pointer = canvas.getScenePoint(options.e);
      
      // 🔒 使用模版模式下，只能在可编辑区域内创建新文字
      const containingZone = findZoneAtPoint(pointer.x, pointer.y);
      
      if (editorMode === "template-use") {
        if (!containingZone) {
          console.log("[FabricCanvas] 使用模版模式：只能在可编辑区域内创建新文字");
          return;
        }
      }

      const newId = `text-${Date.now()}`;
      
      const baseProps = {
        left: pointer.x,
        top: pointer.y,
        fontFamily: globalFontConfig?.fontFamily || DEFAULT_FONT_CONFIG.fontFamily,
        fontWeight: globalFontConfig?.fontWeight || DEFAULT_FONT_CONFIG.fontWeight,
        fontStyle: globalFontConfig?.fontStyle || DEFAULT_FONT_CONFIG.fontStyle,
        fontSize: globalFontConfig?.fontSize || 24,
        fill: "#000000",
        id: newId,
        isOriginal: false,
      };

      // 🔑 使用 IText（动态宽度），在可编辑区域内标记区域ID
      const newText = new fabric.IText("输入文字", baseProps as fabric.ITextProps);
      
      if (containingZone && editorMode === "template-use") {
        (newText as any).containingZoneId = containingZone.id;
        (newText as any).isInEditableZone = true;
      }

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
  }, [globalFontConfig, editorMode, findZoneAtPoint]);

  // 选中事件处理 - 支持多选
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleSelection = () => {
      const activeObject = canvas.getActiveObject();
      
      if (!activeObject) {
        onSelectionChange?.(null);
        onMultipleSelectionChange?.(0, false);
        return;
      }

      // 多选模式
      if (activeObject.type === "activeselection" || activeObject.type === "activeSelection") {
        const selection = activeObject as fabric.ActiveSelection;
        const objects = selection.getObjects();
        const textObjects = objects.filter((obj) => obj.type === "i-text" || obj.type === "textbox");
        
        if (textObjects.length > 0) {
          // 返回第一个对象作为参考（用于显示当前值）
          const first = textObjects[0] as fabric.IText & { 
            id?: string; 
            isOriginal?: boolean; 
            originalLineIndex?: number; 
            editableMode?: EditableMode;
            isTextOnlyEditable?: boolean;
          };
          // 检查是否有任何对象是只能改字的
          const hasTextOnlyEditable = textObjects.some((obj) => (obj as any).isTextOnlyEditable);
          onSelectionChange?.({
            id: first.id || "",
            text: first.text || "",
            left: first.left || 0,
            top: first.top || 0,
            fontFamily: first.fontFamily || "Microsoft YaHei",
            fontWeight: String(first.fontWeight || "normal"),
            fontStyle: (first.fontStyle as "normal" | "italic") || "normal",
            fontSize: first.fontSize || 24,
            fill: String(first.fill || "#000000"),
            isOriginal: first.isOriginal,
            originalLineIndex: first.originalLineIndex,
            editableMode: first.editableMode,
            isTextOnlyEditable: hasTextOnlyEditable || first.isTextOnlyEditable,
          });
          onMultipleSelectionChange?.(textObjects.length, true);
        }
        return;
      }

      // 单选模式
      if (activeObject.type === "i-text" || activeObject.type === "textbox") {
        const iText = activeObject as fabric.IText & { 
          id?: string; 
          isOriginal?: boolean; 
          originalLineIndex?: number; 
          editableMode?: EditableMode;
          isTextOnlyEditable?: boolean;
        };
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
          editableMode: iText.editableMode,
          isTextOnlyEditable: iText.isTextOnlyEditable,
        });
        onMultipleSelectionChange?.(1, false);
      } else {
        onSelectionChange?.(null);
        onMultipleSelectionChange?.(0, false);
      }
    };

    const handleDeselection = () => {
      onSelectionChange?.(null);
      onMultipleSelectionChange?.(0, false);
    };

    canvas.on("selection:created", handleSelection);
    canvas.on("selection:updated", handleSelection);
    canvas.on("selection:cleared", handleDeselection);

    return () => {
      canvas.off("selection:created", handleSelection);
      canvas.off("selection:updated", handleSelection);
      canvas.off("selection:cleared", handleDeselection);
    };
  }, [onSelectionChange, onMultipleSelectionChange]);

  // 状态变化事件
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

  // ===== 确保文字编辑时新输入的字符继承对象样式 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // 当进入编辑模式时，清除字符级别的样式，确保使用对象级别样式
    const handleEditingEntered = (e: any) => {
      const target = e.target as fabric.IText;
      if (!target || (target.type !== "i-text" && target.type !== "textbox")) return;
      
      // 清除所有字符级别的样式，使用对象级别的统一样式
      target.styles = {};
      
      // 设置默认的选中样式为对象样式，这样新输入的字符会使用这些样式
      target.setSelectionStyles({
        fontFamily: target.fontFamily,
        fontSize: target.fontSize,
        fontWeight: target.fontWeight,
        fontStyle: target.fontStyle,
        fill: target.fill,
      });
    };

    // 当文字改变时，确保新字符使用对象样式
    const handleTextInput = (e: any) => {
      const target = e.target as fabric.IText;
      if (!target || (target.type !== "i-text" && target.type !== "textbox")) return;
      
      // 如果存在字符级别样式，清除它们
      if (target.styles && Object.keys(target.styles).length > 0) {
        target.styles = {};
        canvas.renderAll();
      }
    };

    canvas.on("text:editing:entered", handleEditingEntered);
    canvas.on("text:changed", handleTextInput);

    return () => {
      canvas.off("text:editing:entered", handleEditingEntered);
      canvas.off("text:changed", handleTextInput);
    };
  }, []);

  // ===== 使用模版模式下的文字边界检测 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !objectsLoaded || editorMode !== "template-use") return;

    const handleTextChanged = (e: any) => {
      const target = e.target as fabric.IText & { 
        containingZoneId?: string;
        isInEditableZone?: boolean;
      };
      
      if (!target || !target.containingZoneId || !target.isInEditableZone) return;
      
      const zone = editableZones.find(z => z.id === target.containingZoneId);
      if (!zone) return;
      
      // 计算文字实际宽度
      const textWidth = (target.width || 0) * (target.scaleX || 1);
      const textLeft = target.left || 0;
      const textRight = textLeft + textWidth;
      const zoneRight = zone.x + zone.width - 10; // 留边距
      
      // 如果文字超出右边界，在适当位置插入换行
      if (textRight > zoneRight) {
        const text = target.text || "";
        const lines = text.split("\n");
        const lastLine = lines[lines.length - 1];
        
        // 计算可用宽度
        const availableWidth = zoneRight - textLeft;
        
        // 使用 Fabric.js 的 measureLine 估算每个字符的平均宽度
        const avgCharWidth = textWidth / text.replace(/\n/g, "").length;
        const maxCharsPerLine = Math.floor(availableWidth / avgCharWidth);
        
        if (maxCharsPerLine > 0 && lastLine.length > maxCharsPerLine) {
          // 在最后一行找到合适的位置插入换行
          const insertPos = lines.slice(0, -1).join("\n").length + (lines.length > 1 ? 1 : 0) + maxCharsPerLine;
          const newText = text.slice(0, insertPos) + "\n" + text.slice(insertPos);
          
          // 保存光标位置
          const selectionStart = target.selectionStart || 0;
          const selectionEnd = target.selectionEnd || 0;
          
          target.set("text", newText);
          
          // 恢复光标位置（考虑新增的换行符）
          if (selectionStart >= insertPos) {
            target.selectionStart = selectionStart + 1;
            target.selectionEnd = selectionEnd + 1;
          }
          
          canvas.renderAll();
        }
      }
    };

    canvas.on("text:changed", handleTextChanged);

    return () => {
      canvas.off("text:changed", handleTextChanged);
    };
  }, [objectsLoaded, editorMode, editableZones]);

  // 键盘快捷键 - 支持单选和多选删除
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 🔴 关键修复：如果焦点在输入框、文本框等表单元素上，不要处理删除快捷键
      // 这样用户在字号输入框中按 Delete/Backspace 时不会误删画布内容
      const target = e.target as HTMLElement;
      const isFormElement = target.tagName === "INPUT" || 
                           target.tagName === "TEXTAREA" || 
                           target.tagName === "SELECT" ||
                           target.isContentEditable;
      
      if (e.key === "Delete" || e.key === "Backspace") {
        // 如果焦点在表单元素上，不处理（让表单元素自己处理）
        if (isFormElement) return;
        
        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;

        // 检查是否有文字正在编辑中
        if (activeObject.type === "i-text" || activeObject.type === "textbox") {
          const iText = activeObject as fabric.IText;
          if (iText.isEditing) return;
        }

        // 处理多选 (ActiveSelection)
        if (activeObject.type === "activeselection" || activeObject.type === "activeSelection") {
          const selection = activeObject as fabric.ActiveSelection;
          const objectsToRemove = selection.getObjects();
          
          // 检查是否有任何文字正在编辑
          const hasEditingText = objectsToRemove.some((obj) => {
            if (obj.type === "i-text" || obj.type === "textbox") {
              return (obj as fabric.IText).isEditing;
            }
            return false;
          });
          
          if (hasEditingText) return;
          
          // 删除所有选中的对象
          canvas.discardActiveObject();
          objectsToRemove.forEach((obj) => {
            // 如果是可编辑区域，通知父组件
            if ((obj as any).isEditableZone && (obj as any).zoneId) {
              onEditableZoneRemove?.((obj as any).zoneId);
            }
            // 如果是可替换区域，通知父组件
            if ((obj as any).isReplaceableZone && (obj as any).zoneId) {
              onReplaceableZoneRemove?.((obj as any).zoneId);
            }
            canvas.remove(obj);
          });
          canvas.renderAll();
        } else {
          // 单个对象删除
          // 如果是可编辑区域，通知父组件
          if ((activeObject as any).isEditableZone && (activeObject as any).zoneId) {
            onEditableZoneRemove?.((activeObject as any).zoneId);
          }
          // 如果是可替换区域，通知父组件
          if ((activeObject as any).isReplaceableZone && (activeObject as any).zoneId) {
            onReplaceableZoneRemove?.((activeObject as any).zoneId);
          }
          canvas.remove(activeObject);
          canvas.renderAll();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onEditableZoneRemove, onReplaceableZoneRemove]);

  // ===== 可编辑区域绘制模式 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !isDrawingZone) return;

    // 进入绘制模式时禁用对象选择
    canvas.selection = false;
    canvas.getObjects().forEach((obj) => {
      obj.set({ selectable: false, evented: false });
    });
    canvas.discardActiveObject();
    canvas.renderAll();

    const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e);
      drawingRef.current.startPoint = { x: pointer.x, y: pointer.y };
      
      const rect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: getEditableZoneColor(0.15),
        stroke: getEditableZoneColor(),
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        selectable: false,
        evented: false,
      });
      
      drawingRef.current.rect = rect;
      canvas.add(rect);
    };

    const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
      const { startPoint, rect } = drawingRef.current;
      if (!startPoint || !rect) return;
      
      const pointer = canvas.getScenePoint(opt.e);
      const width = pointer.x - startPoint.x;
      const height = pointer.y - startPoint.y;
      
      rect.set({
        width: Math.abs(width),
        height: Math.abs(height),
        left: width < 0 ? pointer.x : startPoint.x,
        top: height < 0 ? pointer.y : startPoint.y,
      });
      canvas.renderAll();
    };

    const handleMouseUp = () => {
      const { rect } = drawingRef.current;
      
      if (rect && rect.width! > 20 && rect.height! > 20) {
        const zone: EditableZone = {
          id: `zone-${Date.now()}`,
          x: rect.left!,
          y: rect.top!,
          width: rect.width!,
          height: rect.height!,
        };
        onDrawZoneComplete?.(zone);
      }
      
      // 清理临时矩形
      if (rect) {
        canvas.remove(rect);
      }
      drawingRef.current = { startPoint: null, rect: null };
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
      
      // 退出绘制模式时恢复对象选择
      canvas.selection = true;
      canvas.getObjects().forEach((obj) => {
        if ((obj as any).isEditableZone) return; // 保持区域矩形不可选
        obj.set({ selectable: true, evented: true });
      });
      canvas.renderAll();
    };
  }, [isDrawingZone, onDrawZoneComplete]);

  // ===== 渲染可编辑区域矩形 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // 清除旧的区域矩形
    const existingZones = canvas.getObjects().filter((obj) => (obj as any).isEditableZone);
    existingZones.forEach((obj) => canvas.remove(obj));

    // 添加新的区域矩形
    editableZones.forEach((zone) => {
      const rect = new fabric.Rect({
        left: zone.x,
        top: zone.y,
        width: zone.width,
        height: zone.height,
        fill: getEditableZoneColor(0.1),
        stroke: getEditableZoneColor(),
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        selectable: editorMode === "template-edit",
        evented: editorMode === "template-edit",
        hasControls: editorMode === "template-edit",
        hasBorders: true,
      });
      
      // 自定义属性
      (rect as any).isEditableZone = true;
      (rect as any).zoneId = zone.id;
      
      canvas.add(rect);
      canvas.sendObjectToBack(rect);
    });

    canvas.renderAll();
  }, [editableZones, editorMode]);

  // ===== 可编辑区域移动/缩放更新回调 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || editorMode !== "template-edit") return;

    const handleZoneModified = (e: any) => {
      const target = e.target;
      if (!target || !(target as any).isEditableZone) return;
      
      const zoneId = (target as any).zoneId;
      if (!zoneId) return;
      
      // 获取更新后的位置和大小（考虑缩放）
      const updatedZone: EditableZone = {
        id: zoneId,
        x: target.left || 0,
        y: target.top || 0,
        width: (target.width || 0) * (target.scaleX || 1),
        height: (target.height || 0) * (target.scaleY || 1),
      };
      
      onEditableZoneUpdate?.(updatedZone);
    };

    canvas.on("object:modified", handleZoneModified);
    return () => {
      canvas.off("object:modified", handleZoneModified);
    };
  }, [editorMode, onEditableZoneUpdate]);

  // ===== 绘制可替换区域 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !isDrawingReplaceableZone || editorMode !== "template-edit") return;

    // 禁用对象选择
    canvas.selection = false;
    canvas.getObjects().forEach((obj) => {
      obj.set({ selectable: false, evented: false });
    });
    canvas.renderAll();

    const handleMouseDown = (e: any) => {
      if (drawingReplaceableRef.current.startPoint) return;

      const pointer = canvas.getViewportPoint(e.e);
      drawingReplaceableRef.current.startPoint = { x: pointer.x, y: pointer.y };

      const rect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: getReplaceableZoneColor(0.15),
        stroke: getReplaceableZoneColor(),
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        selectable: false,
        evented: false,
      });

      drawingReplaceableRef.current.rect = rect;
      canvas.add(rect);
      canvas.renderAll();
    };

    const handleMouseMove = (e: any) => {
      const start = drawingReplaceableRef.current.startPoint;
      const rect = drawingReplaceableRef.current.rect;
      if (!start || !rect) return;

      const pointer = canvas.getViewportPoint(e.e);
      const left = Math.min(start.x, pointer.x);
      const top = Math.min(start.y, pointer.y);
      const width = Math.abs(pointer.x - start.x);
      const height = Math.abs(pointer.y - start.y);

      rect.set({ left, top, width, height });
      canvas.renderAll();
    };

    const handleMouseUp = () => {
      const rect = drawingReplaceableRef.current.rect;
      if (!rect) return;

      const width = rect.width || 0;
      const height = rect.height || 0;

      // 最小尺寸检查
      if (width > 20 && height > 20) {
        const zone: ReplaceableZone = {
          id: `replaceable-${Date.now()}`,
          x: rect.left || 0,
          y: rect.top || 0,
          width,
          height,
        };
        onDrawReplaceableZoneComplete?.(zone);
      }

      // 移除临时矩形
      canvas.remove(rect);
      drawingReplaceableRef.current = { startPoint: null, rect: null };
      canvas.renderAll();
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);

      // 退出绘制模式时恢复对象选择
      canvas.selection = true;
      canvas.getObjects().forEach((obj) => {
        if ((obj as any).isReplaceableZone) return;
        obj.set({ selectable: true, evented: true });
      });
      canvas.renderAll();
    };
  }, [isDrawingReplaceableZone, onDrawReplaceableZoneComplete, editorMode]);

  // ===== 渲染可替换区域矩形 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // 清除旧的可替换区域矩形
    const existingZones = canvas.getObjects().filter((obj) => (obj as any).isReplaceableZone);
    existingZones.forEach((obj) => canvas.remove(obj));

    // 添加新的可替换区域矩形（在最底层）
    replaceableZones.forEach((zone) => {
      const rect = new fabric.Rect({
        left: zone.x,
        top: zone.y,
        width: zone.width,
        height: zone.height,
        fill: getReplaceableZoneColor(0.15),
        stroke: getReplaceableZoneColor(),
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        selectable: editorMode === "template-edit",
        evented: editorMode === "template-edit",
        hasControls: editorMode === "template-edit",
        hasBorders: true,
      });

      // 自定义属性
      (rect as any).isReplaceableZone = true;
      (rect as any).zoneId = zone.id;

      canvas.add(rect);
      // 确保可替换区域在最底层（在可编辑区域之下）
      canvas.sendObjectToBack(rect);
    });

    canvas.renderAll();
  }, [replaceableZones, editorMode]);

  // ===== 可替换区域移动/缩放更新回调 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || editorMode !== "template-edit") return;

    const handleReplaceableZoneModified = (e: any) => {
      const target = e.target;
      if (!target || !(target as any).isReplaceableZone) return;

      const zoneId = (target as any).zoneId;
      if (!zoneId) return;

      // 获取更新后的位置和大小（考虑缩放）
      const updatedZone: ReplaceableZone = {
        id: zoneId,
        x: target.left || 0,
        y: target.top || 0,
        width: (target.width || 0) * (target.scaleX || 1),
        height: (target.height || 0) * (target.scaleY || 1),
      };

      onReplaceableZoneUpdate?.(updatedZone);
    };

    canvas.on("object:modified", handleReplaceableZoneModified);
    return () => {
      canvas.off("object:modified", handleReplaceableZoneModified);
    };
  }, [editorMode, onReplaceableZoneUpdate]);

  // ===== 使用模版模式下的选择限制 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !objectsLoaded || editorMode !== "template-use") return;

    const handleSelectionCreated = () => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      
      // 只处理多选
      if (activeObject.type !== "activeselection" && activeObject.type !== "activeSelection") {
        return;
      }

      const selection = activeObject as fabric.ActiveSelection;
      const objects = selection.getObjects();
      
      // 过滤掉锁定的对象
      const nonLockedObjects = objects.filter((obj) => {
        if (obj.type !== "i-text") return true;
        const textObj = obj as fabric.IText & { editableMode?: EditableMode };
        return textObj.editableMode !== "locked";
      });

      // 如果有锁定对象被移除，重新创建选择
      if (nonLockedObjects.length !== objects.length) {
        canvas.discardActiveObject();
        
        if (nonLockedObjects.length === 0) {
          canvas.renderAll();
          return;
        } else if (nonLockedObjects.length === 1) {
          canvas.setActiveObject(nonLockedObjects[0]);
        } else {
          const newSelection = new fabric.ActiveSelection(nonLockedObjects, { canvas });
          canvas.setActiveObject(newSelection);
        }
        canvas.renderAll();
        return;
      }

      // 🔒 检查是否有任何对象是"只可改字"的（需要锁定整个选择组的移动）
      const hasTextOnlyObjects = objects.some((obj) => {
        return (obj as any).isTextOnlyEditable === true;
      });

      if (hasTextOnlyObjects) {
        // 锁定整个选择组的移动，但允许文字编辑
        selection.set({
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
          hasControls: false,
        });
        canvas.renderAll();
      }
    };

    canvas.on("selection:created", handleSelectionCreated);
    canvas.on("selection:updated", handleSelectionCreated);

    return () => {
      canvas.off("selection:created", handleSelectionCreated);
      canvas.off("selection:updated", handleSelectionCreated);
    };
  }, [objectsLoaded, editorMode]);

  // ===== 使用模版模式下限制可编辑区域内对象移动范围 =====
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !objectsLoaded || editorMode !== "template-use") return;

    const handleObjectMoving = (e: any) => {
      const target = e.target as fabric.FabricObject;
      if (!target) return;

      // 处理多选情况
      if (target.type === "activeselection" || target.type === "activeSelection") {
        const selection = target as fabric.ActiveSelection;
        const objects = selection.getObjects();
        
        // 检查是否有任何对象在可编辑区域内
        const zoneObjects = objects.filter((obj) => (obj as any).isInEditableZone);
        
        if (zoneObjects.length > 0) {
          // 🔑 使用存储的 containingZoneId 找到对象所属的区域
          const zoneIds = new Set(zoneObjects.map((obj) => (obj as any).containingZoneId).filter(Boolean));
          
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          
          editableZones.forEach((zone) => {
            if (zoneIds.has(zone.id)) {
              minX = Math.min(minX, zone.x);
              minY = Math.min(minY, zone.y);
              maxX = Math.max(maxX, zone.x + zone.width);
              maxY = Math.max(maxY, zone.y + zone.height);
            }
          });

          // 限制整个选择组在区域内
          if (minX !== Infinity) {
            const selLeft = selection.left || 0;
            const selTop = selection.top || 0;
            const selWidth = (selection.width || 0) * (selection.scaleX || 1);
            const selHeight = (selection.height || 0) * (selection.scaleY || 1);
            
            const newLeft = Math.max(minX, Math.min(selLeft, maxX - selWidth));
            const newTop = Math.max(minY, Math.min(selTop, maxY - selHeight));
            
            selection.set({
              left: newLeft,
              top: newTop,
            });
          }
        }
        return;
      }

      // 处理单选情况 - 使用存储的 containingZoneId
      const obj = target as fabric.FabricObject & { 
        isInEditableZone?: boolean;
        containingZoneId?: string;
      };
      
      if (!obj.isInEditableZone || !obj.containingZoneId) return;

      // 🔑 根据存储的 zoneId 找到所属区域
      const containingZone = editableZones.find((zone) => zone.id === obj.containingZoneId);
      
      if (containingZone) {
        const objWidth = (obj.width || 0) * (obj.scaleX || 1);
        const objHeight = (obj.height || 0) * (obj.scaleY || 1);
        
        const newLeft = Math.max(containingZone.x, Math.min(obj.left || 0, containingZone.x + containingZone.width - objWidth));
        const newTop = Math.max(containingZone.y, Math.min(obj.top || 0, containingZone.y + containingZone.height - objHeight));
        
        obj.set({
          left: newLeft,
          top: newTop,
        });
      }
    };

    canvas.on("object:moving", handleObjectMoving);

    return () => {
      canvas.off("object:moving", handleObjectMoving);
    };
  }, [objectsLoaded, editorMode, editableZones]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-white/20 bg-black/30 shadow-2xl"
    >
      <canvas ref={canvasRef} />
    </div>
  );
});

FabricCanvas.displayName = "FabricCanvas";
