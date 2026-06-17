'use client';

import React from 'react';

type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const DOT: Record<Status, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  neutral: 'bg-[var(--ui-text-dimmed)]',
};

export function StatusDot({ status }: { status: Status }) {
  return <span className={`block w-2.5 h-2.5 rounded-full ${DOT[status]}`} />;
}

const BADGE: Record<Status, string> = {
  success: 'bg-[var(--ui-success)]/15 text-success',
  warning: 'bg-[var(--ui-warning)]/15 text-warning',
  error: 'bg-[var(--ui-error)]/15 text-error',
  info: 'bg-[var(--ui-info)]/15 text-info',
  neutral: 'bg-muted text-muted',
};

export function Badge({
  status = 'neutral',
  children,
}: {
  status?: Status;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}
    >
      {children}
    </span>
  );
}
