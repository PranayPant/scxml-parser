'use client';

import React from 'react';

interface FormActionsProps {
  onApply: () => void;
  onDiscard: () => void;
  applyDisabled?: boolean;
  className?: string;
}

export function FormActions({ onApply, onDiscard, applyDisabled, className }: FormActionsProps) {
  return (
    <div className={`flex shrink-0 gap-1.5 ${className ?? ''}`.trim()}>
      <button
        type='button'
        onClick={onDiscard}
        className='text-xs px-2.5 py-1 rounded border border-default text-muted hover:bg-muted'
      >
        Discard
      </button>
      <button
        type='button'
        onClick={onApply}
        disabled={applyDisabled}
        className='text-xs px-2.5 py-1 rounded bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-30 disabled:cursor-not-allowed'
      >
        Apply
      </button>
    </div>
  );
}
