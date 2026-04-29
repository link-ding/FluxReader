import { useState, useRef, useEffect } from 'react';

const COLORS = [
  { id: 'yellow', bg: '#FFD600', label: 'Yellow' },
  { id: 'green',  bg: '#4ADE80', label: 'Green' },
  { id: 'blue',   bg: '#60A5FA', label: 'Blue' },
  { id: 'pink',   bg: '#F472B6', label: 'Pink' },
];

export default function AnnotationToolbar({
  position,
  onSave,
  onDismiss,
  onDelete,
  onAddToBoard,
  initialColor,
  initialNote,
}) {
  const [color, setColor] = useState(initialColor || 'yellow');
  const [note, setNote] = useState(initialNote || '');
  const ref = useRef(null);
  const inputRef = useRef(null);
  const isEdit = !!onDelete;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onDismiss?.();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 150);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onDismiss]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    onSave({ color, note: note.trim() });
    setNote('');
  };

  const handleColorClick = (nextColor) => {
    setColor(nextColor);
    onSave({ color: nextColor, note: note.trim() });
    setNote('');
  };

  const x = Math.min(Math.max(position.x, 120), window.innerWidth - 120);
  const y = Math.max(position.y - 8, 60);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x, top: y,
        transform: 'translate(-50%, -100%)',
        zIndex: 2000,
        background: 'var(--app-bg)',
        border: '0.5px solid var(--hairline-strong)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(0,0,0,0.06)',
        padding: '7px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 230,
        fontFamily: 'var(--ui-font)',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Arrow pointer */}
      <div style={{
        position: 'absolute', bottom: -5, left: '50%',
        width: 10, height: 10,
        background: 'var(--app-bg)',
        border: '0.5px solid var(--hairline-strong)',
        borderTop: 'none', borderLeft: 'none',
        transform: 'translateX(-50%) rotate(45deg)',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {COLORS.map(c => (
          <button
            key={c.id}
            title={c.label}
            onClick={() => handleColorClick(c.id)}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: c.bg, padding: 0, flexShrink: 0,
              border: color === c.id ? '2.5px solid var(--fg)' : '2px solid transparent',
              outline: 'none', cursor: 'pointer', opacity: 0.85,
            }}
          />
        ))}
        {onAddToBoard && !isEdit && (
          <button
            onClick={onAddToBoard}
            style={{
              marginLeft: 'auto',
              height: 22,
              padding: '0 8px',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 5,
              background: 'var(--input-bg)',
              color: 'var(--fg-muted)',
              fontFamily: 'var(--ui-font)',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" />
              <path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Board
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        placeholder="Add a note… then click a color or press Enter"
        value={note}
        onChange={e => setNote(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        style={{
          width: '100%',
          height: 32,
          padding: '0 9px',
          fontSize: 12,
          fontFamily: 'var(--ui-font)',
          color: 'var(--fg)',
          background: 'var(--hover)',
          border: '0.5px solid var(--hairline-strong)',
          borderRadius: 6,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {isEdit && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <button
            onClick={onDelete}
            style={{
              fontSize: 11, padding: '3px 9px',
              border: '0.5px solid #FCA5A5', borderRadius: 4,
              background: 'transparent', color: '#DC2626',
              cursor: 'pointer', lineHeight: 1.4,
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
