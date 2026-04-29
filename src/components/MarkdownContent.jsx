function InlineMarkdown({ text }) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index) });
    const value = match[0];
    if (value.startsWith('**')) {
      parts.push({ type: 'strong', value: value.slice(2, -2) });
    } else {
      parts.push({ type: 'code', value: value.slice(1, -1) });
    }
    cursor = match.index + value.length;
  }

  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });

  return parts.map((part, index) => {
    if (part.type === 'strong') return <strong key={index} style={{ fontWeight: 700 }}>{part.value}</strong>;
    if (part.type === 'code') {
      return (
        <code key={index} style={{
          fontFamily: 'var(--mono-font)',
          fontSize: '0.88em',
          background: 'var(--hover)',
          border: '0.5px solid var(--hairline)',
          borderRadius: 4,
          padding: '1px 4px',
        }}>
          {part.value}
        </code>
      );
    }
    return <span key={index}>{part.value}</span>;
  });
}

export default function MarkdownContent({ content, compact = false }) {
  const lines = String(content || '').split(/\r?\n/);
  const nodes = [];
  let list = null;
  let codeBlock = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    nodes.push(
      <Tag key={`list-${nodes.length}`} style={{
        margin: '8px 0 12px',
        paddingLeft: 22,
      }}>
        {list.items.map((item, index) => (
          <li key={index} style={{ margin: '5px 0', paddingLeft: 2 }}>
            <InlineMarkdown text={item} />
          </li>
        ))}
      </Tag>
    );
    list = null;
  };

  const flushCodeBlock = () => {
    if (!codeBlock) return;
    nodes.push(
      <pre key={`code-${nodes.length}`} style={{
        margin: compact ? '8px 0 10px' : '10px 0 14px',
        padding: compact ? '8px 9px' : '10px 12px',
        overflowX: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        border: '0.5px solid var(--hairline)',
        borderRadius: 7,
        background: 'var(--hover)',
        color: 'var(--fg)',
        fontFamily: 'var(--mono-font)',
        fontSize: compact ? 11 : 13,
        lineHeight: 1.5,
      }}>
        <code>{codeBlock.lines.join('\n')}</code>
      </pre>
    );
    codeBlock = null;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (codeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        codeBlock = { language: fence[1] || '', lines: [] };
      }
      return;
    }

    if (codeBlock) {
      codeBlock.lines.push(rawLine);
      return;
    }

    if (!line) {
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const Tag = `h${Math.min(level + 1, 4)}`;
      nodes.push(
        <Tag key={`heading-${index}`} style={{
          margin: nodes.length === 0 ? '0 0 8px' : compact ? '12px 0 6px' : '18px 0 8px',
          fontFamily: 'var(--display-font)',
          fontSize: compact
            ? (level === 1 ? 15 : level === 2 ? 14 : 13)
            : (level === 1 ? 23 : level === 2 ? 19 : 16),
          lineHeight: 1.25,
          fontWeight: 650,
          color: 'var(--fg)',
        }}>
          <InlineMarkdown text={heading[2]} />
        </Tag>
      );
      return;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushList();
      nodes.push(
        <blockquote key={`quote-${index}`} style={{
          margin: compact ? '8px 0 10px' : '10px 0 14px',
          padding: compact ? '6px 0 6px 9px' : '8px 0 8px 12px',
          borderLeft: '2px solid var(--hairline-strong)',
          color: 'var(--fg-muted)',
        }}>
          <InlineMarkdown text={quote[1]} />
        </blockquote>
      );
      return;
    }

    if (/^---+$/.test(line)) {
      flushList();
      nodes.push(<hr key={`hr-${index}`} style={{ border: 'none', borderTop: '0.5px solid var(--hairline)', margin: '14px 0' }} />);
      return;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(ordered[1]);
      return;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(unordered[1]);
      return;
    }

    flushList();
    nodes.push(
      <p key={`p-${index}`} style={{
        margin: compact ? '0 0 8px' : '0 0 12px',
        lineHeight: compact ? 1.52 : 1.68,
      }}>
        <InlineMarkdown text={line} />
      </p>
    );
  });

  flushList();
  flushCodeBlock();
  return <>{nodes}</>;
}
