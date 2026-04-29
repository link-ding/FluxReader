export default function MacChrome({ children, title }) {
  const handleClose = () => window.electronAPI?.windowClose();
  const handleMinimize = () => window.electronAPI?.windowMinimize();
  const handleMaximize = () => window.electronAPI?.windowMaximize();

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--app-bg)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      <div style={{
        height: 38, flexShrink: 0,
        borderBottom: '0.5px solid var(--hairline)',
        display: 'flex', alignItems: 'center', padding: '0 14px',
        background: 'var(--titlebar)', position: 'relative', zIndex: 10,
        WebkitAppRegion: 'drag',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', WebkitAppRegion: 'no-drag' }}>
          <div onClick={handleClose} style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5F57', border: '0.5px solid rgba(0,0,0,0.12)', cursor: 'pointer' }} />
          <div onClick={handleMinimize} style={{ width: 12, height: 12, borderRadius: '50%', background: '#FEBC2E', border: '0.5px solid rgba(0,0,0,0.12)', cursor: 'pointer' }} />
          <div onClick={handleMaximize} style={{ width: 12, height: 12, borderRadius: '50%', background: '#28C840', border: '0.5px solid rgba(0,0,0,0.12)', cursor: 'pointer' }} />
        </div>
        <div style={{
          position: 'absolute', left: 0, right: 0, textAlign: 'center',
          fontFamily: 'var(--ui-font)', fontSize: 13, fontWeight: 500,
          color: 'var(--fg-muted)', letterSpacing: '-0.01em', pointerEvents: 'none',
        }}>{title}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
