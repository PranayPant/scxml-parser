'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { SCXMLParser, SCXMLValidator } from '@/lib';
import { useEditorStore } from '@/stores/editor-store';

export function useContentValidation() {
  const { content, setErrors } = useEditorStore();
  const parser = useMemo(() => new SCXMLParser(), []);
  const validator = useMemo(() => new SCXMLValidator(), []);

  const validateContent = useCallback(
    (xmlContent: string) => {
      if (!xmlContent.trim()) {
        setErrors([]);
        return;
      }
      const parseResult = parser.parse(xmlContent);
      let allErrors = [...parseResult.errors];
      if (parseResult.success && parseResult.data) {
        const validationErrors = validator.validate(parseResult.data.scxml, xmlContent);
        allErrors = [...allErrors, ...validationErrors];
      }
      setErrors(allErrors);
    },
    [parser, validator, setErrors]
  );

  useEffect(() => {
    const timer = setTimeout(() => validateContent(content), 500);
    return () => clearTimeout(timer);
  }, [content, validateContent]);
}
