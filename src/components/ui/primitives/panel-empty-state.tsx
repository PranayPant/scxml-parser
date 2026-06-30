'use client';

import React from 'react';

interface PanelEmptyStateProps {
  children: React.ReactNode;
}

export function PanelEmptyState({ children }: PanelEmptyStateProps) {
  return (
    <div className='p-4 text-xs text-muted space-y-2'>
      {children}
    </div>
  );
}
