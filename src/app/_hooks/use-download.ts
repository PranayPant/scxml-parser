'use client';

import { useCallback, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';

export function useDownload() {
  const content = useEditorStore(state => state.content);
  const fileInfo = useEditorStore(state => state.fileInfo);

  const downloadFilename = useMemo(() => fileInfo?.name ?? 'document.scxml', [fileInfo]);

  const downloadBlob = useCallback((fileContent: string, fileName: string) => {
    const blob = new Blob([fileContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadWithVisualData = useCallback(() => {
    downloadBlob(content, downloadFilename);
  }, [content, downloadBlob, downloadFilename]);

  const handleDownloadClean = useCallback(async () => {
    try {
      const { removeVisualMetadataFromXML } = await import('@/lib/utils/visual-metadata-utils');
      const { SCXMLParser: Parser } = await import('@/lib/parsers/scxml-parser');
      const cleanParser = new Parser();
      const parseResult = cleanParser.parse(content);
      const cleanName = downloadFilename.replace(/\.(scxml|xml)$/i, '-clean.$1');
      if (parseResult.success && parseResult.data) {
        downloadBlob(cleanParser.serialize(parseResult.data, false), cleanName);
      } else {
        downloadBlob(removeVisualMetadataFromXML(content), cleanName);
      }
    } catch {
      downloadBlob(content, downloadFilename);
    }
  }, [content, downloadBlob, downloadFilename]);

  return { handleDownloadClean, handleDownloadWithVisualData };
}
