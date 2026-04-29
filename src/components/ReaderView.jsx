import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import BookCover from './BookCover.jsx';
import EpubReader from './EpubReader.jsx';
import PdfReader from './PdfReader.jsx';
import Whiteboard from './Whiteboard.jsx';
import { getAnnotations, upsertAnnotation, removeAnnotation, generateMarkdown } from '../data/annotations.js';
import { addBoardCard } from '../data/board.js';

function ReaderToolbar({ book, onBack, progress, onOpenTweaks, mode, onModeChange }) {
  const handleClose = () => window.electronAPI?.windowClose();
  const handleMinimize = () => window.electronAPI?.windowMinimize();
  const handleMaximize = () => window.electronAPI?.windowMaximize();

  return (
    <div style={{
      height: 38, flexShrink: 0,
      padding: '0 14px',
      borderBottom: '0.5px solid var(--hairline)',
      background: 'var(--titlebar)',
      display: 'flex', alignItems: 'center', gap: 8,
      position: 'relative',
      WebkitAppRegion: 'drag',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', WebkitAppRegion: 'no-drag' }}>
        <div onClick={handleClose} style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5F57', border: '0.5px solid rgba(0,0,0,0.12)', cursor: 'pointer' }} />
        <div onClick={handleMinimize} style={{ width: 12, height: 12, borderRadius: '50%', background: '#FEBC2E', border: '0.5px solid rgba(0,0,0,0.12)', cursor: 'pointer' }} />
        <div onClick={handleMaximize} style={{ width: 12, height: 12, borderRadius: '50%', background: '#28C840', border: '0.5px solid rgba(0,0,0,0.12)', cursor: 'pointer' }} />
      </div>
      <div style={{ width: 12 }} />
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: 5,
        height: 24, padding: '0 10px 0 6px',
        border: '0.5px solid var(--hairline-strong)',
        borderRadius: 5, background: 'var(--input-bg)',
        fontFamily: 'var(--ui-font)', fontSize: 11,
        color: 'var(--fg-muted)', cursor: 'pointer',
        WebkitAppRegion: 'no-drag',
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6.5 2L3 5l3.5 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Library
      </button>
      <div style={{
        display: 'flex', gap: 2, padding: 2,
        background: 'var(--hover)',
        borderRadius: 6,
        WebkitAppRegion: 'no-drag',
      }}>
        {[
          { id: 'read', label: 'Read' },
          { id: 'board', label: 'Board' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => onModeChange(item.id)}
            style={{
              height: 22,
              padding: '0 11px',
              border: 'none',
              borderRadius: 4,
              background: mode === item.id ? 'var(--app-bg)' : 'transparent',
              boxShadow: mode === item.id ? '0 0.5px 1px rgba(0,0,0,0.1)' : 'none',
              color: mode === item.id ? 'var(--fg)' : 'var(--fg-muted)',
              fontFamily: 'var(--ui-font)',
              fontSize: 11,
              fontWeight: mode === item.id ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: 'var(--ui-font)', fontSize: 12, color: 'var(--fg-muted)',
        pointerEvents: 'none',
      }}>
        <span style={{ fontWeight: 500, color: 'var(--fg)' }}>{book.title}</span>
        <span style={{ color: 'var(--fg-faint)' }}>·</span>
        <span>{book.author}</span>
      </div>
      <div style={{ flex: 1 }} />
      {mode === 'read' ? (
        <div style={{ fontFamily: 'var(--mono-font)', fontSize: 11, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums', WebkitAppRegion: 'no-drag' }}>
          {Math.round(progress * 100)}%
        </div>
      ) : null}
      <button onClick={onOpenTweaks} style={{
        height: 24, padding: '0 10px',
        border: '0.5px solid var(--hairline-strong)',
        borderRadius: 5, background: 'var(--input-bg)',
        fontFamily: 'var(--ui-font)', fontSize: 11, color: 'var(--fg-muted)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        WebkitAppRegion: 'no-drag',
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1" /><path d="M5 1v1M5 8v1M1 5h1M8 5h1M2.2 2.2l.75.75M7.05 7.05l.75.75M7.8 2.2l-.75.75M2.95 7.05l-.75.75" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
        Settings
      </button>
    </div>
  );
}

const ANN_COLORS = { yellow: '#FFD600', green: '#4ADE80', blue: '#60A5FA', pink: '#F472B6' };
const isElectronCtx = typeof window !== 'undefined' && !!window.electronAPI;

function ReaderSidebar({
  book, toc, activeChapter, onJumpChapter, progress, collapsed, onToggle,
  annotations, notesFolder, onSelectNotesFolder, onDeleteAnnotation, onJumpToCfi,
  exportStatus, onExportNow,
}) {
  const [tab, setTab] = useState('contents');

  const byChapter = useMemo(() => {
    const map = {};
    for (const ann of (annotations || [])) {
      const ch = ann.chapter || 'General';
      if (!map[ch]) map[ch] = [];
      map[ch].push(ann);
    }
    return map;
  }, [annotations]);

  if (collapsed) {
    return (
      <div style={{
        width: 32, flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRight: '0.5px solid var(--hairline)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 10,
      }}>
        <button
          onClick={onToggle}
          title="Show sidebar"
          style={{ width: 22, height: 22, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', borderRadius: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--fg-muted)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-faint)'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3.5 2l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: 'var(--sidebar-bg)',
      borderRight: '0.5px solid var(--hairline)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--ui-font)', overflow: 'hidden',
    }}>
      {/* Book info */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '0.5px solid var(--hairline)', position: 'relative' }}>
        <button
          onClick={onToggle}
          title="Hide sidebar"
          style={{ position: 'absolute', right: 8, top: 8, width: 22, height: 22, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', borderRadius: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--fg-muted)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-faint)'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6.5 2L3 5l3.5 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flexShrink: 0, width: 64, height: 96, overflow: 'hidden', borderRadius: 2, boxShadow: '0 1px 2px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.1)' }}>
            {book.coverImage ? (
              <img src={book.coverImage} style={{ width: 64, height: 96, objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ transform: 'scale(0.356)', transformOrigin: 'top left', width: 180, height: 270 }}>
                <BookCover book={book} width={180} height={270} />
              </div>
            )}
          </div>
          <div style={{ minWidth: 0, paddingTop: 4 }}>
            <div style={{ fontFamily: 'var(--display-font)', fontSize: 14, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{book.title}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 }}>{book.author}</div>
            <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'var(--mono-font)', color: 'var(--fg-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{book.format}</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ height: 2, background: 'var(--hairline-strong)', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontFamily: 'var(--mono-font)', color: 'var(--fg-faint)', fontVariantNumeric: 'tabular-nums' }}>
            <span>{Math.round(progress * 100)}% read</span>
            <span>~{Math.max(1, Math.round((1 - progress) * 180))} min left</span>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid var(--hairline)', flexShrink: 0 }}>
        {['contents', 'highlights'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '9px 0',
              border: 'none', background: 'none',
              fontSize: 11, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--fg)' : 'var(--fg-faint)',
              cursor: 'pointer',
              borderBottom: tab === t ? '1.5px solid var(--accent)' : '1.5px solid transparent',
              marginBottom: -1,
              textTransform: 'capitalize',
              letterSpacing: '0.02em',
            }}
          >
            {t}{t === 'highlights' && annotations?.length ? ` · ${annotations.length}` : ''}
          </button>
        ))}
      </div>

      {/* Contents tab */}
      {tab === 'contents' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 0' }}>
          {toc.map((item, i) => {
            const level = item.level || 0;
            const isActive = i === activeChapter;
            const isSub = level > 0;
            return (
              <div
                key={i}
                onClick={() => onJumpChapter(i)}
                style={{
                  margin: '0 10px',
                  paddingTop: isSub ? 4 : 7, paddingBottom: isSub ? 4 : 7,
                  paddingLeft: 12 + level * 14, paddingRight: 12,
                  fontSize: isSub ? 11 : 12,
                  color: isActive ? 'var(--fg)' : isSub ? 'var(--fg-faint)' : 'var(--fg-muted)',
                  background: isActive ? 'var(--selected)' : 'transparent',
                  borderRadius: 5, cursor: 'pointer',
                  display: 'flex', gap: 8, alignItems: 'baseline',
                  fontWeight: isActive ? 500 : 400,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                {!isSub && <span style={{ fontFamily: 'var(--mono-font)', fontSize: 10, color: 'var(--fg-faint)', minWidth: 18, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>}
                {isSub && <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-faint)', flexShrink: 0, alignSelf: 'center', marginRight: 2 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
              </div>
            );
          })}
          {toc.length === 0 && <div style={{ padding: '8px 22px', fontSize: 12, color: 'var(--fg-faint)' }}>Loading contents…</div>}
        </div>
      )}

      {/* Highlights tab */}
      {tab === 'highlights' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {!annotations?.length ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 24px', color: 'var(--fg-faint)', textAlign: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ opacity: 0.35 }}>
                <path d="M6 8h16M6 12h12M6 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div style={{ fontSize: 12 }}>No highlights yet</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)', opacity: 0.7 }}>Select text in the book to highlight it</div>
            </div>
          ) : (
            <div style={{ padding: '10px 0' }}>
              {Object.entries(byChapter).map(([chapter, anns]) => (
                <div key={chapter}>
                  <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-faint)' }}>
                    {chapter}
                  </div>
                  {anns.map(ann => (
                    <div
                      key={ann.id}
                      onClick={() => onJumpToCfi?.(ann.cfi)}
                      style={{
                        margin: '2px 8px',
                        padding: '8px 8px 8px 12px',
                        borderRadius: 6, cursor: 'pointer',
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        borderLeft: `3px solid ${ANN_COLORS[ann.color] || ANN_COLORS.yellow}`,
                        background: 'transparent',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, color: 'var(--fg)',
                          lineHeight: 1.45,
                          display: '-webkit-box', WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {ann.text}
                        </div>
                        {ann.note && (
                          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ann.note}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4, fontFamily: 'var(--mono-font)' }}>
                          {ann.createdAt.slice(0, 10)}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteAnnotation?.(ann.id); }}
                        title="Remove highlight"
                        style={{ flexShrink: 0, width: 18, height: 18, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-faint)', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = 'var(--hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-faint)'; e.currentTarget.style.background = 'none'; }}
                      >×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Notes export folder */}
          {isElectronCtx && (
            <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--hairline)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7 }}>
                <div style={{ flex: 1, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-faint)' }}>
                  Obsidian / Notes folder
                </div>
                {exportStatus === 'ok' && (
                  <span style={{ fontSize: 10, color: '#16A34A', fontFamily: 'var(--mono-font)' }}>✓ Exported</span>
                )}
                {exportStatus === 'error' && (
                  <span style={{ fontSize: 10, color: '#DC2626', fontFamily: 'var(--mono-font)' }}>✗ Failed</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: notesFolder ? 6 : 0 }}>
                <div style={{ flex: 1, fontSize: 11, color: notesFolder ? 'var(--fg-muted)' : 'var(--fg-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono-font)' }}>
                  {notesFolder ? notesFolder.split('/').pop() : 'Not set — choose a folder'}
                </div>
                <button
                  onClick={onSelectNotesFolder}
                  style={{ flexShrink: 0, fontSize: 11, padding: '3px 9px', border: '0.5px solid var(--hairline-strong)', borderRadius: 4, background: 'var(--hover)', color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'var(--ui-font)' }}
                >
                  Choose…
                </button>
              </div>
              {notesFolder && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, fontSize: 10, color: 'var(--fg-faint)', fontFamily: 'var(--mono-font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {notesFolder}
                  </div>
                  <button
                    onClick={onExportNow}
                    style={{ flexShrink: 0, fontSize: 11, padding: '3px 9px', border: '0.5px solid var(--hairline-strong)', borderRadius: 4, background: 'var(--hover)', color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'var(--ui-font)' }}
                  >
                    Export
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Demo text reader (for built-in sample books) ───────────────────
function DemoContent({ book, onProgressChange, onActiveChapterChange, jumpRef }) {
  const scrollRef = useRef(null);
  const chapterRefs = useRef([]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = parseFloat(localStorage.getItem(`reader-pos-${book.id}`) || '0');
    requestAnimationFrame(() => { el.scrollTop = saved * (el.scrollHeight - el.clientHeight); });
  }, [book.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
        onProgressChange?.(Math.min(1, Math.max(0, p)));
        localStorage.setItem(`reader-pos-${book.id}`, String(p));
        const mid = el.scrollTop + 80;
        let active = 0;
        chapterRefs.current.forEach((r, i) => { if (r && r.offsetTop <= mid) active = i; });
        onActiveChapterChange?.(active);
      });
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [book.id]);

  if (jumpRef) {
    jumpRef.current = (item) => {
      const r = chapterRefs.current[item.index ?? 0];
      if (r && scrollRef.current) scrollRef.current.scrollTo({ top: r.offsetTop - 20, behavior: 'smooth' });
    };
  }

  return (
    <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', background: 'var(--reader-bg)', color: 'var(--reader-fg)' }}>
      <div style={{ maxWidth: 'var(--reader-width)', margin: '0 auto', padding: '80px 48px 160px' }}>
        <div style={{ paddingBottom: 80, marginBottom: 48, borderBottom: '0.5px solid var(--reader-hairline)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono-font)', fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--reader-fg-muted)', marginBottom: 40 }}>{book.author}</div>
          <div style={{ fontFamily: 'var(--reader-font)', fontSize: 42, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--reader-fg)' }}>{book.title}</div>
          <div style={{ width: 32, height: 1, background: 'var(--accent)', margin: '36px auto 0' }} />
        </div>
        {(book.chapters || []).map((chapter, ci) => (
          <div key={ci} ref={r => chapterRefs.current[ci] = r} style={{ marginBottom: 72 }}>
            <div style={{ fontFamily: 'var(--mono-font)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--reader-fg-faint)', marginBottom: 8 }}>Chapter {ci + 1}</div>
            <div style={{ fontFamily: 'var(--reader-font)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--reader-fg)', marginBottom: 40, lineHeight: 1.1 }}>{chapter.title}</div>
            {(chapter.paragraphs || []).map((p, pi) => (
              <p key={pi} style={{ fontFamily: 'var(--reader-font)', fontSize: 'var(--reader-size)', lineHeight: 'var(--reader-leading)', color: 'var(--reader-fg)', margin: '0 0 1em', textIndent: pi === 0 ? 0 : '1.4em', textAlign: 'justify', hyphens: 'auto' }}>
                {pi === 0 && ci === 0 ? (
                  <><span style={{ fontFamily: 'var(--reader-font)', float: 'left', fontSize: '3.4em', lineHeight: 0.85, paddingRight: '0.08em', paddingTop: '0.1em', color: 'var(--accent)', fontWeight: 500 }}>{p[0]}</span>{p.slice(1)}</>
                ) : p}
              </p>
            ))}
          </div>
        ))}
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--reader-fg-faint)' }}>
          <div style={{ width: 24, height: 1, background: 'var(--reader-hairline)', margin: '0 auto 18px' }} />
          <div style={{ fontFamily: 'var(--mono-font)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase' }}>End of Excerpt</div>
        </div>
      </div>
    </div>
  );
}

function AiChatSidebar({ book, collapsed, onToggle }) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(() => ([
    {
      role: 'assistant',
      text: '选择一段文字，或直接问我这本书里的问题。',
    },
  ]));

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setMessages(prev => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: 'AI 回答通道还没有连接。界面已经准备好，之后可以接入真实模型。' },
    ]);
  };

  if (collapsed) {
    return (
      <div style={{
        width: 36,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderLeft: '0.5px solid var(--hairline)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 10,
        fontFamily: 'var(--ui-font)',
      }}>
        <button
          onClick={onToggle}
          title="Show AI Chat"
          style={{
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-faint)',
            cursor: 'pointer',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.background = 'var(--hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-faint)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 3.5A2 2 0 014.5 1.5h5a2 2 0 012 2v3.8a2 2 0 01-2 2H6.2L3.5 12v-2.7h-1V3.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          marginTop: 12,
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-faint)',
          fontFamily: 'var(--mono-font)',
        }}>
          AI Chat
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: 320,
      flexShrink: 0,
      background: 'var(--sidebar-bg)',
      borderLeft: '0.5px solid var(--hairline)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--ui-font)',
      color: 'var(--fg)',
      minWidth: 0,
    }}>
      <div style={{
        height: 46,
        padding: '0 12px 0 16px',
        borderBottom: '0.5px solid var(--hairline)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: 'var(--selected)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.8l.8 2.6 2.6.8-2.6.8L7 8.6 6.2 6 3.6 5.2l2.6-.8L7 1.8z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
            <path d="M10.2 8.5l.45 1.35 1.35.45-1.35.45-.45 1.35-.45-1.35-1.35-.45 1.35-.45.45-1.35z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>AI Chat</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {book.title}
          </div>
        </div>
        <button
          onClick={onToggle}
          title="Hide AI Chat"
          style={{
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-faint)',
            cursor: 'pointer',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.background = 'var(--hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-faint)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6.5 2L3 5l3.5 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--hairline)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Summarize', 'Explain', 'Make notes'].map(action => (
            <button
              key={action}
              onClick={() => setDraft(action)}
              style={{
                height: 24,
                padding: '0 9px',
                border: '0.5px solid var(--hairline-strong)',
                borderRadius: 5,
                background: 'var(--input-bg)',
                color: 'var(--fg-muted)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={index}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                padding: '9px 10px',
                borderRadius: 8,
                border: isUser ? 'none' : '0.5px solid var(--hairline)',
                background: isUser ? 'var(--accent)' : 'var(--input-bg)',
                color: isUser ? '#fff' : 'var(--fg-muted)',
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {message.text}
            </div>
          );
        })}
      </div>

      <div style={{
        padding: 12,
        borderTop: '0.5px solid var(--hairline)',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask about this book"
          rows={2}
          style={{
            flex: 1,
            minWidth: 0,
            maxHeight: 90,
            resize: 'none',
            border: '0.5px solid var(--hairline-strong)',
            borderRadius: 7,
            background: 'var(--input-bg)',
            color: 'var(--fg)',
            padding: '8px 9px',
            fontFamily: 'var(--ui-font)',
            fontSize: 12,
            lineHeight: 1.35,
            outline: 'none',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!draft.trim()}
          title="Send"
          style={{
            width: 30,
            height: 30,
            border: 'none',
            borderRadius: 7,
            background: draft.trim() ? 'var(--accent)' : 'var(--selected)',
            color: draft.trim() ? '#fff' : 'var(--fg-faint)',
            cursor: draft.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h9M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main ReaderView ────────────────────────────────────────────────
export default function ReaderView({ book, onBack, onOpenTweaks, notesFolder, onSetNotesFolder, initialLocationCfi, initialSearchTarget }) {
  const [progress, setProgress] = useState(book.progress || 0);
  const [activeChapter, setActiveChapter] = useState(0);
  const [annotations, setAnnotations] = useState(() => getAnnotations(book.id));
  const [exportStatus, setExportStatus] = useState(null); // null | 'ok' | 'error'

  const handleProgressChange = (p) => {
    setProgress(p);
    if (book.isRealFile && book.filePath) {
      localStorage.setItem(`epub-progress-${book.filePath}`, String(p));
    }
  };
  const [toc, setToc] = useState(
    book.chapters ? book.chapters.map((c, i) => ({ title: c.title, index: i })) : []
  );
  const [readerMode, setReaderMode] = useState('read');
  const [boardJumpTarget, setBoardJumpTarget] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiChatCollapsed, setAiChatCollapsed] = useState(false);
  const jumpCallbackRef = useRef(null);
  const jumpToCfiRef = useRef(null);

  const handleSelectNotesFolder = useCallback(async () => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.selectFolder();
    if (folder) onSetNotesFolder?.(folder);
  }, [onSetNotesFolder]);

  const handleJumpToCfi = useCallback((cfi) => {
    jumpToCfiRef.current?.(cfi);
  }, []);

  const exportNotes = useCallback(async (anns) => {
    if (!notesFolder || !window.electronAPI) return;
    const safe = book.title.replace(/[/\\?%*:|"<>]/g, '-');
    const result = await window.electronAPI.writeFile(`${notesFolder}/${safe}.md`, generateMarkdown(book, anns));
    setExportStatus(result?.ok ? 'ok' : 'error');
    setTimeout(() => setExportStatus(null), 3000);
  }, [notesFolder, book]);

  const handleAnnotationCreate = useCallback((ann) => {
    const updated = upsertAnnotation(book.id, ann);
    setAnnotations(updated);
    exportNotes(updated);
  }, [book.id, exportNotes]);

  const handleAnnotationDelete = useCallback((annId) => {
    const updated = removeAnnotation(book.id, annId);
    setAnnotations(updated);
    exportNotes(updated);
  }, [book.id, exportNotes]);

  const handleJump = (i) => {
    if (jumpCallbackRef.current) jumpCallbackRef.current(toc[i]);
  };

  const handleAddSelectionToBoard = useCallback(({ text, chapter, cfi }) => {
    addBoardCard(book.id, {
      quote: text,
      note: '',
      source: chapter || 'Selection',
      cfi,
    });
    setReaderMode('board');
  }, [book.id]);

  const handleOpenBoardSource = useCallback((card) => {
    if (!card?.cfi && !card?.href && !card?.pageNum && !card?.source) return;
    const sourceHref = card?.source
      ? toc.find(item => item.title === card.source)?.href
      : null;
    setBoardJumpTarget({
      cfi: card.cfi || null,
      href: card.href || sourceHref || null,
      pageNum: card.pageNum || null,
    });
    setReaderMode('read');
  }, [toc]);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--app-bg)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <ReaderToolbar book={book} onBack={onBack} progress={progress} onOpenTweaks={onOpenTweaks} mode={readerMode} onModeChange={setReaderMode} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        <ReaderSidebar
          book={book}
          toc={toc}
          activeChapter={activeChapter}
          onJumpChapter={handleJump}
          progress={progress}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
          annotations={annotations}
          notesFolder={notesFolder}
          onSelectNotesFolder={handleSelectNotesFolder}
          onDeleteAnnotation={handleAnnotationDelete}
          onJumpToCfi={handleJumpToCfi}
          exportStatus={exportStatus}
          onExportNow={() => exportNotes(annotations)}
        />
        {readerMode === 'board' ? (
          <Whiteboard book={book} onOpenSource={handleOpenBoardSource} />
        ) : book.isRealFile ? (
            book.format === 'PDF' ? (
              <PdfReader
                book={book}
                onTocReady={setToc}
                onProgressChange={handleProgressChange}
                onActiveChapterChange={setActiveChapter}
                jumpCallbackRef={jumpCallbackRef}
                initialPage={boardJumpTarget?.pageNum || initialSearchTarget?.pageNum}
              />
            ) : (
              <EpubReader
                book={book}
                onTocReady={setToc}
                onProgressChange={handleProgressChange}
                onActiveChapterChange={setActiveChapter}
                jumpCallbackRef={jumpCallbackRef}
                jumpToCfiRef={jumpToCfiRef}
                initialLocationCfi={boardJumpTarget?.cfi || initialLocationCfi}
                initialLocationHref={boardJumpTarget?.href || initialSearchTarget?.href}
                annotations={annotations}
                onAnnotationCreate={handleAnnotationCreate}
                onAnnotationDelete={handleAnnotationDelete}
                onAddSelectionToBoard={handleAddSelectionToBoard}
              />
            )
        ) : (
          <DemoContent
            book={book}
            onProgressChange={handleProgressChange}
            onActiveChapterChange={setActiveChapter}
            jumpRef={jumpCallbackRef}
          />
        )}
        <AiChatSidebar
          book={book}
          collapsed={aiChatCollapsed}
          onToggle={() => setAiChatCollapsed(v => !v)}
        />
      </div>
    </div>
  );
}
