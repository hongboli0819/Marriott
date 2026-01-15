/**
 * Canvas 历史管理 Hook
 * 提供撤销/重做功能
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
} from "../types/canvasEditorTypes";

export interface UseCanvasHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  initHistory: () => void;
  saveState: () => void;
  undo: () => void;
  redo: () => void;
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

  const initHistory = useCallback(() => {
    if (!canvas) return;
    const initialState = serializeTextObjects(canvas);
    setHistory(createInitialHistory(initialState));
  }, [canvas]);

  const saveState = useCallback(() => {
    if (!canvas || !history || isLoadingRef.current) return;
    const currentState = serializeTextObjects(canvas);
    if (currentState === history.present) return;
    setHistory(pushHistory(history, currentState));
  }, [canvas, history]);

  const restoreObjects = useCallback(
    async (objectsJson: string) => {
      if (!canvas) return;

      isLoadingRef.current = true;

      try {
        const currentObjects = [...canvas.getObjects()];
        currentObjects.forEach((obj) => canvas.remove(obj));

        const objectsData = JSON.parse(objectsJson) as Array<Record<string, unknown>>;
        
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

  const undo = useCallback(() => {
    if (!canvas || !history) return;
    const newHistory = undoHistory(history);
    if (!newHistory) return;

    setHistory(newHistory);
    restoreObjects(newHistory.present);
  }, [canvas, history, restoreObjects]);

  const redo = useCallback(() => {
    if (!canvas || !history) return;
    const newHistory = redoHistory(history);
    if (!newHistory) return;

    setHistory(newHistory);
    restoreObjects(newHistory.present);
  }, [canvas, history, restoreObjects]);

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


