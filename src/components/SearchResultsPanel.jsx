import { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownContent from './MarkdownContent.jsx';

const STOP_WORDS = new Set([
  '一个', '一种', '这个', '这些', '那些', '他们', '我们', '你们', '自己', '没有', '因为', '所以',
  '如果', '但是', '只是', '就是', '还是', '可以', '不是', '而是', '已经', '应该', '这种', '那种',
  '什么', '时候', '可能', '进行', '通过', '对于', '以及', '或者', '并且', '其中', '它们', '这是',
  '你的', '我的', '他的', '她的', '并不', '人们', '这样', '非常', '很多', '一些', '东西', '真的',
  '所有', '任何', '每个', '每种', '一次', '一种', '一切', '而言', '起来', '出来', '下去', '不会',
  '不能', '不要', '总是', '只是', '甚至', '如此', '比较', '更加', '成为', '发生', '看到', '知道',
  'that', 'this', 'with', 'from', 'have', 'will', 'would', 'could', 'should', 'about', 'there', 'their',
]);

function getResultKey(result) {
  return result.id || `${result.bookTitle}-${result.label}-${result.snippet}`;
}

function getContextWindow(text, query) {
  const source = String(text || '');
  const needle = query.trim();
  if (!source || !needle) return '';
  const index = source.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return source.slice(0, 90);
  const start = Math.max(0, index - 40);
  const end = Math.min(source.length, index + needle.length + 40);
  return source.slice(start, end);
}

function fallbackTokens(text) {
  const tokens = [];
  const english = text.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [];
  tokens.push(...english);
  const cjkRuns = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i++) {
      tokens.push(run.slice(i, i + 2));
    }
  }
  return tokens;
}

function tokenizeContext(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
      return [...segmenter.segment(text)]
        .filter((part) => part.isWordLike)
        .map((part) => part.segment);
    } catch (_) {}
  }
  return fallbackTokens(text);
}

function normalizeToken(token) {
  return String(token || '').trim().toLowerCase();
}

