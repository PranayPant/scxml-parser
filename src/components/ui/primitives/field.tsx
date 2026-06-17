'use client';

import React from 'react';

export const inputClass =
  'w-full border border-default rounded px-2 py-1 text-xs text-default bg-elevated placeholder:text-dimmed focus:outline-none focus:ring-1 focus:ring-primary';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...rest }, ref) => (
    <input ref={ref} className={`${inputClass} ${className}`} {...rest} />
  ),
);
Input.displayName = 'Input';

interface FieldProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, children, className = '' }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className={`block space-y-1 ${className}`}>
      <span className='text-xs font-medium text-muted'>{label}</span>
      {children}
    </label>
  );
}
