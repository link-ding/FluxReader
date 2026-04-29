import { useEffect, useRef, useState, useCallback } from 'react';
import ePub from 'epubjs';
import AnnotationToolbar from './AnnotationToolbar.jsx';

const COLOR_HEX = {
  yellow: '#FFD600',
  green:  '#4ADE80',
  blue:   '#60A5FA',
  pink:   '#F472B6',
};
const BUTTON_EDGE_ZONE_PX = 120;

function buildThemeCSS() {
  const s = getComputedStyle(document.documentElement);
  const get = (v) => s.getPropertyValue(v).trim();
  return `
    html, body {
      margin: 0 !important; padding: 0 !important;
      background: ${get('--reader-bg') || '#FDFCF9'} !important;
    }
    body {
      font-family: ${get('--reader-font') || 'Georgia, serif'} !important;
      font-size: ${get('--reader-size') || '17px'} !important;
      line-height: ${get('--reader-leading') || '1.55'} !important;
      color: ${get('--reader-fg') || '#1C1C1A'} !important;
      padding: 40px 56px !important;
      -webkit-font-smoothing: antialiased !important;
    }
    p { text-align: justify; hyphens: auto; margin: 0 0 1em; }
    img { max-width: 100%; height: auto; }
    h1,h2,h3,h4,h5,h6 {
      font-family: ${get('--reader-font') || 'Georgia, serif'};
      color: ${get('--reader-fg') || '#1C1C1A'};
    }
    a { color: ${get('--accent') || '#8B5E3C'}; text-decoration: none; }
    * { box-sizing: border-box; }
  `;
}


