// Configures Monaco Editor to run fully offline — no CDN dependencies.
// Call ensureMonacoConfigured() before the first <Editor> component mounts.
// Safe to call multiple times; runs the async setup exactly once.

import { loader } from '@monaco-editor/react';

let setupPromise: Promise<void> | null = null;

export function ensureMonacoConfigured(): Promise<void> {
  if (setupPromise !== null) return setupPromise;

  setupPromise = (async () => {
    if (typeof window === 'undefined') return;

    // Declare MonacoEnvironment before importing monaco so it's in place
    // when the editor core initialises its worker infrastructure.
    // This project uses XML mode only — the basic editor worker covers it.
    // The `new URL(...)` form is detected by Turbopack/webpack at build time;
    // they emit a separate worker chunk in _next/static/chunks/.
    (window as any).MonacoEnvironment = {
      getWorker(_moduleId: string, _label: string): Worker {
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/editor/editor.worker',
            import.meta.url
          )
        );
      },
    };

    // Import monaco from the locally installed package.
    // loader.config({ monaco }) tells @monaco-editor/react to use this
    // local module instead of fetching from cdn.jsdelivr.net.
    const monaco = await import('monaco-editor');
    loader.config({ monaco });
  })();

  return setupPromise;
}
