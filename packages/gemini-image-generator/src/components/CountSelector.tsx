import React from 'react';

interface CountSelectorProps {
  count: number;
  onChange: (count: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export const CountSelector: React.FC<CountSelectorProps> = ({
  count,
  onChange,
  min = 1,
  max = 10,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      onChange(Math.min(max, Math.max(min, value)));
    }
  };

  const increment = () => {
    if (count < max) {
      onChange(count + 1);
    }
  };

  const decrement = () => {
    if (count > min) {
      onChange(count - 1);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">
        🔢 生成数量 <span className="text-gray-400">（1-{max} 张）</span>
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={decrement}
          disabled={disabled || count <= min}
          className="w-10 h-10 rounded-lg border border-gray-200 bg-white/80 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <input
          type="number"
          value={count}
          onChange={handleChange}
          min={min}
          max={max}
          disabled={disabled}
          className="w-20 h-10 text-center rounded-lg border border-gray-200 bg-white/80 focus:ring-2 focus:ring-marriott-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={increment}
          disabled={disabled || count >= max}
          className="w-10 h-10 rounded-lg border border-gray-200 bg-white/80 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <span className="text-sm text-gray-500">张</span>
      </div>
    </div>
  );
};
