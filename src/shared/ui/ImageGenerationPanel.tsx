/**
 * 图片生成面板组件
 * 
 * 封装完整的图片生成流程：触发 → 进度 → 选择 → 完成
 */

import React from "react";
import { ImageGenerationProgress } from "./ImageGenerationProgress";
import { GeneratedImagesSelector } from "./GeneratedImagesSelector";
import type { GenerationTask } from "@/core/pipelines/design-modes/types";

export interface ImageGenerationPanelProps {
  /** 任务状态 */
  task: GenerationTask;
  
  /** 确认选择回调 */
  onConfirmSelect: (index: number) => void;
  
  /** 重新生成回调 */
  onRegenerate?: () => void;
  
  /** 是否禁用 */
  disabled?: boolean;
}

export const ImageGenerationPanel: React.FC<ImageGenerationPanelProps> = ({
  task,
  onConfirmSelect,
  onRegenerate,
  disabled = false,
}) => {
  // 空闲状态不显示
  if (task.status === "idle") {
    return null;
  }

  return (
    <div className="mt-6 p-4 bg-gray-50/50 rounded-xl border border-gray-100">
      {/* 生成中或失败状态 */}
      {(task.status === "generating" || task.status === "failed") && (
        <ImageGenerationProgress
          status={task.status}
          progress={task.progress}
          error={task.error}
          onRetry={onRegenerate}
        />
      )}

      {/* 选择状态或已完成状态 */}
      {(task.status === "selecting" || task.status === "completed") && (
        <GeneratedImagesSelector
          images={task.generatedImages}
          selectedIndex={task.selectedIndex}
          onConfirmSelect={onConfirmSelect}
          onRegenerate={onRegenerate}
          disabled={disabled || task.status === "completed"}
        />
      )}
    </div>
  );
};
