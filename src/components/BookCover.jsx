export default function BookCover({ book, width = 180, height = 270 }) {
  // Real cover image takes priority over procedural art
  if (book.coverImage) {
    return (
      <div style={{ width, height, borderRadius: 2, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12)', flexShrink: 0 }}>
        <img src={book.coverImage} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }

  const { palette, coverStyle, title, author } = book;
  const { bg, fg, accent } = palette || { bg: '#E8DFD3', fg: '#2B2118', accent: '#8B6B47' };
  const fontSize = title.length > 22 ? 14 : title.length > 14 ? 17 : 20;

  return (
    <div style={{
      width, height, background: bg, color: fg,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12)',
      borderRadius: 2,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(to right, rgba(0,0,0,0.18), rgba(0,0,0,0) 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />

      {coverStyle === 'ornate' && (
        <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 32, height: 1, background: accent, marginBottom: 14 }} />
          <div style={{ fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif', fontStyle: 'italic', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: accent, marginBottom: 20 }}>A Novel</div>
          <div style={{ fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif', fontSize: fontSize + 4, fontWeight: 500, lineHeight: 1.05, marginBottom: 'auto' }}>{title}</div>
          <div style={{ width: 24, height: 1, background: accent, marginTop: 18, marginBottom: 10 }} />
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.75 }}>{author}</div>
        </div>
      )}

      {coverStyle === 'wave' && (
        <div style={{ padding: '26px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: fontSize + 6, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.01em' }}>{title}</div>
          <svg viewBox="0 0 140 40" style={{ width: '100%', marginTop: 14, marginBottom: 14 }}>
            <path d="M0,20 Q17.5,5 35,20 T70,20 T105,20 T140,20" stroke={accent} strokeWidth="1" fill="none" opacity="0.8" />
            <path d="M0,28 Q17.5,13 35,28 T70,28 T105,28 T140,28" stroke={accent} strokeWidth="0.6" fill="none" opacity="0.5" />
            <path d="M0,34 Q17.5,19 35,34 T70,34 T105,34 T140,34" stroke={accent} strokeWidth="0.4" fill="none" opacity="0.3" />
          </svg>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.75 }}>{author}</div>
        </div>
      )}

      {coverStyle === 'bloom' && (
        <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <svg viewBox="0 0 140 80" style={{ position: 'absolute', top: 0, right: 0, width: '70%', opacity: 0.5 }}>
            <circle cx="100" cy="30" r="18" fill={accent} opacity="0.4" />
            <circle cx="120" cy="20" r="9" fill={accent} opacity="0.6" />
            <circle cx="85" cy="45" r="5" fill={accent} opacity="0.7" />
          </svg>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontStyle: 'italic', fontSize: fontSize + 6, lineHeight: 1, marginBottom: 14 }}>{title}</div>
          <div style={{ width: 24, height: 1, background: accent, marginBottom: 10 }} />
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.75 }}>{author}</div>
        </div>
      )}

      {coverStyle === 'frame' && (
        <div style={{ padding: 14, flex: 1, display: 'flex' }}>
          <div style={{ flex: 1, border: `1px solid ${accent}`, padding: '20px 14px', display: 'flex', flexDirection: 'column', textAlign: 'center', alignItems: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: accent, marginBottom: 18 }}>— {new Date().getFullYear() - 1900} —</div>
            <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: fontSize + 2, fontWeight: 700, lineHeight: 1, marginBottom: 'auto' }}>{title}</div>
            <div style={{ width: 20, height: 1, background: accent, marginTop: 16, marginBottom: 10 }} />
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 11, opacity: 0.8 }}>{author}</div>
          </div>
        </div>
      )}

      {coverStyle === 'rule' && (
        <div style={{ padding: '28px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: '"Space Grotesk", "Helvetica Neue", sans-serif', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: accent, marginBottom: 12 }}>{author.split(' ').slice(-1)[0]}</div>
          <div style={{ width: '100%', height: 1, background: fg, opacity: 0.2, marginBottom: 18 }} />
          <div style={{ fontFamily: '"Space Grotesk", "Helvetica Neue", sans-serif', fontSize, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ flex: 1 }} />
          <div style={{ width: 20, height: 1, background: accent }} />
        </div>
      )}

      {coverStyle === 'block' && (
        <div style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: accent, height: '38%', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 12, left: 16, right: 16, fontFamily: '"Playfair Display", Georgia, serif', fontSize: fontSize + 4, fontWeight: 700, lineHeight: 1, color: bg }}>{title}</div>
          </div>
          <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.75 }}>{author}</div>
          </div>
        </div>
      )}

      {coverStyle === 'moor' && (
        <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: fontSize + 8, fontWeight: 500, lineHeight: 0.95, fontStyle: 'italic' }}>{title}</div>
          <div style={{ flex: 1 }} />
          <svg viewBox="0 0 140 30" style={{ width: '100%', marginBottom: 12 }}>
            <path d="M0,28 L15,18 L30,24 L50,10 L70,22 L90,14 L110,26 L125,16 L140,22 L140,30 L0,30 Z" fill={accent} opacity="0.6" />
          </svg>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.85 }}>{author}</div>
        </div>
      )}
    </div>
  );
}
