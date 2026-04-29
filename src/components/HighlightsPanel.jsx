import { useMemo, useState } from 'react';
import BookCover from './BookCover.jsx';

const COLOR_HEX = {
  yellow: '#FFD600',
  green: '#4ADE80',
  blue: '#60A5FA',
  pink: '#F472B6',
};

function HighlightCard({ item, onOpen }) {
  const [hover, setHover] = useState(false);
  const text = useMemo(() => item.text.replace(/\s+/g, ' ').trim(), [item.text]);
  const note = useMemo(() => (item.note || '').replace(/\s+/g, ' ').trim(), [item.note]);

  return (
    <button
      onClick={() => onOpen(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        padding: 0,
        border: 'none',
        background: hover ? 'var(--hover)' : 'var(--input-bg)',
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.14s ease, transform 0.18s ease',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.03)',
      }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '72px minmax(0, 1fr)',
        gap: 16,
        padding: 16,
        alignItems: 'start',
      }}>
        <div style={{ width: 72, height: 108, overflow: 'hidden', borderRadius: 6, flexShrink: 0 }}>
          {item.book.coverImage ? (
            <img src={item.book.coverImage} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: 180, height: 270 }}>
              <BookCover book={item.book} width={180} height={270} />
            </div>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: COLOR_HEX[item.color] || COLOR_HEX.yellow,
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'var(--ui-font)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--fg)',
              lineHeight: 1.2,
            }}>
              {item.book.title}
            </span>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--mono-font)' }}>
              {item.createdAt.slice(0, 10)}
            </span>
          </div>

          <div style={{
            fontFamily: 'var(--ui-font)',
            fontSize: 12,
            color: 'var(--fg-muted)',
            marginBottom: 8,
          }}>
            {item.book.author}
            {item.chapter ? ` · ${item.chapter}` : ''}
          </div>

          <div style={{
            fontFamily: 'var(--display-font)',
            fontSize: 22,
            color: 'var(--fg)',
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {text}
          </div>

          {note && (
            <div style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.03)',
              fontFamily: 'var(--ui-font)',
              fontSize: 12,
              color: 'var(--fg-muted)',
              lineHeight: 1.5,
            }}>
              {note}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function HighlightsPanel({ highlights, onOpenHighlight }) {
  if (highlights.length === 0) {
    return (
      <div style={{
        padding: 80,
        textAlign: 'center',
        color: 'var(--fg-faint)',
        fontFamily: 'var(--ui-font)',
      }}>
        <div style={{ fontSize: 15, color: 'var(--fg-muted)', marginBottom: 8 }}>No highlights yet</div>
        <div style={{ fontSize: 13 }}>Create highlights in any book, and they will appear here.</div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '24px 28px 40px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
      gap: 18,
      alignItems: 'start',
    }}>
      {highlights.map((item) => (
        <HighlightCard key={item.id} item={item} onOpen={onOpenHighlight} />
      ))}
    </div>
  );
}
