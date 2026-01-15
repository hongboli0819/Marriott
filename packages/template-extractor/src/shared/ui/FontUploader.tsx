/**
 * 字体上传组件
 * 支持拖拽上传字体文件，显示已上传的字体家族
 */

import React, { useCallback, useRef, useState } from "react";
import type { FontFamily } from "../lib/fontParser";
import { isFontFile, weightToName } from "../lib/fontParser";

export interface FontUploaderProps {
  /** 已上传的字体家族列表 */
  families: FontFamily[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 上传字体文件回调 */
  onUpload: (files: File[]) => Promise<void>;
  /** 删除字体家族回调 */
  onRemove: (familyId: string) => void;
  /** 清空所有字体回调 */
  onClearAll: () => void;
}

export const FontUploader: React.FC<FontUploaderProps> = ({
  families,
  isLoading,
  onUpload,
  onRemove,
  onClearAll,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 处理文件选择
  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fontFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (isFontFile(file.name)) {
          fontFiles.push(file);
        }
      }

      if (fontFiles.length > 0) {
        await onUpload(fontFiles);
      }
    },
    [onUpload]
  );

  // 点击上传
  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 拖拽事件
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      await handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  return (
    <div className="space-y-4">
      {/* 上传区域 */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative p-6 border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-200
          ${isDragOver
            ? "border-indigo-400 bg-indigo-500/20"
            : "border-white/20 bg-white/5 hover:border-indigo-400/50 hover:bg-white/10"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".otf,.ttf,.woff,.woff2"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        
        <div className="text-center">
          {isLoading ? (
            <>
              <div className="w-10 h-10 mx-auto mb-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-300">正在解析字体...</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm text-gray-300 mb-1">
                拖拽字体文件到这里，或点击选择
              </p>
              <p className="text-xs text-gray-500">
                支持 .otf .ttf .woff .woff2 格式
              </p>
            </>
          )}
        </div>
      </div>

      {/* 已上传的字体列表 */}
      {families.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-300">
              已上传字体 ({families.length} 个家族)
            </h4>
            <button
              onClick={onClearAll}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              清空全部
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {families.map((family) => (
              <div
                key={family.id}
                className="p-3 bg-white/5 border border-white/10 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-sm font-medium text-white"
                    style={{ fontFamily: family.name }}
                  >
                    {family.displayName}
                  </span>
                  <button
                    onClick={() => onRemove(family.id)}
                    className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {family.variants.map((variant) => (
                    <span
                      key={variant.id}
                      className={`
                        px-2 py-0.5 text-xs rounded
                        ${variant.loaded
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-500/20 text-gray-400"
                        }
                      `}
                      style={{
                        fontFamily: family.name,
                        fontWeight: variant.fontWeight,
                        fontStyle: variant.fontStyle,
                      }}
                    >
                      {weightToName(variant.fontWeight)}
                      {variant.fontStyle === "italic" && " Italic"}
                    </span>
                  ))}
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  默认字重: {weightToName(family.middleWeight)} ({family.middleWeight})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {families.length === 0 && !isLoading && (
        <div className="text-center py-4 text-gray-500 text-sm">
          暂未上传字体，将使用系统默认字体
        </div>
      )}
    </div>
  );
};


