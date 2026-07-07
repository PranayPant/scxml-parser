'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import { HistoryManager } from '@/lib/history/history-manager';
import { DEFAULT_SCXML_TEMPLATE } from '@/lib/consts/default_scxml_template';
import { useEditorStore } from '@/stores/editor-store';
import { usePanelStore } from '@/stores/panel-store';
import type { FileInfo, ValidationError } from '@/types/common';

export function useFileOperations() {
  const { setContent, setErrors, setFileInfo, navigateToRoot } = useEditorStore();
  const { setActivePanel } = usePanelStore();
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileLoad = useCallback(
    (loadedFileInfo: FileInfo) => {
      setFileInfo(loadedFileInfo);
      historyManager.initialize(loadedFileInfo.content, `Loaded ${loadedFileInfo.name}`);
      navigateToRoot();
    },
    [setFileInfo, historyManager, navigateToRoot]
  );

  const handleFileError = useCallback(
    (errorMessages: string[]) => {
      const fileErrors: ValidationError[] = errorMessages.map((message) => ({
        message,
        severity: 'error' as const,
      }));
      setErrors(fileErrors);
      setActivePanel('validation');
    },
    [setErrors, setActivePanel]
  );

  const handleCreateNewDocument = useCallback(() => {
    const newFileInfo: FileInfo = {
      name: 'new-document.scxml',
      size: DEFAULT_SCXML_TEMPLATE.length,
      lastModified: new Date(),
      content: DEFAULT_SCXML_TEMPLATE,
    };
    setContent(DEFAULT_SCXML_TEMPLATE);
    setFileInfo(newFileInfo);
    setErrors([]);
    historyManager.initialize(DEFAULT_SCXML_TEMPLATE, 'New document created');
    navigateToRoot();
  }, [setContent, setFileInfo, setErrors, historyManager, navigateToRoot]);

  const handleNewFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        setErrors([{ message: 'File size too large. Maximum size is 10MB.', severity: 'error' }]);
        setActivePanel('validation');
        return;
      }
      if (!file.name.match(/\.(scxml|xml)$/i)) {
        setErrors([{ message: 'Invalid file type. Please select an SCXML or XML file.', severity: 'error' }]);
        setActivePanel('validation');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const fileContent = e.target?.result as string;
        if (fileContent) {
          const uploadedFileInfo: FileInfo = {
            name: file.name,
            size: file.size,
            lastModified: new Date(file.lastModified),
            content: fileContent,
          };
          setContent(fileContent);
          setFileInfo(uploadedFileInfo);
          setErrors([]);
          historyManager.initialize(fileContent, `Uploaded ${file.name}`);
        }
      };
      reader.onerror = () => {
        setErrors([{ message: 'Failed to read file. Please try again.', severity: 'error' }]);
        setActivePanel('validation');
      };
      reader.readAsText(file);
      event.target.value = '';
    },
    [setContent, setFileInfo, setErrors, setActivePanel, historyManager]
  );

  return {
    fileInputRef,
    handleFileLoad,
    handleFileError,
    handleCreateNewDocument,
    handleNewFileUpload,
    handleFileInputChange,
  };
}
