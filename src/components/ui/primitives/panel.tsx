'use client';

import React from 'react';
import { X } from 'lucide-react';

interface PanelProps {
  title: string;
  onClose?: () => void;
  /** Tailwind width class for the panel shell. Defaults to w-80. */
  widthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Panel({
  title,
  onClose,
  widthClass = 'w-80',
  footer,
  children,
  className = '',
}: PanelProps) {
  return (
    <div
      className={`${widthClass} flex flex-col border border-default rounded-lg bg-elevated shadow-sm h-full overflow-hidden ${className}`}
    >
      <div className='flex items-center justify-between px-3 py-2 border-b border-default bg-muted'>
        <span className='text-sm font-semibold text-default'>{title}</span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label='Close panel'
            className='text-dimmed hover:text-default transition-colors'
          >
            <X className='h-4 w-4' />
          </button>
        )}
      </div>
      <div className='flex-1 overflow-y-auto'>{children}</div>
      {footer && (
        <div className='px-3 py-2 border-t border-default bg-muted'>{footer}</div>
      )}
    </div>
  );
}
