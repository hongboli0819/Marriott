import React, { useRef, useState, useEffect } from "react";
import { ImageIcon, XIcon, LoadingIcon } from "./Icon";

interface ImageUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;  // 是否允许多张
  maxCount?: number;   // 最大数量（仅 multiple=true 时有效）
  disabled?: boolean;
}

interface PreviewItem {
  file: File;
  url: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  files,
  onChange,
  multiple = false,
  maxCount = 10,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);

  // 生成预览
  useEffect(() => {
    const generatePreviews = async () => {
      const newPreviews: PreviewItem[] = [];
      for (const file of files) {
        const url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newPreviews.push({ file, url });
      }
      setPreviews(newPreviews);
    };
    generatePreviews();
  }, [files]);

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const imageFiles = Array.from(selectedFiles).filter((f) =>
      f.type.startsWith("image/")
    );

    if (multiple) {
      // 多张模式：追加到现有列表
      const newFiles = [...files, ...imageFiles].slice(0, maxCount);
      onChange(newFiles);
    } else {
      // 单张模式：替换
      if (imageFiles.length > 0) {
        onChange([imageFiles[0]]);
      }
    }

    // 重置 input
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleRemove = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onChange(newFiles);
  };

  const canAddMore = multiple ? files.length < maxCount : files.length === 0;

  return (
    <div className="space-y-3">
      {/* 已上传的图片预览 */}
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {previews.map((preview, index) => (
            <div key={index} className="relative group">
              <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-border/50 bg-card/50">
                <img
                  src={preview.url}
                  alt={preview.file.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {!disabled && (
                <button
                  onClick={() => handleRemove(index)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 上传按钮 */}
      {canAddMore && !disabled && (
        <button
          onClick={handleClick}
          className="flex items-center gap-2 px-4 py-3 bg-card/80 hover:bg-card border-2 border-dashed border-border/50 hover:border-marriott-400 rounded-xl text-muted-foreground hover:text-marriott-600 transition-all"
        >
          <ImageIcon className="w-5 h-5" />
          <span className="text-sm font-medium">
            {multiple
              ? `上传图片 (${files.length}/${maxCount})`
              : files.length === 0
              ? "上传图片"
              : "更换图片"}
          </span>
        </button>
      )}

      {/* 隐藏的 input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {/* 提示文字 */}
      {!disabled && (
        <p className="text-xs text-muted-foreground">
          {multiple
            ? `支持 JPG、PNG、WebP 格式，最多 ${maxCount} 张`
            : "支持 JPG、PNG、WebP 格式，仅限 1 张"}
        </p>
      )}
    </div>
  );
};
