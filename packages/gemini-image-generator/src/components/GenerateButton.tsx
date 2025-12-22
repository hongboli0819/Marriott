import React from 'react';

interface GenerateButtonProps {
  onClick: () => void;
  isGenerating: boolean;
  progress?: number;
  total?: number;
  disabled?: boolean;
}

export const GenerateButton: React.FC<GenerateButtonProps> = ({
  onClick,
  isGenerating,
  progress = 0,
  total = 1,
  disabled = false,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isGenerating}
      className="w-full btn-primary flex items-center justify-center gap-2"
    >
      {isGenerating ? (
        <>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>生成中... {progress}/{total}</span>
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>生成图片</span>
        </>
      )}
    </button>
  );
};
