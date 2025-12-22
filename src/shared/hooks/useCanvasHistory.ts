/**
 * Canvas 历史管理 Hook
 * 
 * 从 image-diff-tool 复制，用于 Marriott 项目的文字编辑功能
 * 
 * 提供撤销/重做功能
 * 只保存/恢复文字对象，不影响背景图和 canvas 尺寸
 */

import { useState, useCallback, useRef } from "react";
import type { Canvas } from "fabric";
import * as fabric from "fabric";
import {
  type CanvasHistoryState,
  createInitialHistory,
  pushHistory,
  undoHistory,
  redoHistory,
} from "@/shared/types/canvasEditorTypes";

export interface UseCanvasHistoryReturn {
  /** 是否可以撤销 */
  canUndo: boolean;
  /** 是否可以重做 */
  canRedo: boolean;
  /** 历史步数 */
  undoCount: number;
  /** 重做步数 */
  redoCount: number;
  /** 初始化历史 */
  initHistory: () => void;
  /** 保存当前状态 */
  saveState: () => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 清空历史 */
  clearHistory: () => void;
}

/**
 * 只序列化文字对象（不包括背景）
 */
function serializeTextObjects(canvas: Canvas): string {
  const objects = canvas.getObjects().map((obj) => obj.toObject(["id", "isOriginal", "originalLineIndex"]));
  return JSON.stringify(objects);
}

export function useCanvasHistory(
  canvas: Canvas | null
): UseCanvasHistoryReturn {
  const [history, setHistory] = useState<CanvasHistoryState | null>(null);
  const isLoadingRef = useRef(false);

  // 初始化历史
  const initHistory = useCallback(() => {
    if (!canvas) return;
    const initialState = serializeTextObjects(canvas);
    setHistory(createInitialHistory(initialState));
  }, [canvas]);

  // 保存当前状态到历史
  const saveState = useCallback(() => {
    if (!canvas || !history || isLoadingRef.current) return;
    const currentState = serializeTextObjects(canvas);
    // 避免保存相同状态
    if (currentState === history.present) return;
    setHistory(pushHistory(history, currentState));
  }, [canvas, history]);

  // 恢复对象状态（不影响背景图和尺寸）
  const restoreObjects = useCallback(
    async (objectsJson: string) => {
      if (!canvas) return;

      isLoadingRef.current = true;

      try {
        // 清除所有现有对象
        const currentObjects = [...canvas.getObjects()];
        currentObjects.forEach((obj) => canvas.remove(obj));

        // 解析对象数据
        const objectsData = JSON.parse(objectsJson) as Array<Record<string, unknown>>;
        
        // 逐个创建并添加对象
        for (const objData of objectsData) {
          if (objData.type === "i-text" || objData.type === "IText") {
            const text = new fabric.IText(objData.text as string || "", {
              left: objData.left as number,
              top: objData.top as number,
              fontFamily: objData.fontFamily as string,
              fontWeight: objData.fontWeight as string,
              fontStyle: objData.fontStyle as "normal" | "italic",
              fontSize: objData.fontSize as number,
              fill: objData.fill as string,
              scaleX: objData.scaleX as number || 1,
              scaleY: objData.scaleY as number || 1,
              angle: objData.angle as number || 0,
              // 自定义属性
              id: objData.id,
              isOriginal: objData.isOriginal,
              originalLineIndex: objData.originalLineIndex,
            } as fabric.ITextProps & { id: unknown; isOriginal: unknown; originalLineIndex: unknown });
            
            canvas.add(text);
          }
        }

        canvas.renderAll();
      } catch (err) {
        console.error("Failed to restore objects:", err);
      }

      isLoadingRef.current = false;
    },
    [canvas]
  );

  // 撤销
  const undo = useCallback(() => {
    if (!canvas || !history) return;
    const newHistory = undoHistory(history);
    if (!newHistory) return;

    setHistory(newHistory);
    restoreObjects(newHistory.present);
  }, [canvas, history, restoreObjects]);

  // 重做
  const redo = useCallback(() => {
    if (!canvas || !history) return;
    const newHistory = redoHistory(history);
    if (!newHistory) return;

    setHistory(newHistory);
    restoreObjects(newHistory.present);
  }, [canvas, history, restoreObjects]);

  // 清空历史
  const clearHistory = useCallback(() => {
    setHistory(null);
  }, []);

  return {
    canUndo: (history?.past.length || 0) > 0,
    canRedo: (history?.future.length || 0) > 0,
    undoCount: history?.past.length || 0,
    redoCount: history?.future.length || 0,
    initHistory,
    saveState,
    undo,
    redo,
    clearHistory,
  };
}
