import { useState } from 'react';

export default function Toolbar({
  title,
  subtitle,
  sort,
  onSort,
  search,
  onSearch,
  onOpenTweaks,
  onRefresh,
  refreshing = false,
  searchPlaceholder = 'Search title or author',
  showSearch = true,
  showSort = true,
  sortOptions = [
    { value: 'recent', label: 'Recently Added' },
    { value: 'title', label: 'Title' },
    { value: 'author', label: 'Author' },
    { value: 'progress', label: 'Progress' },
  ],
}) {
  const [refreshSpinning, setRefreshSpinning] = useState(false);

  const handleRefreshClick = () => {
    if (!onRefresh || refreshing) return;
    setRefreshSpinning(true);
    onRefresh();
  };

  return (
    <>
      <style>{`
        @keyframes toolbar-refresh-spin-once {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        padding: '16px 28px 14px',
        borderBottom: '0.5px solid var(--hairline)',
        display: 'flex', alignItems: 'flex-end', gap: 16,
        fontFamily: 'var(--ui-font)',
        background: 'var(--app-bg)',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--display-font)',
            fontSize: 26, fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
            lineHeight: 1.1,
          }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 4, fontFamily: 'var(--mono-font)' }}>
            {subtitle}
          </div>
        </div>
        {showSearch ? <div style={{ position: 'relative' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--fg-faint)' }}>
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1" />
            <path d="M7.5 7.5l2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: 220, height: 28,
              padding: '0 10px 0 26px',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 6,
              background: 'var(--input-bg)',
              fontSize: 12, fontFamily: 'var(--ui-font)',
              color: 'var(--fg)',
            }}
          />
        </div> : null}
        {showSort ? <select
          value={sort}
          onChange={e => onSort(e.target.value)}
          style={{
            height: 28, padding: '0 24px 0 10px',
            border: '0.5px solid var(--hairline-strong)',
            borderRadius: 6,
            background: 'var(--input-bg)',
            fontSize: 12, fontFamily: 'var(--ui-font)',
            color: 'var(--fg)',
            appearance: 'none',
            backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'><path d='M2 3l2 2 2-2' stroke='%23888' fill='none' stroke-width='1'/></svg>\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            cursor: 'pointer',
          }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select> : null}
        {onRefresh ? (
          <button
            onClick={handleRefreshClick}
            disabled={refreshing}
            style={{
              height: 28,
              padding: '0 10px',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 6,
              background: 'var(--input-bg)',
              fontSize: 12,
              fontFamily: 'var(--ui-font)',
              color: 'var(--fg)',
              cursor: refreshing ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: refreshing ? 0.65 : 1,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                animation: refreshSpinning ? 'toolbar-refresh-spin-once 0.52s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
                transformOrigin: '50% 50%',
              }}
              onAnimationEnd={() => setRefreshSpinning(false)}
            >
              <path d="M12.8 6.4A5.3 5.3 0 004 4.3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              <path d="M4.3 2.2H2.2v2.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3.2 9.6A5.3 5.3 0 0012 11.7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              <path d="M11.7 13.8h2.1v-2.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        ) : null}
        <button
          onClick={onOpenTweaks}
          style={{
            height: 28, padding: '0 12px',
            border: '0.5px solid var(--hairline-strong)',
            borderRadius: 6,
            background: 'var(--input-bg)',
            fontSize: 12, fontFamily: 'var(--ui-font)',
            color: 'var(--fg)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1" /><path d="M5.5 1v1.2M5.5 8.8V10M1 5.5h1.2M8.8 5.5H10M2.3 2.3l.9.9M7.8 7.8l.9.9M8.7 2.3l-.9.9M3.2 7.8l-.9.9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
          Settings
        </button>
      </div>
    </>
  );
}
