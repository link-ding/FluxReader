export function applyTheme(theme) {
  const r = document.documentElement;
  if (theme === 'light') {
    r.style.setProperty('--app-bg', '#FBFAF7');
    r.style.setProperty('--titlebar', '#F4F2ED');
    r.style.setProperty('--sidebar-bg', '#F4F2ED');
    r.style.setProperty('--fg', '#1A1A1A');
    r.style.setProperty('--fg-muted', '#5E5E5E');
    r.style.setProperty('--fg-faint', '#8C8C8C');
    r.style.setProperty('--hairline', 'rgba(0,0,0,0.08)');
    r.style.setProperty('--hairline-strong', 'rgba(0,0,0,0.14)');
    r.style.setProperty('--hover', 'rgba(0,0,0,0.04)');
    r.style.setProperty('--selected', 'rgba(0,0,0,0.07)');
    r.style.setProperty('--input-bg', '#FFFFFF');
    r.style.setProperty('--pill-bg', '#FFFFFF');
    r.style.setProperty('--accent', 'oklch(0.55 0.14 40)');
    r.style.setProperty('--reader-bg', '#FDFCF9');
    r.style.setProperty('--reader-fg', '#1C1C1A');
    r.style.setProperty('--reader-fg-muted', '#5E5E5E');
    r.style.setProperty('--reader-fg-faint', '#9A9A96');
    r.style.setProperty('--reader-hairline', 'rgba(0,0,0,0.1)');
    r.style.setProperty('--page-bg', '#EDEAE2');
    r.style.setProperty('--board-bg', '#F4F2EC');
    r.style.setProperty('--board-dot', 'rgba(0,0,0,0.08)');
  } else if (theme === 'sepia') {
    r.style.setProperty('--app-bg', '#F5EEDC');
    r.style.setProperty('--titlebar', '#EFE5CF');
    r.style.setProperty('--sidebar-bg', '#EFE5CF');
    r.style.setProperty('--fg', '#2B2118');
    r.style.setProperty('--fg-muted', '#6B5A45');
    r.style.setProperty('--fg-faint', '#9A8870');
    r.style.setProperty('--hairline', 'rgba(80,50,20,0.1)');
    r.style.setProperty('--hairline-strong', 'rgba(80,50,20,0.18)');
    r.style.setProperty('--hover', 'rgba(80,50,20,0.06)');
    r.style.setProperty('--selected', 'rgba(80,50,20,0.1)');
    r.style.setProperty('--input-bg', '#FAF4E3');
    r.style.setProperty('--pill-bg', '#FAF4E3');
    r.style.setProperty('--accent', 'oklch(0.52 0.13 45)');
    r.style.setProperty('--reader-bg', '#F5EEDC');
    r.style.setProperty('--reader-fg', '#2B2118');
    r.style.setProperty('--reader-fg-muted', '#6B5A45');
    r.style.setProperty('--reader-fg-faint', '#A89A82');
    r.style.setProperty('--reader-hairline', 'rgba(80,50,20,0.15)');
    r.style.setProperty('--page-bg', '#E0D5B8');
    r.style.setProperty('--board-bg', '#EDE5D0');
    r.style.setProperty('--board-dot', 'rgba(80,50,20,0.09)');
  } else {
    r.style.setProperty('--app-bg', '#1A1A1C');
    r.style.setProperty('--titlebar', '#242426');
    r.style.setProperty('--sidebar-bg', '#1F1F21');
    r.style.setProperty('--fg', '#EDEDED');
    r.style.setProperty('--fg-muted', '#A5A5A8');
    r.style.setProperty('--fg-faint', '#6E6E72');
    r.style.setProperty('--hairline', 'rgba(255,255,255,0.08)');
    r.style.setProperty('--hairline-strong', 'rgba(255,255,255,0.14)');
    r.style.setProperty('--hover', 'rgba(255,255,255,0.05)');
    r.style.setProperty('--selected', 'rgba(255,255,255,0.08)');
    r.style.setProperty('--input-bg', '#2A2A2C');
    r.style.setProperty('--pill-bg', '#2A2A2C');
    r.style.setProperty('--accent', 'oklch(0.72 0.13 45)');
    r.style.setProperty('--reader-bg', '#17171A');
    r.style.setProperty('--reader-fg', '#DDDDDD');
    r.style.setProperty('--reader-fg-muted', '#9A9A9D');
    r.style.setProperty('--reader-fg-faint', '#5E5E62');
    r.style.setProperty('--reader-hairline', 'rgba(255,255,255,0.1)');
    r.style.setProperty('--page-bg', '#0E0E10');
    r.style.setProperty('--board-bg', '#111114');
    r.style.setProperty('--board-dot', 'rgba(255,255,255,0.05)');
  }
}

export function applyFont(font) {
  const r = document.documentElement;
  if (font === 'serif') {
    r.style.setProperty('--reader-font', '"Cormorant Garamond", "EB Garamond", Georgia, "Times New Roman", serif');
    r.style.setProperty('--reader-leading', '1.55');
  } else if (font === 'sans') {
    r.style.setProperty('--reader-font', '"Inter", -apple-system, "Helvetica Neue", sans-serif');
    r.style.setProperty('--reader-leading', '1.6');
  } else {
    r.style.setProperty('--reader-font', '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace');
    r.style.setProperty('--reader-leading', '1.65');
  }
}
