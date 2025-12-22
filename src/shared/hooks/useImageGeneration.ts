/**
 * 图片生成任务 Hook
 * 
 * 管理图片生成的完整生命周期：触发 → 生成中 → 选择 → 完成
 * 支持多步骤生成：Step1(背景图) → Step2(添加文字)
 */

import { useState, useCallback, useRef } from "react";
import type { GenerationTask, Step1Input, Step2Input, GenerationStep } from "@/core/pipelines/design-modes/types";
import { INITIAL_TASK } from "@/core/pipelines/design-modes";
import { runStep1, runStep2 } from "@/core/pipelines/design-modes/referenceImage";

export interface UseImageGenerationOptions {
  /** Step1 成功回调 */
  onStep1Success?: (images: string[]) => void;
  
  /** Step1 选择确认回调 */
  onStep1SelectConfirm?: (selectedImage: string, index: number) => void;
  
  /** Step2 成功回调 */
  onStep2Success?: (images: string[]) => void;
  
  /** Step2 选择确认回调（最终确认） */
  onStep2SelectConfirm?: (selectedImage: string, index: number) => void;
  
  /** 失败回调 */
  onError?: (error: string, step: GenerationStep) => void;
}

export interface UseImageGenerationReturn {
  /** 当前任务状态 */
  task: GenerationTask;
  
  /** 是否正在生成 */
  isGenerating: boolean;
  
  /** 是否等待选择 */
  isSelecting: boolean;
  
  /** 是否已完成 */
  isCompleted: boolean;
  
  /** 是否失败 */
  isFailed: boolean;
  
  /** 开始 Step1 生成 */
  startStep1: (input: Step1Input) => Promise<void>;
  
  /** 开始 Step2 生成 */
  startStep2: (input: Step2Input) => Promise<void>;
  
  /** 确认选择（根据当前步骤自动处理） */
  confirmSelection: (index: number) => void;
  
  /** 重新生成当前步骤 */
  regenerate: () => Promise<void>;
  
  /** 重置状态 */
  reset: () => void;
}

/**
 * 图片生成任务 Hook
 */
