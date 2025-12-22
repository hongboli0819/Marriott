/**
 * 生成图片选择器组件
 * 
 * 展示生成的多张图片，用户选择一张继续下一步
 * - 点击图片：弹窗显示大图
 * - 点击右上角圆圈：选择该图片
 */

import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";

/**
 * 获取正确的图片 src
 * 支持 URL 和 base64 两种格式
 */
function getImageSrc(imageData: string): string {
  // 如果是 URL，直接返回
  if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
    return imageData;
  }
  // 如果已经是 data URL，直接返回
  if (imageData.startsWith('data:')) {
    return imageData;
  }
  // 根据 base64 内容推断 MIME 类型
  let mimeType = 'image/png';
  if (imageData.startsWith('/9j/')) {
    mimeType = 'image/jpeg';
  } else if (imageData.startsWith('R0lGOD')) {
    mimeType = 'image/gif';
  } else if (imageData.startsWith('UklGR')) {
    mimeType = 'image/webp';
  }
  // 否则是纯 base64，添加前缀
  return `data:${mimeType};base64,${imageData}`;
}

export interface GeneratedImagesSelectorProps {
  /** 生成的图片列表（支持 URL 或 base64） */
  images: string[];
  
  /** 当前选中的索引（已确认） */
  selectedIndex: number | null;
  
  /** 确认选择回调 */
  onConfirmSelect: (index: number) => void;
  
  /** 重新生成回调 */
  onRegenerate?: () => void;
  
  /** 是否禁用（已确认后禁用） */
  disabled?: boolean;
  
  /** 当前步骤 (1=选择背景图, 2=选择最终效果图) */
  step?: 1 | 2;
  
  /** 是否正在重新生成 */
  isGenerating?: boolean;
}

// 大图预览弹窗组件
const ImagePreviewModal: React.FC<{
  imageBase64: string;
  index: number;
  onClose: () => void;
}> = ({ imageBase64, index, onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      
      {/* 图片序号 */}
      <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium">
        第 {index + 1} 张背景图
      </div>
      
      {/* 大图 */}
      <div 
        className="max-w-[90vw] max-h-[90vh] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={getImageSrc(imageBase64)}
          alt={`生成图片 ${index + 1}`}
          className="max-w-full max-h-[90vh] object-contain"
        />
      </div>
      
      {/* 底部提示 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 text-white/70 text-sm">
        点击任意位置关闭
      </div>
    </div>
  );
};

export const GeneratedImagesSelector: React.FC<GeneratedImagesSelectorProps> = ({
  images,
  selectedIndex,
  onConfirmSelect,
  onRegenerate,
  disabled = false,
  step = 1,
  isGenerating = false,
}) => {
  // 待确认的选择
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  
  // 大图预览状态
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  
  // 是否已确认
  const isConfirmed = selectedIndex !== null;
  
  // 当前显示的选中状态
  const displaySelectedIndex = isConfirmed ? selectedIndex : pendingIndex;
  
  // 是否可以确认
  const canConfirm = useMemo(() => {
    return pendingIndex !== null && !isConfirmed && !disabled;
  }, [pendingIndex, isConfirmed, disabled]);

  // 处理图片点击（显示大图）
  const handleImageClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewIndex(index);
  };

  // 处理选择圈点击
  const handleSelectClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isConfirmed) return;
    setPendingIndex(index);
  };

  // 处理确认选择
  const handleConfirm = () => {
    if (canConfirm && pendingIndex !== null) {
      onConfirmSelect(pendingIndex);
    }
  };

  // 关闭大图预览
  const closePreview = () => {
    setPreviewIndex(null);
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 relative">
      {/* 重新生成 Loading 遮罩 */}
      {isGenerating && (
        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center">
          <div className="flex items-center gap-3 text-marriott-600">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-lg font-medium">正在重新生成...</span>
          </div>
          <p className="text-sm text-gray-500 mt-2">请稍候，AI 正在为您生成新的图片</p>
        </div>
      )}
      
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-800">
            {step === 1 
              ? (isConfirmed ? "已选择的背景图" : "选择一张背景图")
              : (isConfirmed ? "已选择的最终效果图" : "选择最终效果图")
            }
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {step === 1
              ? (isConfirmed 
                  ? "您已选择以下背景图，正在添加文字..." 
                  : "AI 生成了以下 3 张背景图，请选择一张继续")
              : (isConfirmed 
                  ? "您已选择以下效果图作为最终设计" 
                  : "AI 已添加文字，请选择一张作为最终效果图")
            }
          </p>
        </div>
        
        {/* 重新生成按钮 */}
        {onRegenerate && !isConfirmed && (
          <button
            onClick={onRegenerate}
            disabled={disabled || isGenerating}
            className="px-4 py-2 text-sm text-marriott-600 hover:text-marriott-700 hover:bg-marriott-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                生成中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重新生成
              </>
            )}
          </button>
        )}
      </div>

      {/* 图片网格 */}
      <div className="grid grid-cols-3 gap-4">
        {images.map((base64, index) => {
          const isSelected = displaySelectedIndex === index;
          const isOtherSelected = displaySelectedIndex !== null && displaySelectedIndex !== index;
          
          return (
            <div
              key={index}
              className={`
                relative aspect-square rounded-xl overflow-hidden
                transition-all duration-200
                ${isSelected 
                  ? "ring-4 ring-marriott-500 ring-offset-2 scale-[1.02]" 
                  : isOtherSelected
                    ? "opacity-50"
                    : "hover:ring-2 hover:ring-gray-300"
                }
              `}
            >
              {/* 图片（点击显示大图） */}
              <img
                src={getImageSrc(base64)}
                alt={`生成图片 ${index + 1}`}
                className="w-full h-full object-cover cursor-zoom-in"
                onClick={(e) => handleImageClick(index, e)}
              />
              
              {/* 序号（左上角） */}
              <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white text-xs font-medium pointer-events-none">
                {index + 1}
              </div>
              
              {/* 选择圈（右上角） */}
              {!isConfirmed && (
                <button
                  onClick={(e) => handleSelectClick(index, e)}
                  disabled={disabled}
                  className={`
                    absolute top-2 right-2 w-7 h-7 rounded-full border-2 
                    flex items-center justify-center
                    transition-all duration-200
                    ${isSelected
                      ? "bg-marriott-500 border-marriott-500 text-white"
                      : "bg-white/80 border-gray-300 hover:border-marriott-400 hover:bg-white"
                    }
                    ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                  `}
                >
                  {isSelected && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )}
              
              {/* 已确认状态的勾选标记 */}
              {isConfirmed && isSelected && (
                <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              
              {/* 点击查看提示 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 pointer-events-none">
                <p className="text-white/80 text-xs text-center">点击查看大图</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 确认按钮 */}
      {!isConfirmed && (
        <div className="flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`
              px-6 py-2.5 rounded-lg font-medium transition-all duration-200
              flex items-center gap-2
              ${canConfirm
                ? "bg-marriott-600 text-white hover:bg-marriott-700 shadow-md hover:shadow-lg"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }
            `}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            确认选择
          </button>
        </div>
      )}

      {/* 已确认提示 */}
      {isConfirmed && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">已确认选择第 {selectedIndex! + 1} 张背景图</span>
        </div>
      )}

      {/* 大图预览弹窗 - 使用 Portal 渲染到 body */}
      {previewIndex !== null && createPortal(
        <ImagePreviewModal
          imageBase64={images[previewIndex]}
          index={previewIndex}
          onClose={closePreview}
        />,
        document.body
      )}
    </div>
  );
};
