import React from 'react';
import type { AspectRatio, ImageSize } from '../types';
import { ASPECT_RATIOS, IMAGE_SIZES } from '../types';

interface SizeSelectorProps {
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  onAspectRatioChange: (value: AspectRatio) => void;
  onImageSizeChange: (value: ImageSize) => void;
  disabled?: boolean;
}

export const SizeSelector: React.FC<SizeSelectorProps> = ({
  aspectRatio,
  imageSize,
  onAspectRatioChange,
  onImageSizeChange,
  disabled = false,
}) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">📐 宽高比</label>
        <select
          value={aspectRatio}
          onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
          disabled={disabled}
          className="w-full p-3 rounded-xl border border-gray-200 bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-marriott-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ASPECT_RATIOS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">📏 分辨率</label>
        <select
          value={imageSize}
          onChange={(e) => onImageSizeChange(e.target.value as ImageSize)}
          disabled={disabled}
          className="w-full p-3 rounded-xl border border-gray-200 bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-marriott-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {IMAGE_SIZES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
