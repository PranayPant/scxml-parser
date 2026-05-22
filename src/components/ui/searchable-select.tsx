'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchableSelect({ value, options, onChange, placeholder = '—' }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => options.filter(o => o.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !buttonRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dropW = Math.max(rect.width, 220);
      const dropH = 240;

      // Flip above if insufficient space below
      const spaceBelow = vh - rect.bottom;
      const top = spaceBelow >= dropH || spaceBelow >= rect.top
        ? rect.bottom + 4
        : rect.top - dropH - 4;

      // Clamp horizontally so dropdown never overflows the right edge
      const left = rect.left + dropW > vw - 8
        ? Math.max(8, rect.right - dropW)
        : rect.left;

      setDropdownStyle({
        position: 'fixed',
        top: Math.max(8, top),
        left,
        width: dropW,
        zIndex: 9999,
      });
    }
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => (isOpen ? (setIsOpen(false), setSearch('')) : handleOpen())}
        className='w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs bg-white flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 hover:border-gray-300 transition-colors'
      >
        <span className={`truncate ${value ? 'text-gray-800' : 'text-gray-400'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className='bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden'
          >
            <div className='flex items-center gap-2 px-2.5 py-2 border-b border-gray-100 bg-gray-50/80'>
              <Search className='h-3.5 w-3.5 text-gray-400 flex-shrink-0' />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder='Search...'
                className='flex-1 text-xs text-gray-700 focus:outline-none bg-transparent placeholder-gray-400'
              />
            </div>
            <div className='max-h-52 overflow-y-auto'>
              <button
                onClick={() => handleSelect('')}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  !value ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                —
              </button>
              {filtered.map(option => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    value === option
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {option}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className='px-3 py-3 text-xs text-gray-400 text-center'>No matches</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
