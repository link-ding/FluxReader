import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

export default function PdfReader({ book, onTocReady, onProgressChange, onActiveChapterChange, jumpCallbackRef, initialPage, onTextSelection }) {
  const containerRef = useRef(null);
  const canvasRefs = useRef([]);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !book.filePath) return;
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      // Read file via Electron IPC (Uint8Array), pdfjs accepts it directly
      const uint8 = await window.electronAPI.getFileBuffer(book.filePath);
      const loadingTask = pdfjsLib.getDocument({ data: uint8 });
      const pdf = await loadingTask.promise;
      if (cancelled) return;

      setNumPages(pdf.numPages);

      // Build "TOC" as page list
      const pages = Array.from({ length: pdf.numPages }, (_, i) => ({
        title: `Page ${i + 1}`,
        href: null,
        pageNum: i + 1,
      }));
      onTocReady?.(pages);

      // Expose jump function
      if (jumpCallbackRef) {
        jumpCallbackRef.current = (item) => {
          const el = canvasRefs.current[item.pageNum - 1];
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      }

      // Render pages sequentially
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) break;
        const page = await pdf.getPage(i);
        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
        }).promise;
      }

      setLoading(false);

      // Restore scroll position after all pages rendered
      const saved = parseFloat(localStorage.getItem(`pdf-pos-${book.id}`) || '0');
      if (saved > 0) {
        const el = containerRef.current;
        if (el) el.scrollTop = saved * (el.scrollHeight - el.clientHeight);
      }
      if (initialPage) {
        requestAnimationFrame(() => {
          const page = Math.max(1, Math.min(pdf.numPages, Number(initialPage)));
          canvasRefs.current[page - 1]?.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
      }
    };

    loadPdf().catch(console.error);
    return () => { cancelled = true; };
  }, [book.id, book.filePath, initialPage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || numPages === 0) return;

    const onScroll = () => {
      const raw = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      const clamped = Math.min(1, Math.max(0, raw));
      onProgressChange?.(clamped);
      localStorage.setItem(`pdf-pos-${book.id}`, String(clamped));

      const midY = el.scrollTop + el.clientHeight / 2;
      let active = 0;
      canvasRefs.current.forEach((c, i) => {
        if (c && c.offsetTop <= midY) active = i;
      });
      onActiveChapterChange?.(active);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [numPages]);

  const handleSelectionCapture = () => {
    const text = window.getSelection?.()?.toString()?.trim();
    if (!text || text.length < 2) return;
    onTextSelection?.({
      text,
      chapter: `Page ${Math.max(1, activePageFromScroll(containerRef.current, canvasRefs.current))}`,
      pageNum: Math.max(1, activePageFromScroll(containerRef.current, canvasRefs.current)),
      format: 'PDF',
    });
  };

  return (
    <div
      ref={containerRef}
      onMouseUp={handleSelectionCapture}
      onKeyUp={handleSelectionCapture}
      style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--reader-bg)', position: 'relative' }}
    >
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--reader-fg-faint)', fontFamily: 'var(--ui-font)', fontSize: 13,
        }}>
          Loading PDF…
        </div>
      )}
      <div style={{ padding: '24px 48px 80px', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
        {Array.from({ length: numPages }, (_, i) => (
          <canvas
            key={i}
            ref={el => canvasRefs.current[i] = el}
            style={{
              maxWidth: '100%',
              boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
              borderRadius: 2,
              display: 'block',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function activePageFromScroll(container, canvases) {
  if (!container) return 1;
  const midY = container.scrollTop + container.clientHeight / 2;
  let active = 0;
  canvases.forEach((canvas, index) => {
    if (canvas && canvas.offsetTop <= midY) active = index;
  });
  return active + 1;
}