function isUsefulToken(token, query) {
  const normalized = normalizeToken(token);
  const normalizedQuery = normalizeToken(query);
  if (!normalized || normalized === normalizedQuery) return false;
  if (normalized.length <= 1) return false;
  if (STOP_WORDS.has(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  return /[a-zA-Z\u4e00-\u9fff]/.test(normalized);
}

function buildWordMap(query, results) {
  const q = query.trim();
  if (q.length < 2 || results.length < 3) return { nodes: [], totalBooks: 0 };

  const stats = new Map();
  const matchingResults = results.filter((result) => !result.error && result.snippet);
  const totalBooks = new Set(matchingResults.map((result) => result.bookTitle || result.bookId || 'Untitled')).size;

  for (const result of matchingResults) {
    const context = getContextWindow(result.snippet, q);
    if (!context) continue;
    const localSeen = new Set();
    const tokens = tokenizeContext(context);

    for (const rawToken of tokens) {
      const token = normalizeToken(rawToken);
      if (!isUsefulToken(token, q)) continue;
      if (!stats.has(token)) {
        stats.set(token, {
          word: rawToken.trim(),
          count: 0,
          score: 0,
          books: new Set(),
          examples: [],
        });
      }

      const item = stats.get(token);
      item.count += 1;
      item.score += localSeen.has(token) ? 0.35 : 1;
      item.books.add(result.bookTitle || result.bookId || 'Untitled');
      localSeen.add(token);

      if (item.examples.length < 3) {
        item.examples.push({
          bookTitle: result.bookTitle || 'Untitled',
          label: result.label || result.format || 'Excerpt',
          snippet: result.snippet,
        });
      }
    }
  }

  const nodes = [...stats.values()]
    .map((item) => ({
      ...item,
      booksCount: item.books.size,
      score: item.score + item.books.size * 0.7 + Math.log(item.count + 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  return { nodes, totalBooks };
}

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

function WordMap({ query, results, selectedWord, onSelectWord, onReset }) {
  const [hoveredWord, setHoveredWord] = useState(null);
  const map = useMemo(() => buildWordMap(query, results), [query, results]);
  const nodes = map.nodes;
  const hoveredNode = nodes.find((node) => normalizeToken(node.word) === hoveredWord);
  const selectedToken = normalizeToken(selectedWord);

  if (results.length < 3) {
    return (
      <div style={{
        marginBottom: 14,
        padding: '13px 14px',
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        background: 'var(--input-bg)',
        color: 'var(--fg-faint)',
        fontFamily: 'var(--ui-font)',
        fontSize: 12,
      }}>
        Word Map needs at least 3 search results.
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={{
        marginBottom: 14,
        padding: '13px 14px',
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        background: 'var(--input-bg)',
        color: 'var(--fg-faint)',
        fontFamily: 'var(--ui-font)',
        fontSize: 12,
      }}>
        Word Map could not find enough nearby words for “{query.trim()}”.
      </div>
    );
  }

  const width = 760;
  const height = 310;
  const cx = 380;
  const cy = 155;
  const maxScore = Math.max(...nodes.map((node) => node.score));
  const maxCount = Math.max(...nodes.map((node) => node.count));
  const maxBooks = Math.max(...nodes.map((node) => node.booksCount));
  const positioned = nodes.map((node, index) => {
    const ring = index < 12 ? 108 : 138;
    const angleOffset = index < 12 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / 18;
    const ringIndex = index < 12 ? index : index - 12;
    const ringCount = index < 12 ? Math.min(12, nodes.length) : Math.max(1, nodes.length - 12);
    const angle = angleOffset + (Math.PI * 2 * ringIndex) / ringCount;
    const radius = 8 + (node.count / maxCount) * 14;
    return {
      ...node,
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring,
      radius,
      edgeWidth: 0.7 + (node.score / maxScore) * 3.2,
      opacity: 0.36 + (node.booksCount / maxBooks) * 0.5,
      active: normalizeToken(node.word) === selectedToken,
    };
  });

  return (
    <div style={{
      marginBottom: 14,
      border: '0.5px solid var(--hairline)',
      borderRadius: 8,
      background: 'var(--input-bg)',
      overflow: 'hidden',
      fontFamily: 'var(--ui-font)',
    }}>
      <div style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '0.5px solid var(--hairline)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--fg)' }}>Word Map</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>
            Nearby words around “{query.trim()}” across {map.totalBooks} books.
          </div>
        </div>
        {selectedWord ? (
          <button
            onClick={onReset}
            style={{
              height: 30,
              padding: '0 11px',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 6,
              background: 'var(--app-bg)',
              color: 'var(--fg-muted)',
              fontFamily: 'var(--ui-font)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 0 }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minHeight: 280, display: 'block' }}>
          <line x1={cx - 32} y1={cy} x2={cx + 32} y2={cy} stroke="var(--hairline-strong)" strokeWidth="1" opacity="0.4" />
          {positioned.map((node) => (
            <line
              key={`edge-${node.word}`}
              x1={cx}
              y1={cy}
              x2={node.x}
              y2={node.y}
              stroke={node.active ? 'var(--accent)' : 'var(--fg-faint)'}
              strokeWidth={node.edgeWidth}
              opacity={node.active ? 0.8 : 0.23}
            />
          ))}
          <circle cx={cx} cy={cy} r="32" fill="var(--fg)" opacity="0.95" />
          <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--app-bg)" fontSize="15" fontFamily="var(--ui-font)" fontWeight="650">
            {query.trim()}
          </text>
          {positioned.map((node) => (
            <g
              key={node.word}
              onMouseEnter={() => setHoveredWord(normalizeToken(node.word))}
              onMouseLeave={() => setHoveredWord(null)}
              onClick={() => onSelectWord(node.word)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill={node.active ? 'var(--accent)' : 'var(--fg-muted)'}
                opacity={node.active ? 0.95 : node.opacity}
                stroke={node.active ? 'var(--fg)' : 'var(--hairline-strong)'}
                strokeWidth={node.active ? 1.4 : 0.7}
              />
              <text
                x={node.x}
                y={node.y + node.radius + 14}
                textAnchor="middle"
                fill={node.active ? 'var(--fg)' : 'var(--fg-muted)'}
                fontSize="11"
                fontFamily="var(--ui-font)"
                fontWeight={node.active ? 650 : 500}
              >
                {node.word}
              </text>
            </g>
          ))}
        </svg>
        <div style={{
          borderLeft: '0.5px solid var(--hairline)',
          padding: 14,
          minHeight: 280,
          color: 'var(--fg-muted)',
          fontSize: 12,
          lineHeight: 1.45,
        }}>
          {hoveredNode ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', marginBottom: 8 }}>{hoveredNode.word}</div>
              <div style={{ color: 'var(--fg-faint)', marginBottom: 10 }}>
                {hoveredNode.count} hits · {hoveredNode.booksCount} books
              </div>
              <div style={{ fontFamily: 'var(--reader-font)', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
                {hoveredNode.examples[0]?.snippet || 'No excerpt available.'}
              </div>
            </>
          ) : selectedWord ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--fg)', marginBottom: 8 }}>Filtered by “{selectedWord}”</div>
              <div>Only results containing both “{query.trim()}” and “{selectedWord}” are shown below.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--fg)', marginBottom: 8 }}>How to read it</div>
              <div>Node size shows frequency. Darker nodes appear across more books. Thicker lines are closer to “{query.trim()}”.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function seededUnit(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function hasLatinText(text) {
  return /[A-Za-z]/.test(String(text || ''));
}

function wrapMapLabel(label, maxLineLength = 18, maxLines = 3) {
  const text = String(label || '').trim().replace(/\s+/g, ' ');
  if (!text) return [];
  if (/[\u4e00-\u9fff]/.test(text)) {
    const limit = 9;
    const lines = [];
    for (let i = 0; i < text.length && lines.length < maxLines; i += limit) {
      lines.push(text.slice(i, i + limit));
    }
    return lines;
  }

  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function interpolatePoint(a, b, level) {
  const range = b.value - a.value;
  const t = Math.max(0, Math.min(1, Math.abs(range) < 0.000001 ? 0.5 : (level - a.value) / range));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function buildDensityContours(clusters, width, height, maxSize) {
  if (clusters.length === 0) return [];

  const cols = 92;
  const rows = 42;
  const peaks = clusters.map((cluster) => {
    const seed = hashString(cluster.id + cluster.name);
    const base = 48 + Math.sqrt(cluster.size / maxSize) * 74;
    return {
      x: cluster.x * width,
      y: cluster.y * height,
      rx: base * (1.24 + seededUnit(seed) * 0.26),
      ry: base * (0.9 + seededUnit(seed + 9) * 0.24),
      weight: 0.75 + Math.sqrt(cluster.size / maxSize) * 0.9,
      angle: (seededUnit(seed + 19) - 0.5) * 0.9,
    };
  });

  const values = [];
  let maxValue = 0;
  for (let row = 0; row <= rows; row++) {
    const y = (row / rows) * height;
    const line = [];
    for (let col = 0; col <= cols; col++) {
      const x = (col / cols) * width;
      let value = 0;
      for (const peak of peaks) {
        const dx = x - peak.x;
        const dy = y - peak.y;
        const cos = Math.cos(peak.angle);
        const sin = Math.sin(peak.angle);
        const rx = (dx * cos + dy * sin) / peak.rx;
        const ry = (-dx * sin + dy * cos) / peak.ry;
        value += peak.weight * Math.exp(-(rx * rx + ry * ry) * 1.9);
      }
      maxValue = Math.max(maxValue, value);
      line.push({ x, y, value });
    }
    values.push(line);
  }

  const levels = [0.12, 0.16, 0.2, 0.25, 0.31, 0.38, 0.46, 0.55, 0.65, 0.76, 0.88]
    .map((level) => level * maxValue);
  return levels.map((level, levelIndex) => {
    const segments = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tl = values[row][col];
        const tr = values[row][col + 1];
        const br = values[row + 1][col + 1];
        const bl = values[row + 1][col];
        const intersections = [];

        if ((tl.value >= level) !== (tr.value >= level)) intersections.push(interpolatePoint(tl, tr, level));
        if ((tr.value >= level) !== (br.value >= level)) intersections.push(interpolatePoint(tr, br, level));
        if ((bl.value >= level) !== (br.value >= level)) intersections.push(interpolatePoint(bl, br, level));
        if ((tl.value >= level) !== (bl.value >= level)) intersections.push(interpolatePoint(tl, bl, level));

        if (intersections.length === 2) {
          segments.push(intersections);
        } else if (intersections.length === 4) {
          segments.push([intersections[0], intersections[1]]);
          segments.push([intersections[2], intersections[3]]);
        }
      }
    }

    return {
      levelIndex,
      d: segments
        .map(([a, b]) => `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`)
        .join(' '),
    };
  }).filter((line) => line.d);
}

function SemanticMap({
  query,
  results,
  semanticMap,
  selectedClusterId,
  selectedItemId,
  onBuild,
  onSelectCluster,
  onSelectItem,
  onReset,
  themeExplanation,
  onExplainTheme,
  hasApiKey,
}) {
  const [hoveredClusterId, setHoveredClusterId] = useState('');
  const [hoveredItem, setHoveredItem] = useState(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 920, height: 430 });
  const dragRef = useRef({ active: false, x: 0, y: 0, viewBox: null, moved: false });
  const suppressClickRef = useRef(false);
  const trimmed = query.trim();
  const map = semanticMap?.query === trimmed ? semanticMap.map : null;
  const status = semanticMap?.query === trimmed ? semanticMap.status : 'idle';
  const error = semanticMap?.query === trimmed ? semanticMap.error : '';
  const clusters = map?.clusters || [];
  const selectedCluster = clusters.find((cluster) => cluster.id === selectedClusterId);
  const hoveredCluster = clusters.find((cluster) => cluster.id === hoveredClusterId);
  const selectedItem = selectedItemId
    ? clusters.flatMap((cluster) => cluster.items.map((item) => ({ ...item, cluster }))).find((item) => item.id === selectedItemId)
    : null;
  const detailItem = hoveredItem || selectedItem;
  const detailCluster = detailItem?.cluster || hoveredCluster || selectedCluster;
  const shownExplanation = themeExplanation?.query === trimmed && themeExplanation?.clusterId === detailCluster?.id
    ? themeExplanation
    : null;
  const isExplainingTheme = shownExplanation?.status === 'explaining';
  const selectedExplanation = themeExplanation?.query === trimmed && themeExplanation?.clusterId === selectedCluster?.id
    ? themeExplanation
    : null;

  if (results.length < 3) {
    return (
      <div style={{
        marginBottom: 14,
        padding: '13px 14px',
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        background: 'var(--input-bg)',
        color: 'var(--fg-faint)',
        fontFamily: 'var(--ui-font)',
        fontSize: 12,
      }}>
        Semantic Map needs at least 3 search results.
      </div>
    );
  }

  if (!map || clusters.length === 0) {
    return (
      <div style={{
        marginBottom: 14,
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        background: 'var(--input-bg)',
        overflow: 'hidden',
        fontFamily: 'var(--ui-font)',
      }}>
        <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--fg)' }}>Semantic Map</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>
              Cluster the current search results by meaning with embeddings.
            </div>
          </div>
          <button
            onClick={onBuild}
            disabled={status === 'building' || !hasApiKey}
            style={{
              height: 30,
              padding: '0 12px',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 6,
              background: status === 'building' || !hasApiKey ? 'var(--hover)' : 'var(--fg)',
              color: status === 'building' || !hasApiKey ? 'var(--fg-faint)' : 'var(--app-bg)',
              fontFamily: 'var(--ui-font)',
              fontSize: 12,
              cursor: status === 'building' || !hasApiKey ? 'default' : 'pointer',
            }}
            title={hasApiKey ? 'Build semantic map with AI embeddings' : 'Add an API key in Settings > AI API'}
          >
            {status === 'building' ? 'Building…' : 'Generate'}
          </button>
        </div>
        {status === 'building' ? (
          <div style={{ padding: '0 14px 14px', color: 'var(--fg-faint)', fontSize: 12 }}>
            Building semantic clusters from {results.length} excerpts…
          </div>
        ) : null}
        {error ? (
          <div style={{ padding: '0 14px 14px', color: '#B45309', fontSize: 13 }}>{error}</div>
        ) : null}
      </div>
    );
  }

  const width = 920;
  const height = 430;
  const zoom = width / viewBox.width;
  const maxSize = Math.max(...clusters.map((cluster) => cluster.size));
  const maxBooks = Math.max(...clusters.map((cluster) => cluster.booksCount));
  const contourLines = buildDensityContours(clusters, width, height, maxSize);
  const clampViewBox = (next) => {
    const nextWidth = Math.max(width / 4, Math.min(width, next.width));
    const nextHeight = Math.max(height / 4, Math.min(height, next.height));
    const overflowX = nextWidth * 0.18;
    const overflowY = nextHeight * 0.18;
    const minX = -overflowX;
    const minY = -overflowY;
    const maxX = width - nextWidth + overflowX;
    const maxY = height - nextHeight + overflowY;
    return {
      x: Math.min(maxX, Math.max(minX, next.x)),
      y: Math.min(maxY, Math.max(minY, next.y)),
      width: nextWidth,
      height: nextHeight,
    };
  };
  const resetMapView = () => setViewBox({ x: 0, y: 0, width, height });
  const zoomMap = (factor, anchor = { x: width / 2, y: height / 2 }) => {
    setViewBox((current) => {
      const nextWidth = current.width / factor;
      const nextHeight = current.height / factor;
      const ratioX = (anchor.x - current.x) / current.width;
      const ratioY = (anchor.y - current.y) / current.height;
      return clampViewBox({
        x: anchor.x - nextWidth * ratioX,
        y: anchor.y - nextHeight * ratioY,
        width: nextWidth,
        height: nextHeight,
      });
    });
  };
  const handleWheel = (event) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height,
    };
    zoomMap(event.deltaY < 0 ? 1.16 : 0.86, anchor);
  };
  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target?.closest?.('[data-map-interactive="true"]')) return;
    dragRef.current = { active: true, x: event.clientX, y: event.clientY, viewBox, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag.active || !drag.viewBox) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / rect.width) * drag.viewBox.width;
    const dy = ((event.clientY - drag.y) / rect.height) * drag.viewBox.height;
    if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 4) {
      drag.moved = true;
    }
    setViewBox(clampViewBox({
      ...drag.viewBox,
      x: drag.viewBox.x - dx,
      y: drag.viewBox.y - dy,
    }));
  };
  const handlePointerUp = (event) => {
    const wasDragging = dragRef.current.moved;
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (wasDragging) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  };

  return (
    <div style={{
      marginBottom: 14,
      border: '0.5px solid var(--hairline)',
      borderRadius: 8,
      background: '#171817',
      overflow: 'hidden',
      fontFamily: 'var(--ui-font)',
      color: '#ECEAE2',
    }}>
      <div style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650 }}>Semantic Map</div>
          <div style={{ fontSize: 11, color: 'rgba(236,234,226,0.55)', marginTop: 2 }}>
            {map.totalResults} excerpts · {map.totalBooks} books · {clusters.length} semantic regions
            {map.embeddingCache ? (
              <span style={{ color: 'rgba(244,232,188,0.72)' }}>
                {' '}· {map.embeddingCache.source === 'ai-index' ? 'AI Index' : 'Search results'} · {map.embeddingCache.cachedCount} cached / {map.embeddingCache.requestedCount} new
              </span>
            ) : null}
          </div>
        </div>
        {selectedClusterId || selectedItemId ? (
          <button
            onClick={onReset}
            style={{
              height: 30,
              padding: '0 11px',
              border: '0.5px solid rgba(255,255,255,0.22)',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              color: '#ECEAE2',
              fontFamily: 'var(--ui-font)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => zoomMap(1.22)}
            title="Zoom in"
            style={{
              width: 30,
              height: 30,
              border: '0.5px solid rgba(255,255,255,0.22)',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              color: '#ECEAE2',
              fontFamily: 'var(--ui-font)',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <button
            onClick={() => zoomMap(0.82)}
            title="Zoom out"
            style={{
              width: 30,
              height: 30,
              border: '0.5px solid rgba(255,255,255,0.22)',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              color: '#ECEAE2',
              fontFamily: 'var(--ui-font)',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            -
          </button>
          <button
            onClick={resetMapView}
            title="Reset zoom"
            style={{
              height: 30,
              padding: '0 9px',
              border: '0.5px solid rgba(255,255,255,0.22)',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              color: '#ECEAE2',
              fontFamily: 'var(--ui-font)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
        <button
          onClick={onBuild}
          disabled={status === 'building' || !hasApiKey}
          style={{
            height: 30,
            padding: '0 11px',
            border: '0.5px solid rgba(255,255,255,0.22)',
            borderRadius: 6,
            background: status === 'building' ? 'rgba(255,255,255,0.08)' : 'rgba(236,234,226,0.92)',
            color: status === 'building' ? 'rgba(236,234,226,0.45)' : '#171817',
            fontFamily: 'var(--ui-font)',
            fontSize: 12,
            cursor: status === 'building' || !hasApiKey ? 'default' : 'pointer',
          }}
        >
          {status === 'building' ? 'Building…' : 'Refresh'}
        </button>
      </div>
      {error ? (
        <div style={{ padding: '10px 14px', color: '#FBBF24', fontSize: 12, borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
          {error}
        </div>
      ) : null}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 260px',
        gap: 0,
        height: 430,
        overflow: 'hidden',
      }}>
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={resetMapView}
          style={{ width: '100%', height: 430, display: 'block', cursor: dragRef.current.active ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <defs>
            <pattern id="semantic-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.055)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="#171817" />
          <rect width={width} height={height} fill="url(#semantic-grid)" />
          {contourLines.map((line) => (
            <path
              key={`contour-${line.levelIndex}`}
              d={line.d}
              fill="none"
              stroke="rgba(236,234,226,0.34)"
              strokeWidth="1"
              opacity={0.18 + line.levelIndex * 0.045}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {clusters.map((cluster) => {
            const cx = cluster.x * width;
            const cy = cluster.y * height;
            const base = 42 + Math.sqrt(cluster.size / maxSize) * 68;
            const active = cluster.id === selectedClusterId;
            const labelLines = wrapMapLabel(cluster.name, hasLatinText(cluster.name) ? 20 : 9, 3);
            const labelFontSize = hasLatinText(cluster.name)
              ? (cluster.name.length > 42 ? 10 : cluster.name.length > 28 ? 11 : 12)
              : 15;
            const lineHeight = labelFontSize + 3;
            const labelStartY = cy + 26 - ((labelLines.length - 1) * lineHeight) / 2;
            return (
              <g
                key={`region-${cluster.id}`}
                data-map-interactive="true"
                onMouseEnter={() => {
                  setHoveredClusterId(cluster.id);
                }}
                onMouseLeave={() => {
                  setHoveredClusterId('');
                  setHoveredItem(null);
                }}
                onClick={() => {
                  if (suppressClickRef.current) return;
                  onSelectCluster(cluster.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                {cluster.items.slice(0, 70).map((item, index) => {
                  const itemSeed = hashString(item.id || `${cluster.id}-${index}`);
                  const angle = seededUnit(itemSeed) * Math.PI * 2;
                  const distance = Math.sqrt(seededUnit(itemSeed + 11)) * base * 0.78;
                  const highlighted = hoveredItem?.id === item.id || selectedItemId === item.id;
                  const dotX = cx + Math.cos(angle) * distance;
                  const dotY = cy + Math.sin(angle) * distance;
                  const dotRadius = highlighted ? 5 : 1.5 + seededUnit(itemSeed + 17) * 1.4;
                  return (
                    <g
                      key={item.id || index}
                      data-map-interactive="true"
                      onMouseEnter={(event) => {
                        event.stopPropagation();
                        setHoveredClusterId(cluster.id);
                        setHoveredItem({ ...item, cluster });
                      }}
                      onMouseLeave={(event) => {
                        event.stopPropagation();
                        setHoveredItem(null);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (suppressClickRef.current) return;
                        onSelectItem?.(cluster.id, item.id);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={dotX}
                        cy={dotY}
                        r={9}
                        fill="transparent"
                      />
                      <circle
                        cx={dotX}
                        cy={dotY}
                        r={dotRadius}
                        fill={highlighted ? '#F4E8BC' : 'rgba(236,234,226,0.5)'}
                        opacity={highlighted ? 0.96 : (active ? 0.78 : 0.34)}
                        stroke={selectedItemId === item.id ? '#F4E8BC' : 'transparent'}
                        strokeWidth={selectedItemId === item.id ? 2 : 0}
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
                <circle
                  cx={cx}
                  cy={cy}
                  r={6 + (cluster.booksCount / maxBooks) * 5}
                  fill={active ? '#F4E8BC' : 'rgba(236,234,226,0.86)'}
                />
                <text
                  x={cx}
                  y={labelStartY}
                  textAnchor="middle"
                  fill={active ? '#F4E8BC' : '#ECEAE2'}
                  fontSize={labelFontSize}
                  fontWeight={active ? 750 : 650}
                  style={{ paintOrder: 'stroke', stroke: '#171817', strokeWidth: 5, strokeLinejoin: 'round' }}
                >
                  {labelLines.map((line, index) => (
                    <tspan key={`${cluster.id}-label-${index}`} x={cx} dy={index === 0 ? 0 : lineHeight}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{
          borderLeft: '0.5px solid rgba(255,255,255,0.1)',
          padding: 14,
          height: 430,
          overflowY: 'auto',
          color: 'rgba(236,234,226,0.72)',
          fontSize: 12,
          lineHeight: 1.45,
        }}>
          {detailItem ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 650, color: 'rgba(236,234,226,0.58)', marginBottom: 7 }}>
                {detailItem.cluster.name}
              </div>
              <div style={{ fontSize: 16, fontWeight: 750, color: '#ECEAE2', marginBottom: 7 }}>{detailItem.bookTitle}</div>
              <div style={{ color: 'rgba(236,234,226,0.52)', marginBottom: 12 }}>
                {detailItem.label || detailItem.format || 'Excerpt'}
                {selectedItemId === detailItem.id ? ' · selected' : ''}
              </div>
              <div style={{ fontFamily: 'var(--reader-font)', fontSize: 15, color: 'rgba(236,234,226,0.78)', lineHeight: 1.58 }}>
                {detailItem.snippet || 'No excerpt available.'}
              </div>
            </>
          ) : detailCluster ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 750, color: '#ECEAE2', marginBottom: 7 }}>{detailCluster.name}</div>
              <div style={{ color: 'rgba(236,234,226,0.52)', marginBottom: 10 }}>
                {detailCluster.size} excerpts · {detailCluster.booksCount} books
              </div>
              <div style={{ marginBottom: 10 }}>{detailCluster.summary}</div>
              <button
                onClick={() => onExplainTheme?.(detailCluster)}
                disabled={!hasApiKey || isExplainingTheme}
                style={{
                  height: 30,
                  padding: '0 10px',
                  marginBottom: 12,
                  border: '0.5px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  background: !hasApiKey || isExplainingTheme ? 'rgba(255,255,255,0.06)' : 'rgba(236,234,226,0.92)',
                  color: !hasApiKey || isExplainingTheme ? 'rgba(236,234,226,0.42)' : '#171817',
                  fontFamily: 'var(--ui-font)',
                  fontSize: 12,
                  cursor: !hasApiKey || isExplainingTheme ? 'default' : 'pointer',
                }}
                title={hasApiKey ? 'Explain this semantic theme with AI' : 'Add an API key in Settings > AI API'}
              >
                {isExplainingTheme ? 'Explaining…' : 'Explain Theme'}
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {detailCluster.keywords.slice(0, 6).map((word) => (
                  <span key={word} style={{
                    padding: '3px 7px',
                    border: '0.5px solid rgba(255,255,255,0.16)',
                    borderRadius: 999,
                    color: 'rgba(236,234,226,0.76)',
                    background: 'rgba(255,255,255,0.05)',
                  }}>
                    {word}
                  </span>
                ))}
              </div>
              <div style={{ fontFamily: 'var(--reader-font)', fontSize: 14, color: 'rgba(236,234,226,0.72)', lineHeight: 1.55 }}>
                {detailCluster.examples?.[0]?.snippet || 'No excerpt available.'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 650, color: '#ECEAE2', marginBottom: 8 }}>How to read it</div>
              <div>Each island is a semantic cluster. Dots are excerpts. Larger contour areas contain more results. Click an island to filter the list below.</div>
            </>
          )}
        </div>
      </div>
      {selectedCluster && selectedExplanation ? (
        <div style={{
          borderTop: '0.5px solid rgba(255,255,255,0.1)',
          padding: '16px 18px 18px',
          background: 'rgba(255,255,255,0.025)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginBottom: selectedExplanation.content || selectedExplanation.error || selectedExplanation.status === 'explaining' ? 10 : 0,
          }}>
            <div style={{ fontSize: 14, fontWeight: 750, color: '#ECEAE2' }}>{selectedCluster.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(236,234,226,0.48)' }}>AI Theme Explanation</div>
          </div>
          {selectedExplanation.status === 'explaining' ? (
            <div style={{ color: 'rgba(236,234,226,0.58)', fontSize: 12 }}>Reading this theme’s excerpts…</div>
          ) : null}
          {selectedExplanation.error ? (
            <div style={{ color: '#FBBF24', fontSize: 13 }}>{selectedExplanation.error}</div>
          ) : null}
          {selectedExplanation.content ? (
            <div style={{
              maxWidth: 860,
              fontFamily: 'var(--reader-font)',
              fontSize: 15,
              color: 'rgba(236,234,226,0.82)',
              lineHeight: 1.62,
            }}>
              <MarkdownContent content={selectedExplanation.content} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function SearchResultsPanel({
  query,
  status,
  results,
  onOpenResult,
  semanticMap,
  onBuildSemanticMap,
  themeExplanation,
  onExplainSemanticTheme,
  hasApiKey,
}) {
  const trimmed = query.trim();
  const [selectedWord, setSelectedWord] = useState('');
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const selectedToken = normalizeToken(selectedWord);
  const selectedCluster = semanticMap?.map?.clusters?.find((cluster) => cluster.id === selectedClusterId);
  const selectedItem = selectedItemId
    ? (semanticMap?.map?.clusters || []).flatMap((cluster) => cluster.items).find((item) => item.id === selectedItemId)
    : null;
  const selectedSemanticIds = useMemo(() => (
    new Set((selectedCluster?.items || []).map((item) => item.id))
  ), [selectedCluster]);
  const selectedIndexResults = useMemo(() => {
    const sourceItems = selectedItem
      ? [selectedItem]
      : selectedCluster?.items || [];
    return sourceItems.map((item) => ({
      id: item.id,
      bookId: item.bookId,
      bookTitle: item.bookTitle,
      bookAuthor: item.bookAuthor,
      format: item.format,
      label: item.label,
      snippet: item.snippet,
      href: item.href || null,
      pageNum: item.pageNum || null,
    }));
  }, [selectedCluster, selectedItem]);
  useEffect(() => { setSelectedWord(''); }, [trimmed]);
  useEffect(() => {
    setSelectedClusterId('');
    setSelectedItemId('');
  }, [trimmed]);
  const filteredResults = useMemo(() => {
    if (selectedItemId) {
      const matched = results.filter((result) => getResultKey(result) === selectedItemId);
      return matched.length > 0 ? matched : selectedIndexResults;
    }
    if (selectedClusterId && selectedSemanticIds.size > 0) {
      const matched = results.filter((result) => selectedSemanticIds.has(getResultKey(result)));
      return matched.length > 0 ? matched : selectedIndexResults;
    }
    if (!selectedToken) return results;
    return results.filter((result) => normalizeToken(result.snippet || '').includes(selectedToken));
  }, [results, selectedItemId, selectedClusterId, selectedSemanticIds, selectedToken, selectedIndexResults]);

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
        No search results found.
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 28px 40px' }}>
      <SemanticMap
        query={query}
        results={results}
        semanticMap={semanticMap}
        selectedClusterId={selectedClusterId}
        selectedItemId={selectedItemId}
        onBuild={onBuildSemanticMap}
        onSelectCluster={(clusterId) => {
          setSelectedClusterId(clusterId);
          setSelectedItemId('');
          setSelectedWord('');
        }}
        onSelectItem={(clusterId, itemId) => {
          setSelectedClusterId(clusterId);
          setSelectedItemId(itemId);
          setSelectedWord('');
        }}
        onReset={() => {
          setSelectedClusterId('');
          setSelectedItemId('');
        }}
        themeExplanation={themeExplanation}
        onExplainTheme={onExplainSemanticTheme}
        hasApiKey={hasApiKey}
      />
      <div style={{
        border: '0.5px solid var(--hairline)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--input-bg)',
      }}>
        {filteredResults.length === 0 ? (
          <div style={{
            padding: 28,
            color: 'var(--fg-faint)',
            fontFamily: 'var(--ui-font)',
            fontSize: 13,
            textAlign: 'center',
          }}>
            {selectedCluster
              ? `No results are available for “${selectedItem ? selectedItem.bookTitle : selectedCluster.name}”.`
              : `No results contain both “${query.trim()}” and “${selectedWord}”.`}
          </div>
        ) : filteredResults.map((result) => (
          <ResultRow key={result.id} result={result} query={query} onOpen={onOpenResult} />
        ))}
      </div>
    </div>
  );
}
