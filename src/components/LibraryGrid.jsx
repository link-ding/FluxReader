import { useState } from 'react';
import BookCover from './BookCover.jsx';

function BookCard({ book, onOpen }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onOpen(book)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        transition: 'transform 0.18s ease',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div style={{ position: 'relative' }}>
        <BookCover book={book} width={170} height={255} />
        <div style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 9, fontWeight: 600,
          letterSpacing: '0.08em',
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.55)',
          color: '#FFF',
          borderRadius: 3,
          fontFamily: 'var(--mono-font)',
        }}>{book.format}</div>
        {book.progress > 0 && book.progress < 1 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.15)' }}>
            <div style={{ width: `${book.progress * 100}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        )}
        {book.progress >= 1 && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.5l2 2 4-4.5" stroke="#FFF" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, width: 170 }}>
        <div style={{
          fontFamily: 'var(--ui-font)',
          fontSize: 13, fontWeight: 500,
          color: 'var(--fg)', lineHeight: 1.25, letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>{book.title}</div>
        <div style={{ fontFamily: 'var(--ui-font)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{book.author}</div>
        <div style={{
          fontFamily: 'var(--mono-font)', fontSize: 10, color: 'var(--fg-faint)',
          marginTop: 4, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums',
        }}>
          {book.progress === 0 ? 'Not started' :
           book.progress >= 1 ? 'Finished' :
           `${Math.round(book.progress * 100)}% read`}
        </div>
      </div>
    </div>
  );
}

export default function LibraryGrid({ books, onOpen }) {
  if (books.length === 0) {
    return (
      <div style={{
        padding: 80, textAlign: 'center',
        color: 'var(--fg-faint)', fontFamily: 'var(--ui-font)', fontSize: 13,
      }}>
        No books match your filter.
      </div>
    );
  }
  return (
    <div style={{
      padding: '28px 28px 40px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, 170px)',
      gap: '32px 28px',
      justifyContent: 'start',
    }}>
      {books.map(b => <BookCard key={b.id} book={b} onOpen={onOpen} />)}
    </div>
  );
}
