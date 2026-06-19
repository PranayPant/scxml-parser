'use client';

import React from 'react';

type Variant = 'solid' | 'soft' | 'ghost' | 'outline';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT: Record<Variant, string> = {
  solid: 'bg-primary text-primary-fg hover:bg-primary-hover',
  soft: 'bg-primary-muted text-primary hover:bg-primary-muted/70',
  ghost: 'text-muted hover:bg-muted hover:text-default',
  outline: 'border border-default text-default hover:bg-muted',
};

const SIZE: Record<Size, string> = {
  sm: 'text-xs px-2 py-1.5 gap-1',
  md: 'text-sm px-3 py-2 gap-2',
};

export function Button({
  variant = 'solid',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className='h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin' />
      )}
      {!loading && icon}
      {children}
    </button>
  );
}