export function useImageGeneration(
  options: UseImageGenerationOptions = {}
): UseImageGenerationReturn {
  const { onStep1Success, onStep1SelectConfirm, onStep2Success, onStep2SelectConfirm, onError } = options;
  
  // 任务状态
  const [task, setTask] = useState<GenerationTask>(INITIAL_TASK);
  
  // 保存最后一次输入，用于重新生成
  const lastStep1InputRef = useRef<Step1Input | null>(null);
  const lastStep2InputRef = useRef<Step2Input | null>(null);

  // 更新任务状态
  const updateTask = useCallback((updates: Partial<GenerationTask>) => {
    setTask(prev => ({ ...prev, ...updates }));
  }, []);

  // 创建 logger
  const logger = {
    info: (msg: string, data?: unknown) => console.log(msg, data),
    warn: (msg: string, data?: unknown) => console.warn(msg, data),
    error: (msg: string, data?: unknown) => console.error(msg, data),
    debug: (msg: string, data?: unknown) => console.debug(msg, data),
  };

  // 开始 Step1 生成
  const startStep1 = useCallback(async (input: Step1Input) => {
    // 保存输入
    lastStep1InputRef.current = input;
    
    // 更新状态为生成中
    updateTask({
      status: "generating",
      currentStep: 1,
      generatedImages: [],
      selectedIndex: null,
      error: undefined,
      progress: 5, // 初始进度
    });

    try {
      console.log("[useImageGeneration] 开始 Step1 生成（直接调用模式）", input);
      
      // 执行生成，使用真实进度回调
      const result = await runStep1(input, { logger }, (completed, total) => {
        // 真实进度：5% 起步，完成时到 95%
        const realProgress = 5 + (completed / total) * 90;
        console.log(`[useImageGeneration] Step1 进度: ${completed}/${total} (${Math.round(realProgress)}%)`);
        setTask(prev => ({ ...prev, progress: realProgress }));
      });

      if (result.success && result.generatedImages.length > 0) {
        console.log("[useImageGeneration] Step1 生成成功", result.successCount);
        
        updateTask({
          status: "selecting",
          generatedImages: result.generatedImages,
          progress: 100,
        });
        
        onStep1Success?.(result.generatedImages);
      } else {
        console.error("[useImageGeneration] Step1 生成失败", result.error);
        
        updateTask({
          status: "failed",
          error: result.error || "生成失败",
          progress: 0,
        });
        
        onError?.(result.error || "生成失败", 1);
      }
    } catch (error) {
      console.error("[useImageGeneration] Step1 生成异常", error);
      
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      
      updateTask({
        status: "failed",
        error: errorMessage,
        progress: 0,
      });
      
      onError?.(errorMessage, 1);
    }
  }, [updateTask, onStep1Success, onError]);

  // 开始 Step2 生成
  const startStep2 = useCallback(async (input: Step2Input) => {
    // 保存输入
    lastStep2InputRef.current = input;
    
    // 更新状态为生成中
    updateTask({
      status: "generating",
      currentStep: 2,
      generatedImages: [],
      selectedIndex: null,
      error: undefined,
      progress: 5, // 初始进度
    });

    try {
      console.log("[useImageGeneration] 开始 Step2 生成（直接调用模式）", input);
      
      // 执行生成，使用真实进度回调
      const result = await runStep2(input, { logger }, (completed, total) => {
        // 真实进度：5% 起步，完成时到 95%
        const realProgress = 5 + (completed / total) * 90;
        console.log(`[useImageGeneration] Step2 进度: ${completed}/${total} (${Math.round(realProgress)}%)`);
        setTask(prev => ({ ...prev, progress: realProgress }));
      });

      if (result.success && result.generatedImages.length > 0) {
        console.log("[useImageGeneration] Step2 生成成功", result.successCount);
        
        updateTask({
          status: "selecting",
          generatedImages: result.generatedImages,
          progress: 100,
        });
        
        onStep2Success?.(result.generatedImages);
      } else {
        console.error("[useImageGeneration] Step2 生成失败", result.error);
        
        updateTask({
          status: "failed",
          error: result.error || "生成失败",
          progress: 0,
        });
        
        onError?.(result.error || "生成失败", 2);
      }
    } catch (error) {
      console.error("[useImageGeneration] Step2 生成异常", error);
      
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      
      updateTask({
        status: "failed",
        error: errorMessage,
        progress: 0,
      });
      
      onError?.(errorMessage, 2);
    }
  }, [updateTask, onStep2Success, onError]);

  // 确认选择（根据当前步骤自动处理）
  const confirmSelection = useCallback((index: number) => {
    if (task.status !== "selecting" || index < 0 || index >= task.generatedImages.length) {
      return;
    }
    
    const selectedImage = task.generatedImages[index];
    console.log("[useImageGeneration] 确认选择", { step: task.currentStep, index });
    
    updateTask({
      status: "completed",
      selectedIndex: index,
    });
    
    if (task.currentStep === 1) {
      onStep1SelectConfirm?.(selectedImage, index);
    } else {
      onStep2SelectConfirm?.(selectedImage, index);
    }
  }, [task.status, task.currentStep, task.generatedImages, updateTask, onStep1SelectConfirm, onStep2SelectConfirm]);

  // 重新生成当前步骤
  const regenerate = useCallback(async () => {
    if (task.currentStep === 1) {
      if (!lastStep1InputRef.current) {
        console.warn("[useImageGeneration] 无法重新生成：没有保存的 Step1 输入");
        return;
      }
      console.log("[useImageGeneration] 重新生成 Step1");
      await startStep1(lastStep1InputRef.current);
    } else {
      if (!lastStep2InputRef.current) {
        console.warn("[useImageGeneration] 无法重新生成：没有保存的 Step2 输入");
        return;
      }
      console.log("[useImageGeneration] 重新生成 Step2");
      await startStep2(lastStep2InputRef.current);
    }
  }, [task.currentStep, startStep1, startStep2]);

  // 重置状态
  const reset = useCallback(() => {
    setTask(INITIAL_TASK);
    lastStep1InputRef.current = null;
    lastStep2InputRef.current = null;
  }, []);

  return {
    task,
    isGenerating: task.status === "generating",
    isSelecting: task.status === "selecting",
    isCompleted: task.status === "completed",
    isFailed: task.status === "failed",
    startStep1,
    startStep2,
    confirmSelection,
    regenerate,
    reset,
  };
}
