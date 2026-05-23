import React from 'react';

export default function StarRating({ value, onChange, disabled = false }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Message rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          disabled={disabled}
          onClick={() => onChange(star)}
          className={`text-xl leading-none transition-colors ${
            star <= value ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
