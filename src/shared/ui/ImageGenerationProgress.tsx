/**
 * 图片生成进度组件
 * 
 * 显示生成状态：加载中 → 完成/失败
 */

import React from "react";
import type { TaskStatus } from "@/core/pipelines/design-modes/types";

export interface ImageGenerationProgressProps {
  /** 当前状态 */
  status: TaskStatus;
  
  /** 进度百分比 (0-100) */
  progress?: number;
  
  /** 错误信息 */
  error?: string;
  
  /** 重试回调 */
  onRetry?: () => void;
}

export const ImageGenerationProgress: React.FC<ImageGenerationProgressProps> = ({
  status,
  progress = 0,
  error,
  onRetry,
}) => {
  // 空闲状态不显示
  if (status === "idle") {
    return null;
  }

  // 生成中
  if (status === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        {/* 加载动画 */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-marriott-200 rounded-full"></div>
          <div 
            className="absolute inset-0 w-16 h-16 border-4 border-marriott-600 rounded-full border-t-transparent animate-spin"
          ></div>
        </div>
        
        {/* 进度文字 */}
        <div className="text-center">
          <p className="text-lg font-medium text-gray-800">正在生成设计图...</p>
          <p className="text-sm text-gray-500 mt-1">
            AI 正在基于参考图创作背景图，请稍候
          </p>
        </div>
        
        {/* 进度条（可选） */}
        {progress > 0 && (
          <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-marriott-500 to-marriott-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}
      </div>
    );
  }

  // 失败状态
  if (status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        {/* 错误图标 */}
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        
        {/* 错误信息 */}
        <div className="text-center">
          <p className="text-lg font-medium text-gray-800">生成失败</p>
          <p className="text-sm text-red-500 mt-1">{error || "未知错误，请重试"}</p>
        </div>
        
        {/* 重试按钮 */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-2 bg-marriott-600 text-white rounded-lg hover:bg-marriott-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            重新生成
          </button>
        )}
      </div>
    );
  }

  // 其他状态（selecting, completed）不在此组件显示
  return null;
};
