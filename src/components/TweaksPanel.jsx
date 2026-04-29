import { useState } from 'react';

function Segmented({ value, options, onChange }) {
  return (
    <div style={{
      display: 'flex',
      gap: 2,
      padding: 2,
      background: 'var(--hover)',
      borderRadius: 6,
    }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: '6px 8px',
            border: 'none',
            borderRadius: 4,
            background: value === o.value ? 'var(--app-bg)' : 'transparent',
            boxShadow: value === o.value ? '0 0.5px 1px rgba(0,0,0,0.1)' : 'none',
            fontFamily: 'var(--ui-font)',
            fontSize: 11,
            fontWeight: value === o.value ? 500 : 400,
            color: value === o.value ? 'var(--fg)' : 'var(--fg-muted)',
            cursor: 'pointer',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function SettingsSection({ title, detail, children }) {
  return (
    <section style={{ padding: '18px 22px', borderBottom: '0.5px solid var(--hairline)' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--fg)' }}>{title}</div>
        {detail ? <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 4, lineHeight: 1.35 }}>{detail}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        height: 30,
        padding: '0 9px',
        border: '0.5px solid var(--hairline-strong)',
        borderRadius: 6,
        background: 'var(--input-bg)',
        color: 'var(--fg)',
        fontFamily: 'var(--ui-font)',
        fontSize: 12,
      }}
    />
  );
}

function PathRow({ label, path, selected, onSelect, onRemove }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 0',
      borderTop: '0.5px solid var(--hairline)',
    }}>
      <button
        onClick={onSelect}
        style={{
          width: 18,
          height: 18,
          border: '0.5px solid var(--hairline-strong)',
          borderRadius: 999,
          background: selected ? 'var(--accent)' : 'var(--input-bg)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        title="Use this folder"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--fg)', fontWeight: selected ? 600 : 400 }}>{label}</div>
        <div style={{
          fontSize: 11,
          color: 'var(--fg-faint)',
          fontFamily: 'var(--mono-font)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginTop: 2,
        }}>
          {path}
        </div>
      </div>
      {onRemove ? (
        <button
          onClick={onRemove}
          style={{
            width: 24,
            height: 24,
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: 'var(--fg-faint)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = '#DC2626'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-faint)'; }}
          title="Remove folder"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function UtilityButton({ children, onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 28,
        padding: '0 10px',
        border: '0.5px solid var(--hairline-strong)',
        borderRadius: 6,
        background: disabled ? 'var(--hover)' : 'var(--input-bg)',
        color: disabled ? 'var(--fg-faint)' : 'var(--fg)',
        fontFamily: 'var(--ui-font)',
        fontSize: 12,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export default function TweaksPanel({
  open,
  onClose,
  tweaks,
  setTweaks,
  folders = [],
  selectedFolder,
  onAddBookFolder,
  onSelectBookFolder,
  onRemoveBookFolder,
  onChooseNotesFolder,
  aiIndexStatus,
  onBuildAIIndex,
}) {
  const [tab, setTab] = useState('general');

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.16)',
      fontFamily: 'var(--ui-font)',
      WebkitAppRegion: 'no-drag',
    }}>
      <div style={{
        width: 540,
        maxWidth: 'calc(100vw - 32px)',
        height: '100%',
        background: 'var(--app-bg)',
        borderLeft: '0.5px solid var(--hairline-strong)',
        boxShadow: '-18px 0 48px rgba(0,0,0,0.16)',
        display: 'flex',
        flexDirection: 'column',
        WebkitAppRegion: 'no-drag',
      }}>
        <div style={{
          height: 56,
          padding: '0 18px 0 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderBottom: '0.5px solid var(--hairline)',
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>Settings</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>Reader, folders, notes, and AI API</div>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            title="Close settings"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--fg-faint)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitAppRegion: 'no-drag',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg-muted)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-faint)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
          <nav style={{
            width: 132,
            flexShrink: 0,
            borderRight: '0.5px solid var(--hairline)',
            padding: '12px 8px',
            background: 'var(--sidebar-bg)',
          }}>
            {[
              ['general', 'Display'],
              ['ai', 'AI API'],
              ['library', 'Library'],
              ['notes', 'Notes'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                style={{
                  width: '100%',
                  height: 30,
                  marginBottom: 4,
                  padding: '0 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: tab === value ? 'var(--selected)' : 'transparent',
                  color: tab === value ? 'var(--fg)' : 'var(--fg-muted)',
                  fontSize: 12,
                  fontWeight: tab === value ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {tab === 'general' && (
              <>
                <SettingsSection title="Display" detail="Reading appearance settings are applied immediately.">
                  <Field label="Theme">
                    <Segmented
                      value={tweaks.theme}
                      options={[
                        { value: 'light', label: 'Light' },
                        { value: 'sepia', label: 'Sepia' },
                        { value: 'dark', label: 'Dark' },
                      ]}
                      onChange={v => setTweaks({ theme: v })}
                    />
                  </Field>
                  <Field label="Font family">
                    <Segmented
                      value={tweaks.font}
                      options={[
                        { value: 'serif', label: 'Serif' },
                        { value: 'sans', label: 'Sans' },
                        { value: 'mono', label: 'Mono' },
                      ]}
                      onChange={v => setTweaks({ font: v })}
                    />
                  </Field>
                  <Field label={`Reader size · ${tweaks.size}px`}>
                    <input
                      type="range"
                      min="14"
                      max="32"
                      step="1"
                      value={tweaks.size}
                      onChange={e => setTweaks({ size: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </Field>
                  <Field label={`Column width · ${tweaks.width}px`}>
                    <input
                      type="range"
                      min="520"
                      max="780"
                      step="20"
                      value={tweaks.width}
                      onChange={e => setTweaks({ width: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </Field>
                </SettingsSection>
              </>
            )}

            {tab === 'ai' && (
              <SettingsSection title="AI API" detail="These settings prepare the AI Chat panel for a real model connection.">
                <Field label="Provider">
                  <Segmented
                    value={tweaks.aiProvider}
                    options={[
                      { value: 'openai', label: 'OpenAI' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                    onChange={v => setTweaks({ aiProvider: v })}
                  />
                </Field>
                <Field label="API key">
                  <TextInput
                    type="password"
                    value={tweaks.aiApiKey}
                    onChange={v => setTweaks({ aiApiKey: v })}
                    placeholder="sk-..."
                  />
                </Field>
                <Field label="Model">
                  <TextInput
                    value={tweaks.aiModel}
                    onChange={v => setTweaks({ aiModel: v })}
                    placeholder="gpt-5.1-mini"
                  />
                </Field>
                <Field label="Embedding model">
                  <TextInput
                    value={tweaks.aiEmbeddingModel}
                    onChange={v => setTweaks({ aiEmbeddingModel: v })}
                    placeholder="text-embedding-3-small"
                  />
                </Field>
                <Field label="Base URL">
                  <TextInput
                    value={tweaks.aiBaseUrl}
                    onChange={v => setTweaks({ aiBaseUrl: v })}
                    placeholder="https://api.openai.com/v1"
                  />
                </Field>
                <div style={{
                  marginTop: 16,
                  padding: 12,
                  border: '0.5px solid var(--hairline)',
                  borderRadius: 8,
                  background: 'var(--input-bg)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--fg)', marginBottom: 4 }}>AI Index</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-faint)', lineHeight: 1.4, marginBottom: 12 }}>
                    Build a local semantic index for all books. AI Chat will use it before keyword search.
                  </div>
                  <UtilityButton
                    onClick={onBuildAIIndex}
                    disabled={aiIndexStatus?.status === 'building'}
                  >
                    {aiIndexStatus?.status === 'building' ? 'Building AI Index…' : 'Build AI Index'}
                  </UtilityButton>
                  {aiIndexStatus?.message ? (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                      {aiIndexStatus.message}
                    </div>
                  ) : null}
                  {aiIndexStatus?.status === 'building' && aiIndexStatus?.progress ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--hover)',
                        overflow: 'hidden',
                        border: '0.5px solid var(--hairline)',
                      }}>
                        <div style={{
                          width: `${Math.max(3, Math.min(100, ((aiIndexStatus.progress.currentBook || 0) / Math.max(aiIndexStatus.progress.totalBooks || 1, 1)) * 100))}%`,
                          height: '100%',
                          background: 'var(--accent)',
                          transition: 'width 0.2s ease',
                        }} />
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-faint)', lineHeight: 1.4 }}>
                        {aiIndexStatus.progress.phase === 'embedding'
                          ? `${aiIndexStatus.progress.cachedCount || 0} cached · ${aiIndexStatus.progress.requestedCount || 0} new${aiIndexStatus.progress.batchCount ? ` · ${aiIndexStatus.progress.batchIndex || 0}/${aiIndexStatus.progress.batchCount} batches` : ''}`
                          : `${aiIndexStatus.progress.currentBook || 0}/${aiIndexStatus.progress.totalBooks || 0} books read`}
                      </div>
                    </div>
                  ) : null}
                  {aiIndexStatus?.error ? (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#B45309', lineHeight: 1.4 }}>
                      {aiIndexStatus.error}
                    </div>
                  ) : null}
                </div>
              </SettingsSection>
            )}

            {tab === 'library' && (
              <SettingsSection title="Book folders" detail="Folders listed here are scanned for EPUB and PDF files.">
                <div style={{ marginBottom: 12 }}>
                  <UtilityButton onClick={onAddBookFolder}>Add book folder…</UtilityButton>
                </div>
                {folders.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '10px 0' }}>No book folders added.</div>
                ) : (
                  folders.map(folder => (
                    <PathRow
                      key={folder.path}
                      label={`${folder.name} · ${folder.count} book${folder.count !== 1 ? 's' : ''}`}
                      path={folder.path}
                      selected={selectedFolder === folder.path}
                      onSelect={() => onSelectBookFolder?.(folder.path)}
                      onRemove={() => onRemoveBookFolder?.(folder.path)}
                    />
                  ))
                )}
              </SettingsSection>
            )}

            {tab === 'notes' && (
              <SettingsSection title="Notes folder" detail="Highlights and notes can be exported to this folder as Markdown.">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <UtilityButton onClick={onChooseNotesFolder}>Choose notes folder…</UtilityButton>
                  {tweaks.notesFolder ? (
                    <UtilityButton onClick={() => setTweaks({ notesFolder: '' })}>Clear</UtilityButton>
                  ) : null}
                </div>
                <div style={{
                  padding: 10,
                  border: '0.5px solid var(--hairline)',
                  borderRadius: 7,
                  background: 'var(--input-bg)',
                  color: tweaks.notesFolder ? 'var(--fg-muted)' : 'var(--fg-faint)',
                  fontFamily: 'var(--mono-font)',
                  fontSize: 11,
                  lineHeight: 1.4,
                  wordBreak: 'break-all',
                }}>
                  {tweaks.notesFolder || 'Not set'}
                </div>
              </SettingsSection>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
