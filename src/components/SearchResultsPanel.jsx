function SearchSnippet({ text, query }) {
  const q = query.trim();
  if (!q) return text;

  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts = [];
  let cursor = 0;
  let index = lower.indexOf(needle);

  while (index !== -1) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), mark: false });
    parts.push({ text: text.slice(index, index + q.length), mark: true });
    cursor = index + q.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), mark: false });

  return parts.map((part, i) => part.mark ? (
    <mark key={i} style={{ background: 'rgba(255, 214, 0, 0.42)', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>
      {part.text}
    </mark>
  ) : (
    <span key={i}>{part.text}</span>
  ));
}

function ResultRow({ result, query, onOpen }) {
  return (
    <button
      onClick={() => onOpen(result)}
      style={{
        width: '100%',
        padding: '14px 18px',
        border: 'none',
        borderBottom: '0.5px solid var(--hairline)',
        background: 'transparent',
        textAlign: 'left',
        cursor: result.error ? 'default' : 'pointer',
        fontFamily: 'var(--ui-font)',
        color: 'var(--fg)',
      }}
      disabled={!!result.error}
      onMouseEnter={e => { if (!result.error) e.currentTarget.style.background = 'var(--hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{result.bookTitle}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--mono-font)' }}>{result.format}</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--mono-font)' }}>{result.label}</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginBottom: result.error ? 0 : 8 }}>
        {result.bookAuthor || 'Unknown'}
      </div>
      {result.error ? (
        <div style={{ fontSize: 13, color: '#B45309' }}>{result.error}</div>
      ) : (
        <div style={{ fontFamily: 'var(--reader-font)', fontSize: 17, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
          <SearchSnippet text={result.snippet} query={query} />
        </div>
      )}
    </button>
  );
}

export default function SearchResultsPanel({ query, status, results, onOpenResult }) {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return (
      <div style={{
        padding: 80,
        textAlign: 'center',
        color: 'var(--fg-faint)',
        fontFamily: 'var(--ui-font)',
        fontSize: 13,
      }}>
        Type at least 2 characters to search inside all books.
      </div>
    );
  }

  if (status === 'searching') {
    return (
      <div style={{
        padding: 80,
        textAlign: 'center',
        color: 'var(--fg-faint)',
        fontFamily: 'var(--ui-font)',
        fontSize: 13,
      }}>
        Searching all books…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={{
        padding: 80,
        textAlign: 'center',
        color: 'var(--fg-faint)',
        fontFamily: 'var(--ui-font)',
        fontSize: 13,
      }}>
        No full-text results found.
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 28px 40px' }}>
      <div style={{
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--input-bg)',
      }}>
        {results.map((result) => (
          <ResultRow key={result.id} result={result} query={query} onOpen={onOpenResult} />
        ))}
      </div>
    </div>
  );
}
