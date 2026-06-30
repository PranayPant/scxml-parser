'use client';

import React from 'react';
import { Plus } from 'lucide-react';

interface FooterAddButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export function FooterAddButton({ onClick, children }: FooterAddButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-colors'
    >
      <Plus className='h-3 w-3' />
      {children}
    </button>
  );
}