export default function EpubReader({
  book,
  onTocReady,
  onProgressChange,
  onActiveChapterChange,
  jumpCallbackRef,
  annotations,
  onAnnotationCreate,
  onAnnotationDelete,
  onAddSelectionToBoard,
  onTextSelection,
  jumpToCfiRef,
  initialLocationCfi,
  initialLocationHref,
}) {
  const rootRef = useRef(null);
  const containerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const resizeRafRef = useRef(null);
  const lastMeasuredSizeRef = useRef({ width: 0, height: 0 });
  const [status, setStatus] = useState('loading');
  const tocRef = useRef([]);
  const currentChapterRef = useRef('');
  const annotationsRef = useRef(annotations);

  const [selection, setSelection] = useState(null);
  const [clickedAnn, setClickedAnn] = useState(null); // full annotation + position
  const [activeEdge, setActiveEdge] = useState(null);
  const lastClickPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
  const suppressNextClickRef = useRef(false);

  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

  const updateActiveEdgeFromClientX = useCallback((clientX) => {
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect) return;
    const offsetX = clientX - rootRect.left;
    const width = rootRect.width;

    if (offsetX <= BUTTON_EDGE_ZONE_PX) {
      setActiveEdge('left');
    } else if (offsetX >= width - BUTTON_EDGE_ZONE_PX) {
      setActiveEdge('right');
    } else {
      setActiveEdge(null);
    }
  }, []);

  const injectTheme = useCallback(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const css = buildThemeCSS();
    try { rendition.themes.default(css); } catch (_) {}
    try {
      rendition.views().forEach(view => {
        const doc = view.document ?? view.contents?.document;
        if (!doc?.head) return;
        let el = doc.getElementById('lr-theme');
        if (!el) { el = doc.createElement('style'); el.id = 'lr-theme'; doc.head.appendChild(el); }
        el.textContent = css;
      });
    } catch (_) {}
  }, []);

  const goNext = useCallback(() => renditionRef.current?.next(), []);
  const goPrev = useCallback(() => renditionRef.current?.prev(), []);

  const handleReaderMouseMove = useCallback((event) => {
    updateActiveEdgeFromClientX(event.clientX);
  }, [updateActiveEdgeFromClientX]);

  // Position comes from lastClickPosRef which is updated by mousedown inside the iframe.
  // We don't use the SVG click event's e.clientX/Y because those coords are unreliable
  // for marks-pane elements inside iframes.
  const handleHighlightClick = useCallback((annId) => {
    const ann = annotationsRef.current?.find(a => a.id === annId);
    if (!ann) return;
    setSelection(null);
    setClickedAnn({ ...ann, position: { ...lastClickPosRef.current } });
  }, []);

  // Apply highlights directly on a view — bypasses rendition.annotations registry
  // to avoid _annotationsBySectionIndex accumulating duplicate hashes.
  const applyHighlightsToView = useCallback((view) => {
    for (const ann of annotationsRef.current || []) {
      try {
        view.unhighlight(ann.cfi);
        view.highlight(
          ann.cfi,
          { id: ann.id },
          () => handleHighlightClick(ann.id),
          `hl-${ann.color}`,
          { fill: COLOR_HEX[ann.color] || COLOR_HEX.yellow, 'fill-opacity': '0.35' }
        );
      } catch (_) {
        // CFI doesn't belong to this section — silent skip
      }
    }
  }, [handleHighlightClick]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  useEffect(() => {
    if (!containerRef.current || !book.filePath) return;
    let destroyed = false;

    const load = async () => {
      try {
        setStatus('loading');
        const uint8 = await window.electronAPI.getFileBuffer(book.filePath);
        if (destroyed) return;

        const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
        const epubBook = ePub(arrayBuffer);
        bookRef.current = epubBook;

        const rendition = epubBook.renderTo(containerRef.current, {
          flow: 'paginated',
          spread: 'none',
          width: '100%',
          height: '100%',
        });
        renditionRef.current = rendition;
        rendition.themes.default(buildThemeCSS());

        rendition.on('rendered', (_section, view) => {
          if (destroyed) return;
          // Inject theme
          try {
            const doc = view.document ?? view.contents?.document;
            if (doc?.head) {
              let el = doc.getElementById('lr-theme');
              if (!el) { el = doc.createElement('style'); el.id = 'lr-theme'; doc.head.appendChild(el); }
              el.textContent = buildThemeCSS();
            }
          } catch (_) {}
          setStatus('ready');

          // Track mouse position inside iframe so highlight-click popups appear correctly.
          try {
            const contentDoc = view.document ?? view.contents?.document;
            if (contentDoc) {
              const frameElement = contentDoc.defaultView?.frameElement;
              const handleFrameMouseMove = (e) => {
                const iframeRect = frameElement?.getBoundingClientRect();
                if (!iframeRect) return;
                updateActiveEdgeFromClientX(iframeRect.left + e.clientX);
              };

              contentDoc.addEventListener('mousedown', (e) => {
                const iframeRect = frameElement?.getBoundingClientRect() || { left: 0, top: 0 };
                lastClickPosRef.current = {
                  x: iframeRect.left + e.clientX,
                  y: iframeRect.top + e.clientY,
                };
              });
              contentDoc.addEventListener('mousemove', handleFrameMouseMove);
            }
          } catch (_) {}

          // Apply highlights after layout is computed — one RAF is enough since
          // we call unhighlight() first, so re-renders never stack extra layers.
          requestAnimationFrame(() => {
            if (!destroyed) applyHighlightsToView(view);
          });
        });

        rendition.on('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
          if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goPrev();
        });

        // Build TOC
        epubBook.loaded.navigation.then((nav) => {
          if (destroyed) return;
          const flatten = (items, level = 0) => {
            const result = [];
            for (const item of (items || [])) {
              result.push({ title: item.label?.trim() || '—', href: item.href, level });
              if (item.subitems?.length) result.push(...flatten(item.subitems, level + 1));
            }
            return result;
          };
          tocRef.current = flatten(nav.toc);
          onTocReady?.(tocRef.current);
        });

        let locationsReady = false;
        rendition.on('relocated', (loc) => {
          if (destroyed || !loc?.start?.cfi) return;
          localStorage.setItem(`epub-cfi-${book.id}`, loc.start.cfi);
          setSelection(null);
          setClickedAnn(null);

          if (locationsReady) {
            const pct = epubBook.locations.percentageFromCfi(loc.start.cfi);
            onProgressChange?.(typeof pct === 'number' ? pct : 0);
          }

          const toc = tocRef.current;
          if (toc.length > 0 && loc.start.href) {
            const currentBase = loc.start.href.split('#')[0].split('/').pop();
            let matched = -1;
            for (let i = toc.length - 1; i >= 0; i--) {
              const tocBase = (toc[i].href || '').split('#')[0].split('/').pop();
              if (tocBase && currentBase && tocBase === currentBase) { matched = i; break; }
            }
            if (matched >= 0) {
              onActiveChapterChange?.(matched);
              currentChapterRef.current = toc[matched]?.title || '';
            }
          }
        });

        epubBook.ready.then(() => {
          epubBook.locations.generate(1024).then(() => {
            locationsReady = true;
            const cfi = localStorage.getItem(`epub-cfi-${book.id}`);
            if (cfi) {
              const pct = epubBook.locations.percentageFromCfi(cfi);
              onProgressChange?.(typeof pct === 'number' ? pct : 0);
            }
          });
        });

        // Selection → toolbar
        rendition.on('selected', (cfiRange, contents) => {
          if (destroyed) return;
          try {
            const sel = contents.window.getSelection();
            const text = sel?.toString().trim();
            if (!text || text.length < 2) return;

            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const iframeRect = contents.window?.frameElement?.getBoundingClientRect() || { left: 0, top: 0 };

            suppressNextClickRef.current = true;
            setClickedAnn(null);
            setSelection({
              cfi: cfiRange, text,
              chapter: currentChapterRef.current,
              position: {
                x: iframeRect.left + rect.left + rect.width / 2,
                y: iframeRect.top + rect.top,
              },
            });
            onTextSelection?.({
              text,
              cfi: cfiRange,
              chapter: currentChapterRef.current,
              format: 'EPUB',
            });
          } catch (_) {}
        });

        rendition.on('click', (event) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }

          if (event.target?.closest?.('a')) return;

          setSelection(null);
          setClickedAnn(null);
        });

        if (jumpCallbackRef) {
          jumpCallbackRef.current = (item) => {
            if (!item?.href || !renditionRef.current) return;
            renditionRef.current.display(item.href).catch(() => {
              renditionRef.current?.display(item.href.split('#')[0]);
            });
          };
        }

        if (jumpToCfiRef) {
          jumpToCfiRef.current = (cfi) => {
            if (!cfi || !renditionRef.current) return;
            renditionRef.current.display(cfi).catch(() => {});
          };
        }

        const saved = localStorage.getItem(`epub-cfi-${book.id}`);
        rendition.display(initialLocationCfi || initialLocationHref || saved || undefined);

      } catch (err) {
        console.error('EpubReader error:', err);
        if (!destroyed) setStatus('error');
      }
    };

    load();
    return () => {
      destroyed = true;
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      try { renditionRef.current?.destroy(); } catch (_) {}
      try { bookRef.current?.destroy(); } catch (_) {}
    };
  }, [book.id, book.filePath, initialLocationCfi, initialLocationHref, onTextSelection, updateActiveEdgeFromClientX]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const resizeRendition = (width, height) => {
      const rendition = renditionRef.current;
      if (!rendition || width < 1 || height < 1) return;

      const last = lastMeasuredSizeRef.current;
      if (last.width === width && last.height === height) return;
      lastMeasuredSizeRef.current = { width, height };

      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        try {
          const loc = rendition.currentLocation?.();
          const cfi = loc?.start?.cfi;
          rendition.resize(width, height, cfi);
        } catch (_) {}
      });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      resizeRendition(Math.round(width), Math.round(height));
    });

    observer.observe(el);
    const rect = el.getBoundingClientRect();
    resizeRendition(Math.round(rect.width), Math.round(rect.height));

    return () => {
      observer.disconnect();
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(injectTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, [injectTheme]);

  const handleHighlightSave = ({ color, note }) => {
    if (!selection || !renditionRef.current) return;
    const ann = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      bookId: book.id,
      cfi: selection.cfi,
      text: selection.text,
      chapter: selection.chapter,
      note,
      color,
      createdAt: new Date().toISOString(),
    };
    applyAnnToViews(ann);
    setSelection(null);
    onAnnotationCreate?.(ann);
  };

  const handleAddSelectionToBoard = () => {
    if (!selection) return;
    const existingHighlight = annotationsRef.current?.find(ann => ann.cfi === selection.cfi);
    if (existingHighlight) {
      applyAnnToViews(existingHighlight);
    } else {
      const ann = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        bookId: book.id,
        cfi: selection.cfi,
        text: selection.text,
        chapter: selection.chapter,
        note: '',
        color: 'yellow',
        createdAt: new Date().toISOString(),
      };
      applyAnnToViews(ann);
      onAnnotationCreate?.(ann);
    }
    onAddSelectionToBoard?.({
      text: selection.text,
      chapter: selection.chapter,
      cfi: selection.cfi,
    });
    setSelection(null);
  };

  const applyAnnToViews = (ann) => {
    try {
      const views = renditionRef.current?.views();
      views?.forEach(view => {
        try {
          view.unhighlight(ann.cfi);
          view.highlight(
            ann.cfi, { id: ann.id },
            () => handleHighlightClick(ann.id),
            `hl-${ann.color}`,
            { fill: COLOR_HEX[ann.color] || COLOR_HEX.yellow, 'fill-opacity': '0.35' }
          );
        } catch (_) {}
      });
    } catch (_) {}
  };

  const handleEditSave = ({ color, note }) => {
    if (!clickedAnn) return;
    const updated = { ...clickedAnn, color, note };
    delete updated.position; // don't store position in the annotation data
    applyAnnToViews(updated);
    setClickedAnn(null);
    onAnnotationCreate?.(updated); // upsertAnnotation handles update by id
  };

  const handleDelete = () => {
    if (!clickedAnn) return;
    try {
      const views = renditionRef.current?.views();
      views?.forEach(view => {
        try { view.unhighlight(clickedAnn.cfi); } catch (_) {}
      });
    } catch (_) {}
    const id = clickedAnn.id;
    setClickedAnn(null);
    onAnnotationDelete?.(id);
  };

  return (
    <div
      ref={rootRef}
      style={{ flex: 1, minWidth: 0, overflow: 'hidden', background: 'var(--reader-bg)', position: 'relative', display: 'flex' }}
      onMouseMove={handleReaderMouseMove}
      onMouseLeave={() => setActiveEdge(null)}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', minWidth: 0, overflow: 'hidden' }} />

      {status === 'ready' && (
        <>
          <button
            onClick={goPrev}
            aria-label="Previous page"
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: `translateY(-50%) ${activeEdge === 'left' ? 'scale(1)' : 'scale(0.98)'}`,
              width: 34,
              height: 56,
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 999,
              background: 'rgba(250, 247, 241, 0.88)',
              color: 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 12,
              opacity: activeEdge === 'left' ? 1 : 0,
              pointerEvents: activeEdge === 'left' ? 'auto' : 'none',
              boxShadow: activeEdge === 'left' ? '0 8px 20px rgba(0,0,0,0.08)' : 'none',
              transition: 'opacity 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease',
              backdropFilter: 'blur(10px)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            onClick={goNext}
            aria-label="Next page"
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: `translateY(-50%) ${activeEdge === 'right' ? 'scale(1)' : 'scale(0.98)'}`,
              width: 34,
              height: 56,
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 999,
              background: 'rgba(250, 247, 241, 0.88)',
              color: 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 12,
              opacity: activeEdge === 'right' ? 1 : 0,
              pointerEvents: activeEdge === 'right' ? 'auto' : 'none',
              boxShadow: activeEdge === 'right' ? '0 8px 20px rgba(0,0,0,0.08)' : 'none',
              transition: 'opacity 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease',
              backdropFilter: 'blur(10px)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}

      {selection && (
        <AnnotationToolbar
          position={selection.position}
          onSave={handleHighlightSave}
          onAddToBoard={handleAddSelectionToBoard}
          onDismiss={() => setSelection(null)}
        />
      )}

      {clickedAnn && (
        <AnnotationToolbar
          position={clickedAnn.position}
          initialColor={clickedAnn.color}
          initialNote={clickedAnn.note || ''}
          onSave={handleEditSave}
          onDelete={handleDelete}
          onDismiss={() => setClickedAnn(null)}
        />
      )}

      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--reader-bg)', color: 'var(--reader-fg-faint)',
          fontFamily: 'var(--ui-font)', fontSize: 13, pointerEvents: 'none',
        }}>
          Loading…
        </div>
      )}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--reader-bg)', color: 'var(--reader-fg-faint)',
          fontFamily: 'var(--ui-font)', fontSize: 13,
        }}>
          Could not open this EPUB file.
        </div>
      )}
    </div>
  );
}
