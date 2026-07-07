'use client';

import { FileUpload } from '@/components/file-operations';
import type { FileInfo } from '@/types/common';

interface WelcomeScreenProps {
  onFileLoad: (fileInfo: FileInfo) => void;
  onFileError: (errors: string[]) => void;
  onCreateNew: () => void;
}

export function WelcomeScreen({ onFileLoad, onFileError, onCreateNew }: WelcomeScreenProps) {
  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-default mb-2'>Visual SCXML Editor</h1>
        <p className='text-muted'>
          Edit SCXML files with syntax highlighting, validation, and interactive visual diagrams
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
        <div className='bg-elevated border border-default rounded-lg shadow-sm p-6'>
          <FileUpload onFileLoad={onFileLoad} onError={onFileError} />
        </div>

        <div className='space-y-6'>
          <div className='bg-elevated border border-default rounded-lg shadow-sm p-6'>
            <h3 className='text-lg font-semibold text-default mb-4'>Getting Started</h3>
            <div className='space-y-4 text-sm text-muted'>
              {[
                <>
                  Upload an SCXML file or{' '}
                  <button
                    type='button'
                    onClick={onCreateNew}
                    className='inline text-primary cursor-pointer hover:text-primary-hover underline transition-colors focus:outline-none'
                    aria-label='Create new SCXML document'
                  >
                    create a new one
                  </button>
                </>,
                'Edit with syntax highlighting and real-time validation',
                'Switch to visual diagram for interactive editing',
                'Download your validated SCXML file',
              ].map((step, i) => (
                <div key={i} className='flex items-start space-x-3'>
                  <div className='flex-shrink-0 w-6 h-6 bg-primary-muted text-primary rounded-full flex items-center justify-center text-xs font-medium'>
                    {i + 1}
                  </div>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className='bg-elevated border border-default rounded-lg shadow-sm p-6'>
            <h3 className='text-lg font-semibold text-default mb-4'>Features</h3>
            <ul className='space-y-2 text-sm text-muted'>
              {[
                'Two-way synchronization (Code ↔ Visual)',
                'Interactive state diagram editing',
                'SCXML-specific autocomplete',
                'Real-time validation',
                'Visual metadata preservation',
              ].map((feature) => (
                <li key={feature} className='flex items-center space-x-2'>
                  <div className='w-1.5 h-1.5 bg-success rounded-full' />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
