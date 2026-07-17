'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface InitialGroupConflictBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export function InitialGroupConflictBanner({
  message,
  onDismiss,
}: InitialGroupConflictBannerProps) {
  if (!message) return null;

  return (
    <div
      role='alert'
      className='absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-error bg-elevated px-3 py-2 text-xs text-default shadow-lg max-w-md'
    >
      <AlertTriangle className='h-4 w-4 text-error flex-shrink-0' />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        aria-label='Dismiss'
        className='ml-1 text-dimmed hover:text-default transition-colors flex-shrink-0'
      >
        <X className='h-3 w-3' />
      </button>
    </div>
  );
}
