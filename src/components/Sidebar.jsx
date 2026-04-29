import { useState } from 'react';

function SidebarIcon({ kind }) {
  const s = { width: 14, height: 14, flexShrink: 0 };
  if (kind === 'folder') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}><path d="M1.5 3.5a1 1 0 011-1h3l1 1.2h5a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1v-7.2z" stroke="currentColor" strokeWidth="1" /></svg>
  );
  if (kind === 'all') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}><rect x="2" y="2" width="4" height="10" stroke="currentColor" strokeWidth="1" /><rect x="7" y="2" width="2.5" height="10" stroke="currentColor" strokeWidth="1" /><rect x="10.5" y="3" width="2" height="9" stroke="currentColor" strokeWidth="1" /></svg>
  );
  if (kind === 'highlight') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}><path d="M3 9.5l5.8-5.8a1.4 1.4 0 012 2L5 11.5H3v-2z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /><path d="M7.5 5.5l2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
  );
  if (kind === 'search') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}><circle cx="6" cy="6" r="3.8" stroke="currentColor" strokeWidth="1" /><path d="M8.8 8.8l3 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
  );
  if (kind === 'chat') return (
    <svg viewBox="0 0 14 14" fill="none" style={s}><path d="M2 3.5a2 2 0 012-2h6a2 2 0 012 2v4a2 2 0 01-2 2H6.5L3 12V9.5a2 2 0 01-1-1.7V3.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /><path d="M4.5 5h5M4.5 7h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
  );
  return null;
}

function SidebarItem({ label, count, selected, onClick, icon, onRemove }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        margin: '0 10px', padding: '5px 12px',
        display: 'flex', alignItems: 'center', gap: 9,
        borderRadius: 6,
        fontSize: 13, fontWeight: selected ? 500 : 400,
        color: selected ? 'var(--fg)' : 'var(--fg-muted)',
        background: selected ? 'var(--selected)' : (hover ? 'var(--hover)' : 'transparent'),
        cursor: 'pointer', userSelect: 'none',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ color: selected ? 'var(--accent)' : 'var(--fg-faint)', display: 'flex' }}>
        <SidebarIcon kind={icon} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {onRemove && hover ? (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          title={`Remove ${label}`}
          style={{
            width: 20,
            height: 20,
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: 'var(--fg-faint)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg-muted)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-faint)'; }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M2 2l5 5M7 2L2 7" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
          </svg>
        </button>
      ) : count !== undefined ? (
        <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      ) : null}
    </div>
  );
}

function SidebarSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        padding: '0 16px 6px 22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        minHeight: 20,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--fg-faint)',
          lineHeight: 1,
        }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

export default function Sidebar({
  currentFolder,
  folders,
  selectedFolder,
  onSelectFolder,
  books,
  highlightsCount,
  view,
  onView,
  onAddFolder,
  onRemoveFolder,
  searchResultsCount = 0,
}) {
  const totalBooks = books.length;

  return (
    <div style={{
      width: 232, flexShrink: 0,
      background: 'var(--sidebar-bg)',
      borderRight: '0.5px solid var(--hairline)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--ui-font)',
      padding: '14px 0',
      overflowY: 'auto',
    }}>
      <SidebarSection title="Library">
        <SidebarItem
          label="All Books"
          count={totalBooks}
          selected={view === 'all' && !selectedFolder}
          onClick={() => {
            onSelectFolder('');
            onView('all');
          }}
          icon="all"
        />
        <SidebarItem label="Highlights" count={highlightsCount} selected={view === 'highlights'} onClick={() => onView('highlights')} icon="highlight" />
        <SidebarItem label="Search" count={searchResultsCount} selected={view === 'search'} onClick={() => onView('search')} icon="search" />
        <SidebarItem label="AI Chat" selected={view === 'chat'} onClick={() => onView('chat')} icon="chat" />
      </SidebarSection>

      <SidebarSection title="Folders">
        {folders.map(f => (
          <SidebarItem
            key={f.path}
            label={f.name}
            count={f.count}
            selected={view === 'all' && selectedFolder === f.path}
            onClick={() => {
              onSelectFolder(f.path);
              onView('all');
            }}
            onRemove={() => onRemoveFolder?.(f.path)}
            icon="folder"
          />
        ))}
        <div
          onClick={onAddFolder}
          style={{
            margin: '6px 14px 0', padding: '6px 10px',
            fontSize: 12, color: 'var(--fg-faint)',
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', borderRadius: 5,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add folder…
        </div>
      </SidebarSection>

      <div style={{ flex: 1 }} />

      <div style={{
        margin: '0 14px', padding: '10px 12px',
        background: 'var(--pill-bg)',
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        fontSize: 11, color: 'var(--fg-muted)',
        lineHeight: 1.4,
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-faint)', marginBottom: 4 }}>Watching</div>
        <div style={{ fontFamily: 'var(--mono-font)', fontSize: 11, color: 'var(--fg-muted)', wordBreak: 'break-all' }}>{currentFolder}</div>
      </div>
    </div>
  );
}
