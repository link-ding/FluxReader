import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadBoard, saveBoard } from '../data/board.js';

const CARD_W = 240;
const CARD_H = 120;
const SNAP_DISTANCE = 8;
const BINDING_DISTANCE = 15;

const DEFAULT_STYLE = { stroke: 'var(--fg)', fill: 'none', strokeWidth: 1.5 };

const COLORS = [
  'var(--fg)', '#E05252', '#E07B2A', '#D4A017',
  '#3E9E5A', '#3B7DD8', '#8A5CDB', '#C45C9A',
];
const FILLS = [
  'none',
  'rgba(224,82,82,0.12)',
  'rgba(61,125,216,0.12)',
  'rgba(138,92,219,0.12)',
  'rgba(62,158,90,0.12)',
  'rgba(212,160,23,0.12)',
];

function pointsToPath(points) {
  if (points.length < 2) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function freehandToPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function arrowHead(x1, y1, x2, y2, size = 10) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = 0.42;
  return [
    `M ${x2 + Math.cos(angle + Math.PI - spread) * size} ${y2 + Math.sin(angle + Math.PI - spread) * size}`,
    `L ${x2} ${y2}`,
    `L ${x2 + Math.cos(angle + Math.PI + spread) * size} ${y2 + Math.sin(angle + Math.PI + spread) * size}`,
  ].join(' ');
}

function measureTextLines(lines, fontSize) {
  if (typeof document === 'undefined') {
    const maxLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    return Math.max(24, maxLine * fontSize * 0.55);
  }
  const canvas = measureTextLines.canvas || document.createElement('canvas');
  measureTextLines.canvas = canvas;
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${getComputedStyle(document.documentElement).getPropertyValue('--ui-font') || 'sans-serif'}`;
  return Math.max(24, ...lines.map(line => ctx.measureText(line || ' ').width));
}

function textBounds(shape) {
  const fontSize = shape.style?.fontSize || 15;
  const lineHeight = fontSize * (shape.style?.lineHeight || 1.25);
  const lines = String(shape.text || '').split('\n');
  const width = measureTextLines(lines, fontSize);
  const height = Math.max(fontSize, lines.length * lineHeight);
  return {
    x: shape.x,
    y: shape.y - fontSize,
    w: width,
    h: height,
  };
}

function shapeBounds(shape) {
  if ((shape.type === 'line' || shape.type === 'arrow') && shape.points?.length) {
    const xs = shape.points.map(point => point.x);
    const ys = shape.points.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (shape.type === 'freehand' && shape.points?.length) {
    const xs = shape.points.map(point => point.x);
    const ys = shape.points.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    const x = Math.min(shape.x, shape.x2);
    const y = Math.min(shape.y, shape.y2);
    return { x, y, w: Math.abs(shape.x2 - shape.x), h: Math.abs(shape.y2 - shape.y) };
  }
  if (shape.type === 'text') {
    return textBounds(shape);
  }
  return { x: shape.x, y: shape.y, w: shape.w || 60, h: shape.h || 30 };
}

function isBindableShape(shape) {
  return shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'text';
}

function bindableTargets(board, excludeShapeId = null) {
  return [
    ...board.cards.map(card => ({ kind: 'card', id: card.id, bounds: { x: card.x, y: card.y, w: CARD_W, h: CARD_H } })),
    ...board.shapes
      .filter(shape => shape.id !== excludeShapeId && isBindableShape(shape))
      .map(shape => ({ kind: 'shape', id: shape.id, bounds: shapeBounds(shape) })),
  ];
}

function pointInsideBounds(point, bounds) {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.w && point.y >= bounds.y && point.y <= bounds.y + bounds.h;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function projectPointToBounds(point, bounds) {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  if (pointInsideBounds(point, bounds)) {
    let dx = point.x - cx;
    let dy = point.y - cy;
    if (dx === 0 && dy === 0) dx = 1;
    const tx = dx > 0 ? (bounds.x + bounds.w - cx) / dx : dx < 0 ? (bounds.x - cx) / dx : Infinity;
    const ty = dy > 0 ? (bounds.y + bounds.h - cy) / dy : dy < 0 ? (bounds.y - cy) / dy : Infinity;
    const t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  const x = Math.min(bounds.x + bounds.w, Math.max(bounds.x, point.x));
  const y = Math.min(bounds.y + bounds.h, Math.max(bounds.y, point.y));
  return { x, y };
}

function fixedPointFromPoint(point, bounds) {
  return [
    bounds.w ? (point.x - bounds.x) / bounds.w : 0.5,
    bounds.h ? (point.y - bounds.y) / bounds.h : 0.5,
  ];
}

function pointFromFixedPoint(fixedPoint, bounds) {
  return {
    x: bounds.x + bounds.w * fixedPoint[0],
    y: bounds.y + bounds.h * fixedPoint[1],
  };
}

function boundsCenter(bounds) {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

function findTargetBounds(board, binding) {
  if (!binding) return null;
  if (binding.kind === 'card') {
    const card = board.cards.find(card => card.id === binding.id);
    return card ? { x: card.x, y: card.y, w: CARD_W, h: CARD_H } : null;
  }
  const shape = board.shapes.find(shape => shape.id === binding.id);
  return shape && isBindableShape(shape) ? shapeBounds(shape) : null;
}

function anchorPointForBinding(binding, board, otherPoint) {
  const bounds = findTargetBounds(board, binding);
  if (!bounds) return null;
  return binding.mode === 'orbit'
    ? projectPointToBounds(otherPoint || boundsCenter(bounds), bounds)
    : pointFromFixedPoint(binding.fixedPoint || [0.5, 0.5], bounds);
}

function findArrowBinding(point, board, excludeShapeId, scale) {
  const threshold = BINDING_DISTANCE / scale;
  let best = null;
  bindableTargets(board, excludeShapeId).forEach(target => {
    const anchor = projectPointToBounds(point, target.bounds);
    const d = pointInsideBounds(point, target.bounds) ? 0 : distance(point, anchor);
    if (d <= threshold && (!best || d < best.distance)) {
      best = {
        distance: d,
        point: anchor,
        binding: {
          kind: target.kind,
          id: target.id,
          mode: 'orbit',
          fixedPoint: fixedPointFromPoint(anchor, target.bounds),
        },
      };
    }
  });
  return best;
}

function replaceEndpoint(points, handle, point) {
  if (!points?.length) return points;
  return points.map((item, index) => {
    if (handle === 'start' && index === 0) return point;
    if (handle === 'end' && index === points.length - 1) return point;
    return item;
  });
}

function applyArrowBindings(shape, board) {
  if (shape.type !== 'arrow') return shape;
  let next = shape;
  const startBounds = findTargetBounds(board, shape.startBinding);
  const endBounds = findTargetBounds(board, shape.endBinding);
  const startReference = endBounds ? boundsCenter(endBounds) : { x: shape.x2, y: shape.y2 };
  const endReference = startBounds ? boundsCenter(startBounds) : { x: shape.x, y: shape.y };

  if (startBounds) {
    const point = anchorPointForBinding(shape.startBinding, board, startReference);
    next = {
      ...next,
      x: point.x,
      y: point.y,
      ...(next.points?.length ? { points: replaceEndpoint(next.points, 'start', point) } : {}),
    };
  }
  if (endBounds) {
    const point = anchorPointForBinding(shape.endBinding, board, endReference);
    next = {
      ...next,
      x2: point.x,
      y2: point.y,
      ...(next.points?.length ? { points: replaceEndpoint(next.points, 'end', point) } : {}),
    };
  }
  return next;
}

function applyAllArrowBindings(board) {
  const nextShapes = board.shapes.map(shape => applyArrowBindings(shape, board));
  return { ...board, shapes: nextShapes };
}

function resolveDrawingArrow(rawStart, rawEnd, board, bindings) {
  let start = rawStart;
  let end = rawEnd;
  if (bindings.end) {
    end = anchorPointForBinding(bindings.end, board, start) || end;
  }
  if (bindings.start) {
    start = anchorPointForBinding(bindings.start, board, end) || start;
  }
  if (bindings.end) {
    end = anchorPointForBinding(bindings.end, board, start) || end;
  }
  return { start, end };
}

function roundPoint(value) {
  return Math.round(value * 1000000) / 1000000;
}

function boundsSnapPoints(bounds) {
  const x1 = roundPoint(bounds.x);
  const y1 = roundPoint(bounds.y);
  const x2 = roundPoint(bounds.x + bounds.w);
  const y2 = roundPoint(bounds.y + bounds.h);
  const cx = roundPoint(bounds.x + bounds.w / 2);
  const cy = roundPoint(bounds.y + bounds.h / 2);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x1, y: y2 },
    { x: x2, y: y2 },
    { x: cx, y: cy },
  ];
}

function shiftedBounds(bounds, dx, dy) {
  return { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
}

function boardSnapTargets(board, exclude) {
  const cardTargets = board.cards
    .filter(card => !(exclude.kind === 'card' && exclude.id === card.id))
    .map(card => ({ bounds: { x: card.x, y: card.y, w: CARD_W, h: CARD_H } }));
  const shapeTargets = board.shapes
    .filter(shape => !(exclude.kind === 'shape' && exclude.id === shape.id))
    .map(shape => ({ bounds: shapeBounds(shape) }));
  return [...cardTargets, ...shapeTargets];
}

function nearestPointSnaps(bounds, targets, scale) {
  const minOffset = { x: SNAP_DISTANCE / scale, y: SNAP_DISTANCE / scale };
  const snaps = { x: [], y: [] };
  const movingPoints = boundsSnapPoints(bounds);
  const targetPoints = targets.flatMap(target => boundsSnapPoints(target.bounds));

  movingPoints.forEach(point => {
    targetPoints.forEach(targetPoint => {
      const offsetX = roundPoint(targetPoint.x - point.x);
      const offsetY = roundPoint(targetPoint.y - point.y);
      if (Math.abs(offsetX) <= minOffset.x) {
        if (Math.abs(offsetX) < minOffset.x) snaps.x.length = 0;
        minOffset.x = Math.abs(offsetX);
        snaps.x.push({ axis: 'x', offset: offsetX, from: point, to: targetPoint });
      }
      if (Math.abs(offsetY) <= minOffset.y) {
        if (Math.abs(offsetY) < minOffset.y) snaps.y.length = 0;
        minOffset.y = Math.abs(offsetY);
        snaps.y.push({ axis: 'y', offset: offsetY, from: point, to: targetPoint });
      }
    });
  });

  return snaps;
}

function snapGuidesFromSnaps(snaps) {
  const guides = [];
  const byX = new Map();
  const byY = new Map();

  snaps.x.forEach(snap => {
    const key = roundPoint(snap.from.x + snap.offset);
    const points = byX.get(key) || [];
    points.push({ x: key, y: snap.from.y }, { x: key, y: snap.to.y });
    byX.set(key, points);
  });
  snaps.y.forEach(snap => {
    const key = roundPoint(snap.from.y + snap.offset);
    const points = byY.get(key) || [];
    points.push({ x: snap.from.x, y: key }, { x: snap.to.x, y: key });
    byY.set(key, points);
  });

  byX.forEach((points, value) => {
    const ys = points.map(point => point.y);
    guides.push({ axis: 'x', value, start: Math.min(...ys), end: Math.max(...ys) });
  });
  byY.forEach((points, value) => {
    const xs = points.map(point => point.x);
    guides.push({ axis: 'y', value, start: Math.min(...xs), end: Math.max(...xs) });
  });

  return guides;
}

function snapDrag(bounds, targets, scale) {
  const snaps = nearestPointSnaps(bounds, targets, scale);
  const offsetX = snaps.x[0]?.offset || 0;
  const offsetY = snaps.y[0]?.offset || 0;
  const adjusted = shiftedBounds(bounds, offsetX, offsetY);
  const adjustedSnaps = nearestPointSnaps(adjusted, targets, Infinity);

  return {
    offsetX,
    offsetY,
    guides: snapGuidesFromSnaps(adjustedSnaps),
  };
}

function isEditingTarget(target) {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
}

function SelectionHalo({ x, y, w, h, pad = 5 }) {
  return (
    <rect
      x={x - pad}
      y={y - pad}
      width={w + pad * 2}
      height={h + pad * 2}
      fill="none"
      stroke="var(--accent)"
      strokeWidth="1"
      strokeDasharray="4 3"
      rx="3"
      style={{ pointerEvents: 'none' }}
    />
  );
}

function ResizeHandle({ x, y, cursor, onMouseDown }) {
  return (
    <rect
      x={x - 4}
      y={y - 4}
      width={8}
      height={8}
      rx={2}
      fill="var(--app-bg)"
      stroke="var(--accent)"
      strokeWidth="1.2"
      onMouseDown={onMouseDown}
      style={{ cursor }}
    />
  );
}

function ShapeEl({ shape, selected, onMouseDown, onDoubleClick, onResizeStart }) {
  const { type, x, y, w = 0, h = 0, x2 = x, y2 = y, points = [], text = '', style = {} } = shape;
  const stroke = style.stroke || 'var(--fg)';
  const fill = style.fill && style.fill !== 'none' ? style.fill : 'none';
  const strokeWidth = style.strokeWidth || 1.5;

  const shared = {
    stroke,
    fill,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: style.opacity ?? 1,
    strokeDasharray: style.strokeDasharray,
    style: { pointerEvents: 'none' },
  };

  if (type === 'rect') {
    const radius = Math.min(5, w * 0.08, h * 0.08);
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={radius} fill="transparent" stroke="transparent" strokeWidth={14} onMouseDown={onMouseDown} style={{ cursor: 'move' }} />
        <rect x={x} y={y} width={w} height={h} rx={radius} {...shared} />
        {selected && <SelectionHalo x={x} y={y} w={w} h={h} />}
        {selected && (
          <>
            <ResizeHandle x={x} y={y} cursor="nwse-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'nw'); }} />
            <ResizeHandle x={x + w} y={y} cursor="nesw-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'ne'); }} />
            <ResizeHandle x={x + w} y={y + h} cursor="nwse-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'se'); }} />
            <ResizeHandle x={x} y={y + h} cursor="nesw-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'sw'); }} />
          </>
        )}
      </g>
    );
  }

  if (type === 'ellipse') {
    return (
      <g>
        <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="transparent" stroke="transparent" strokeWidth={14} onMouseDown={onMouseDown} style={{ cursor: 'move' }} />
        <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...shared} />
        {selected && <SelectionHalo x={x} y={y} w={w} h={h} />}
        {selected && (
          <>
            <ResizeHandle x={x} y={y} cursor="nwse-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'nw'); }} />
            <ResizeHandle x={x + w} y={y} cursor="nesw-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'ne'); }} />
            <ResizeHandle x={x + w} y={y + h} cursor="nwse-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'se'); }} />
            <ResizeHandle x={x} y={y + h} cursor="nesw-resize" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'sw'); }} />
          </>
        )}
      </g>
    );
  }

  if (type === 'line' || type === 'arrow') {
    const linePoints = points.length >= 2 ? points : [{ x, y }, { x: x2, y: y2 }];
    const start = linePoints[0];
    const end = linePoints[linePoints.length - 1];
    const beforeEnd = linePoints[linePoints.length - 2] || start;
    const d = pointsToPath(linePoints);
    return (
      <g>
        <path d={d} stroke="transparent" strokeWidth={14} fill="none" strokeLinecap="round" strokeLinejoin="round" onMouseDown={onMouseDown} style={{ cursor: 'move' }} />
        <path d={d} {...shared} fill="none" />
        {type === 'arrow' && <path d={arrowHead(beforeEnd.x, beforeEnd.y, end.x, end.y)} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={style.opacity ?? 1} style={{ pointerEvents: 'none' }} />}
        {selected && (
          <>
            <circle cx={start.x} cy={start.y} r={5} fill="var(--app-bg)" stroke="var(--accent)" strokeWidth="1.2" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'start'); }} style={{ cursor: 'crosshair' }} />
            <circle cx={end.x} cy={end.y} r={5} fill="var(--app-bg)" stroke="var(--accent)" strokeWidth="1.2" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart(event, 'end'); }} style={{ cursor: 'crosshair' }} />
            <path d={d} stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 3" fill="none" style={{ pointerEvents: 'none' }} />
          </>
        )}
      </g>
    );
  }

  if (type === 'freehand') {
    const d = freehandToPath(points);
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const bx = Math.min(...xs);
    const by = Math.min(...ys);
    const bw = Math.max(...xs) - bx;
    const bh = Math.max(...ys) - by;
    return (
      <g>
        <path d={d} stroke="transparent" strokeWidth={Math.max(14, strokeWidth + 10)} fill="none" onMouseDown={onMouseDown} style={{ cursor: 'move' }} />
        <path d={d} {...shared} />
        {selected && <SelectionHalo x={bx} y={by} w={bw} h={bh} pad={8} />}
      </g>
    );
  }

  if (type === 'text') {
    const fontSize = style.fontSize || 15;
    const lineHeight = fontSize * (style.lineHeight || 1.25);
    const lines = String(text || '').split('\n');
    const bounds = textBounds(shape);
    return (
      <g onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} style={{ cursor: 'move' }}>
        <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="transparent" />
        <text x={x} y={y} fontFamily="var(--ui-font)" fontSize={fontSize} fill={stroke} opacity={style.opacity ?? 1} style={{ userSelect: 'none' }}>
          {(text ? lines : ['']).map((line, index) => (
            <tspan key={index} x={x} dy={index === 0 ? 0 : lineHeight}>{line}</tspan>
          ))}
        </text>
        {selected && <SelectionHalo x={bounds.x} y={bounds.y} w={bounds.w} h={bounds.h} pad={2} />}
      </g>
    );
  }

  return null;
}

function DrawPreview({ tool, start, end, points, style = {} }) {
  if (!start || !end) return null;
  const stroke = style.stroke || 'var(--fg)';
  const strokeWidth = style.strokeWidth || 1.5;
  const fill = style.fill && style.fill !== 'none' ? style.fill : 'none';
  const base = { stroke, strokeWidth, fill, strokeLinecap: 'round', strokeLinejoin: 'round', pointerEvents: 'none', opacity: 0.65 };
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  if (tool === 'rect') return <rect x={x} y={y} width={w} height={h} rx={Math.min(5, w * 0.08, h * 0.08)} {...base} />;
  if (tool === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...base} />;
  if (tool === 'line') return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...base} />;
  if (tool === 'arrow') return <><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...base} /><path d={arrowHead(start.x, start.y, end.x, end.y)} {...base} fill="none" /></>;
  if (tool === 'freehand') return <path d={freehandToPath(points)} {...base} fill="none" />;
  return null;
}

const TOOLS = [
  ['select', 'Select', <path d="M3 2l10 6-5 1-3 5L3 2z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />],
  ['rect', 'Rectangle', <rect x="2.5" y="3.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />],
  ['ellipse', 'Ellipse', <ellipse cx="8" cy="8" rx="5.5" ry="4" stroke="currentColor" strokeWidth="1.3" fill="none" />],
  ['line', 'Line', <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />],
  ['arrow', 'Arrow', <><line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M13 3l-4 1 3 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" strokeLinecap="round" /></>],
  ['freehand', 'Pencil', <path d="M3 13l2-1 7-7-1-1-7 7-1 2zM11 4l1 1" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" strokeLinecap="round" />],
  ['text', 'Text', <path d="M3 4h10M8 4v9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />],
  ['card', 'Card', <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>],
];

function ToolButton({ active, title, onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 32,
        height: 32,
        padding: 0,
        border: 'none',
        borderRadius: 6,
        background: active ? 'var(--selected)' : hover ? 'var(--hover)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--fg-muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function ToolPalette({ tool, setTool, style, setStyle }) {
  const [styleOpen, setStyleOpen] = useState(false);
  return (
    <div style={{
      position: 'absolute',
      left: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      background: 'var(--app-bg)',
      border: '0.5px solid var(--hairline-strong)',
      borderRadius: 10,
      padding: 5,
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    }}>
      {TOOLS.map(([id, label, icon], index) => (
        <div key={id}>
          {index === 7 && <div style={{ height: 0.5, background: 'var(--hairline)', margin: '3px 0' }} />}
          <ToolButton active={tool === id} title={label} onClick={() => setTool(id)}>
            <svg width="16" height="16" viewBox="0 0 16 16">{icon}</svg>
          </ToolButton>
        </div>
      ))}
      <div style={{ height: 0.5, background: 'var(--hairline)', margin: '3px 0' }} />
      <ToolButton active={styleOpen} title="Style" onClick={() => setStyleOpen(v => !v)}>
        <div style={{ width: 14, height: 14, borderRadius: 2, border: `2px solid ${style.stroke}`, background: style.fill === 'none' ? 'transparent' : style.fill }} />
      </ToolButton>
      {styleOpen && (
        <div style={{
          position: 'absolute',
          left: 46,
          top: 0,
          width: 200,
          padding: 14,
          background: 'var(--app-bg)',
          border: '0.5px solid var(--hairline-strong)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Stroke</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {COLORS.map(color => (
              <button key={color} onClick={() => setStyle(s => ({ ...s, stroke: color }))} style={{ width: 18, height: 18, borderRadius: 999, background: color, border: style.stroke === color ? '2px solid var(--accent)' : '1.5px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Fill</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {FILLS.map(fill => (
              <button key={fill} onClick={() => setStyle(s => ({ ...s, fill }))} style={{ width: 18, height: 18, borderRadius: 3, background: fill === 'none' ? 'transparent' : fill, border: style.fill === fill ? '1.5px solid var(--accent)' : '1px solid var(--hairline-strong)', cursor: 'pointer' }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Weight</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 2, 3.5].map(weight => (
              <button key={weight} onClick={() => setStyle(s => ({ ...s, strokeWidth: weight }))} style={{ flex: 1, height: 26, borderRadius: 4, border: style.strokeWidth === weight ? '1.5px solid var(--accent)' : '0.5px solid var(--hairline-strong)', background: 'var(--input-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '60%', height: weight, background: 'var(--fg)', borderRadius: 2 }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniButton({ title, onClick, children }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 18, height: 18, padding: 0, border: '0.5px solid var(--hairline-strong)', borderRadius: 3, background: 'var(--input-bg)', color: 'var(--fg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {children}
    </button>
  );
}

function BoardCard({ card, selected, linking, onMouseDown, onConnect, onDelete, onEdit, onOpenSource }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.note || '');
  const inputRef = useRef(null);
  const hasSourceTarget = !!(card.cfi || card.href || card.pageNum || card.source || card.quote);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={event => { if (!editing) onMouseDown(event); }}
      style={{
        position: 'absolute',
        left: card.x,
        top: card.y,
        width: CARD_W,
        background: card.color || 'var(--app-bg)',
        borderRadius: 8,
        boxShadow: linking
          ? '0 0 0 2px var(--accent), 0 4px 16px rgba(0,0,0,0.14)'
          : selected
          ? '0 0 0 1.5px var(--accent), 0 4px 16px rgba(0,0,0,0.14)'
          : hover
          ? '0 0 0 1px var(--hairline-strong), 0 8px 24px rgba(0,0,0,0.12)'
          : '0 0 0 0.5px var(--hairline-strong), 0 2px 8px rgba(0,0,0,0.08)',
        cursor: editing ? 'default' : 'grab',
        userSelect: editing ? 'text' : 'none',
        zIndex: selected ? 10 : 1,
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ padding: '7px 10px 6px', borderBottom: '0.5px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.025)' }}>
        <div style={{ flex: 1, fontFamily: 'var(--mono-font)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.source || 'Note'}</div>
        {(hover || selected) && !editing && (
          <>
            {hasSourceTarget && (
              <MiniButton title="Open in book" onClick={event => { event.stopPropagation(); onOpenSource?.(card); }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 8V2.5A1.5 1.5 0 013.5 1H8v6H3.5A1.5 1.5 0 002 8zm0 0A1.5 1.5 0 003.5 9H8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </MiniButton>
            )}
            <MiniButton title="Edit" onClick={event => { event.stopPropagation(); setEditing(true); setDraft(card.note || ''); setTimeout(() => inputRef.current?.focus(), 0); }}>
              <svg width="9" height="9" viewBox="0 0 10 10"><path d="M1 9h8M7 1l2 2-5 5H2V6l5-5z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinejoin="round" /></svg>
            </MiniButton>
            <MiniButton title="Connect" onClick={event => { event.stopPropagation(); onConnect(card.id); }}>
              <svg width="9" height="9" viewBox="0 0 10 10"><circle cx="2" cy="5" r="1.5" stroke="currentColor" strokeWidth="1" fill="none" /><circle cx="8" cy="5" r="1.5" stroke="currentColor" strokeWidth="1" fill="none" /><path d="M3.5 5h3" stroke="currentColor" strokeWidth="1" /></svg>
            </MiniButton>
            <MiniButton title="Delete" onClick={event => { event.stopPropagation(); onDelete(card.id); }}>
              <svg width="9" height="9" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
            </MiniButton>
          </>
        )}
      </div>
      {card.quote ? (
        <div style={{ margin: '10px 10px 0', paddingLeft: 10, borderLeft: '2.5px solid var(--accent)', fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.45, color: 'var(--fg)' }}>
          "{card.quote}"
        </div>
      ) : null}
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => { setEditing(false); onEdit(card.id, draft); }}
          placeholder="Add note..."
          style={{ display: 'block', width: '100%', minHeight: 60, padding: '10px 12px', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--ui-font)', fontSize: 12, color: 'var(--fg)', lineHeight: 1.5, resize: 'none', boxSizing: 'border-box' }}
        />
      ) : card.note ? (
        <div style={{ padding: '10px 12px', fontFamily: 'var(--ui-font)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{card.note}</div>
      ) : null}
      <div style={{ height: 12 }} />
      {linking && <div style={{ position: 'absolute', inset: 0, border: '2px dashed var(--accent)', borderRadius: 8, pointerEvents: 'none' }} />}
    </div>
  );
}

function ConnectionLine({ from, to, cards, onDelete }) {
  const [hover, setHover] = useState(false);
  const a = cards.find(card => card.id === from);
  const b = cards.find(card => card.id === to);
  if (!a || !b) return null;

  const ax = a.x + CARD_W / 2;
  const ay = a.y + CARD_H / 2;
  const bx = b.x + CARD_W / 2;
  const by = b.y + CARD_H / 2;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const d = `M ${ax} ${ay} C ${ax + (bx - ax) * 0.25} ${ay} ${ax + (bx - ax) * 0.75} ${by} ${bx} ${by}`;

  return (
    <g>
      <path d={d} stroke={hover ? 'var(--accent)' : 'var(--fg-faint)'} strokeWidth={hover ? 2 : 1.5} fill="none" strokeDasharray={hover ? 'none' : '4 3'} opacity={hover ? 1 : 0.6} style={{ pointerEvents: 'none' }} />
      <path d={d} stroke="transparent" strokeWidth={12} fill="none" style={{ cursor: 'pointer' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={() => onDelete(from, to)} />
      {hover && (
        <g style={{ cursor: 'pointer' }} onClick={() => onDelete(from, to)}>
          <circle cx={mx} cy={my} r={8} fill="var(--app-bg)" stroke="var(--accent)" strokeWidth="1" />
          <path d={`M ${mx - 3} ${my - 3} l 6 6 M ${mx + 3} ${my - 3} l -6 6`} stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

function BottomBar({ scale, addCard, resetZoom, resetPan, linkingFrom, cancelLink }) {
  return (
    <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 12, display: 'flex', gap: 4, alignItems: 'center', background: 'var(--app-bg)', border: '0.5px solid var(--hairline-strong)', borderRadius: 10, padding: '5px 10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontFamily: 'var(--ui-font)' }}>
      <BarButton onClick={addCard} title="Add card"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg><span>Card</span></BarButton>
      <Divider />
      <BarButton onClick={resetZoom} title="Reset zoom"><span>{Math.round(scale * 100)}%</span></BarButton>
      <BarButton onClick={resetPan} title="Fit"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2h3M2 2v3M10 10H7M10 10v-3M10 2h-3M10 2v3M2 10h3M2 10v-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg></BarButton>
      <Divider />
      {linkingFrom ? (
        <BarButton onClick={cancelLink} title="Cancel link"><span>Click a card to connect</span></BarButton>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--fg-faint)', padding: '0 4px' }}>Two-finger pan · pinch or Option-scroll zoom</span>
      )}
    </div>
  );
}

function BarButton({ onClick, title, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', border: 'none', borderRadius: 6, background: hover ? 'var(--hover)' : 'transparent', cursor: 'pointer', color: 'var(--fg-muted)', fontFamily: 'var(--ui-font)', fontSize: 11 }}>
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 0.5, height: 18, background: 'var(--hairline-strong)', margin: '0 2px' }} />;
}

function TextEditor({ shape, pan, scale, onDone }) {
  const [value, setValue] = useState(shape.text || '');
  const ref = useRef(null);
  const fontSize = shape.style?.fontSize || 15;
  const editingShape = { ...shape, text: value || ' ' };
  const bounds = textBounds(editingShape);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={event => setValue(event.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          onDone(value);
        }
      }}
      style={{
        position: 'absolute',
        left: bounds.x * scale + pan.x - 4,
        top: bounds.y * scale + pan.y - 3,
        width: Math.max(48, bounds.w * scale + 10),
        fontFamily: 'var(--ui-font)',
        fontSize: fontSize * scale,
        lineHeight: `${fontSize * 1.25 * scale}px`,
        color: shape.style?.stroke || 'var(--fg)',
        background: 'transparent',
        border: '1px dashed var(--accent)',
        borderRadius: 5,
        outline: 'none',
        padding: '1px 4px',
        boxSizing: 'border-box',
        zIndex: 50,
      }}
    />
  );
}

function normalizeBoard(data) {
  return {
    cards: data.cards || [],
    shapes: data.shapes || [],
    connections: data.connections || [],
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteOr(value, fallback = 0) {
  return isFiniteNumber(value) ? value : fallback;
}

function normalizeColor(color, fallback) {
  if (!color || color === 'transparent') return fallback;
  return color;
}

function excalidrawStyle(element) {
  const strokeStyle = element.strokeStyle === 'dashed'
    ? '8 6'
    : element.strokeStyle === 'dotted'
    ? '2 5'
    : undefined;
  return {
    stroke: normalizeColor(element.strokeColor, 'var(--fg)'),
    fill: normalizeColor(element.backgroundColor, 'none'),
    strokeWidth: Math.max(1, finiteOr(element.strokeWidth, 2)),
    opacity: Math.max(0, Math.min(1, finiteOr(element.opacity, 100) / 100)),
    strokeDasharray: strokeStyle,
    fontSize: element.type === 'text' ? finiteOr(element.fontSize, 20) : undefined,
    lineHeight: element.type === 'text' ? finiteOr(element.lineHeight, 1.25) : undefined,
  };
}

function uniqueShapeId(base, usedIds) {
  const cleanBase = String(base || `shape-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '-');
  let id = `excalidraw-${cleanBase}`;
  let count = 1;
  while (usedIds.has(id)) {
    id = `excalidraw-${cleanBase}-${count}`;
    count += 1;
  }
  usedIds.add(id);
  return id;
}

function elementPoints(element) {
  if (Array.isArray(element.points) && element.points.length >= 2) {
    return element.points
      .filter(point => Array.isArray(point) && isFiniteNumber(point[0]) && isFiniteNumber(point[1]))
      .map(point => ({ x: finiteOr(element.x) + point[0], y: finiteOr(element.y) + point[1] }));
  }
  return [
    { x: finiteOr(element.x), y: finiteOr(element.y) },
    { x: finiteOr(element.x) + finiteOr(element.width), y: finiteOr(element.y) + finiteOr(element.height) },
  ];
}

function translatedShape(shape, dx, dy) {
  if (shape.type === 'line' || shape.type === 'arrow') {
    return {
      ...shape,
      x: shape.x + dx,
      y: shape.y + dy,
      x2: shape.x2 + dx,
      y2: shape.y2 + dy,
      points: shape.points?.map(point => ({ x: point.x + dx, y: point.y + dy })),
    };
  }
  if (shape.type === 'freehand') {
    return {
      ...shape,
      points: shape.points?.map(point => ({ x: point.x + dx, y: point.y + dy })),
    };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

function parseExcalidrawClipboard(event) {
  const types = [
    'application/vnd.excalidraw+json',
    'application/json',
    'text/plain',
  ];
  for (const type of types) {
    const raw = event.clipboardData?.getData(type);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.elements) && String(data?.type || '').startsWith('excalidraw')) return data;
      if (Array.isArray(data?.elements) && data.elements.some(element => element?.type)) return data;
    } catch {}
  }
  return null;
}

function excalidrawToShapes(data, existingShapes, viewportCenter) {
  const elements = Array.isArray(data?.elements) ? data.elements.filter(element => element && !element.isDeleted) : [];
  const usedIds = new Set(existingShapes.map(shape => shape.id));
  const shapes = [];

  elements.forEach((element) => {
    const id = uniqueShapeId(element.id, usedIds);
    const style = excalidrawStyle(element);
    const x = finiteOr(element.x);
    const y = finiteOr(element.y);
    const w = Math.abs(finiteOr(element.width));
    const h = Math.abs(finiteOr(element.height));
    const boxX = finiteOr(element.width) < 0 ? x - w : x;
    const boxY = finiteOr(element.height) < 0 ? y - h : y;

    if (element.type === 'rectangle' || element.type === 'diamond') {
      shapes.push({ id, type: 'rect', x: boxX, y: boxY, w, h, style });
      return;
    }

    if (element.type === 'ellipse') {
      shapes.push({ id, type: 'ellipse', x: boxX, y: boxY, w, h, style });
      return;
    }

    if (element.type === 'line' || element.type === 'arrow') {
      const points = elementPoints(element);
      if (points.length < 2) return;
      const start = points[0];
      const end = points[points.length - 1];
      shapes.push({
        id,
        type: element.type === 'arrow' || element.endArrowhead ? 'arrow' : 'line',
        x: start.x,
        y: start.y,
        x2: end.x,
        y2: end.y,
        points,
        style,
      });
      return;
    }

    if (element.type === 'freedraw') {
      const points = elementPoints(element);
      if (points.length < 2) return;
      shapes.push({ id, type: 'freehand', x: 0, y: 0, points, style });
      return;
    }

    if (element.type === 'text') {
      const fontSize = finiteOr(element.fontSize, 20);
      shapes.push({
        id,
        type: 'text',
        x,
        y: y + fontSize,
        text: element.text || element.rawText || '',
        style: { ...style, fontSize, lineHeight: finiteOr(element.lineHeight, 1.25) },
      });
    }
  });

  if (!shapes.length) return [];

  const bounds = shapes.reduce((acc, shape) => {
    const box = shapeBounds(shape);
    return {
      minX: Math.min(acc.minX, box.x),
      minY: Math.min(acc.minY, box.y),
      maxX: Math.max(acc.maxX, box.x + box.w),
      maxY: Math.max(acc.maxY, box.y + box.h),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const dx = finiteOr(viewportCenter?.x) - cx;
  const dy = finiteOr(viewportCenter?.y) - cy;
  return shapes.map(shape => translatedShape(shape, dx, dy));
}

function resizeBox(original, handle, dx, dy) {
  const minSize = 14;
  let x = original.x;
  let y = original.y;
  let w = original.w;
  let h = original.h;

  if (handle.includes('e')) w = original.w + dx;
  if (handle.includes('s')) h = original.h + dy;
  if (handle.includes('w')) {
    x = original.x + dx;
    w = original.w - dx;
  }
  if (handle.includes('n')) {
    y = original.y + dy;
    h = original.h - dy;
  }

  if (w < minSize) {
    if (handle.includes('w')) x = original.x + original.w - minSize;
    w = minSize;
  }
  if (h < minSize) {
    if (handle.includes('n')) y = original.y + original.h - minSize;
    h = minSize;
  }

  return { x, y, w, h };
}

export default function Whiteboard({ book, onOpenSource }) {
  const [board, setBoard] = useState(() => normalizeBoard(loadBoard(book.id)));
  const [tool, setTool] = useState('select');
  const [drawStyle, setDrawStyle] = useState(DEFAULT_STYLE);
  const [selected, setSelected] = useState([]);
  const [linkingFrom, setLinkingFrom] = useState(null);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const [scale, setScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState(null);
  const [endPt, setEndPt] = useState(null);
  const [freePoints, setFreePoints] = useState([]);
  const [editingText, setEditingText] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [snapGuides, setSnapGuides] = useState([]);
  const [spaceDown, setSpaceDown] = useState(false);

  const canvasRef = useRef(null);
  const dragging = useRef(null);
  const panning = useRef(null);
  const marqueeStart = useRef(null);
  const drawingBinding = useRef({ start: null, end: null });
  const hitRef = useRef(false);
  const boardRef = useRef(board);

  const selectedIds = useMemo(() => new Set(selected.map(item => item.id)), [selected]);
  const isEmpty = board.cards.length === 0 && board.shapes.length === 0;

  useEffect(() => {
    const next = normalizeBoard(loadBoard(book.id));
    setBoard(next);
    boardRef.current = next;
    setSelected([]);
    setSnapGuides([]);
    drawingBinding.current = { start: null, end: null };
    setTool('select');
  }, [book.id]);

  const persist = useCallback((patch) => {
    setBoard(prev => {
      const next = normalizeBoard({ ...prev, ...patch });
      boardRef.current = next;
      saveBoard(book.id, next);
      return next;
    });
  }, [book.id]);

  const toCanvas = useCallback((event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left - pan.x) / scale,
      y: (event.clientY - rect.top - pan.y) / scale,
    };
  }, [pan, scale]);

  useEffect(() => {
    const onPaste = (event) => {
      if (isEditingTarget(event.target)) return;
      const data = parseExcalidrawClipboard(event);
      if (!data) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      const viewportCenter = rect
        ? { x: (rect.width / 2 - pan.x) / scale, y: (rect.height / 2 - pan.y) / scale }
        : { x: 0, y: 0 };
      const imported = excalidrawToShapes(data, boardRef.current.shapes, viewportCenter);
      if (!imported.length) return;

      event.preventDefault();
      persist({ shapes: [...boardRef.current.shapes, ...imported] });
      setSelected(imported.map(shape => ({ id: shape.id, kind: 'shape' })));
      setTool('select');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pan, persist, scale]);

  useEffect(() => {
    const onKey = (event) => {
      if (isEditingTarget(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpaceDown(true);
        return;
      }
      const map = { v: 'select', r: 'rect', e: 'ellipse', l: 'line', a: 'arrow', p: 'freehand', t: 'text', n: 'card' };
      if (map[event.key]) {
        setTool(map[event.key]);
        return;
      }
      if (event.key === 'Escape') {
        setLinkingFrom(null);
        setDrawing(false);
        setMarquee(null);
        setSnapGuides([]);
        drawingBinding.current = { start: null, end: null };
        setSelected([]);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length > 0) {
        const cardIds = new Set(selected.filter(item => item.kind === 'card').map(item => item.id));
        const shapeIds = new Set(selected.filter(item => item.kind === 'shape').map(item => item.id));
        persist({
          cards: boardRef.current.cards.filter(card => !cardIds.has(card.id)),
          shapes: boardRef.current.shapes.filter(shape => !shapeIds.has(shape.id)),
          connections: boardRef.current.connections.filter(conn => !cardIds.has(conn.from) && !cardIds.has(conn.to)),
        });
        setSelected([]);
      }
    };
    const onKeyUp = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setSpaceDown(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [persist, selected]);

  const onWheel = useCallback((event) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (!event.ctrlKey && !event.altKey && !event.metaKey) {
      setPan(current => ({
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      }));
      return;
    }

    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const nextScale = Math.min(3, Math.max(0.25, scale + (event.deltaY < 0 ? 0.05 : -0.05)));
    const anchorX = (localX - pan.x) / scale;
    const anchorY = (localY - pan.y) / scale;

    setScale(nextScale);
    setPan({
      x: localX - anchorX * nextScale,
      y: localY - anchorY * nextScale,
    });
  }, [pan, scale]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const addCard = useCallback((point = { x: 120 + Math.random() * 80, y: 80 + Math.random() * 80 }) => {
    persist({
      cards: [
        ...boardRef.current.cards,
        { id: Date.now().toString(), x: point.x, y: point.y, quote: '', note: '', source: 'Note' },
      ],
    });
  }, [persist]);

  const onCanvasMouseDown = (event) => {
    if (event.button === 1 || (event.button === 0 && (event.altKey || spaceDown))) {
      panning.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    const point = toCanvas(event);

    if (tool === 'card') {
      addCard(point);
      setTool('select');
      return;
    }
    if (tool === 'text') {
      const id = Date.now().toString();
      persist({ shapes: [...boardRef.current.shapes, { id, type: 'text', x: point.x, y: point.y, text: '', style: { ...drawStyle, fontSize: 15 } }] });
      setEditingText(id);
      setTool('select');
      return;
    }
    if (tool === 'select') {
      if (!hitRef.current) {
        setSelected([]);
        marqueeStart.current = point;
        setMarquee({ x: point.x, y: point.y, w: 0, h: 0 });
      }
      hitRef.current = false;
      return;
    }

    const startBinding = tool === 'arrow' ? findArrowBinding(point, boardRef.current, null, scale) : null;
    const startPoint = startBinding?.point || point;
    drawingBinding.current = { rawStart: point, start: startBinding?.binding || null, end: null };
    setDrawing(true);
    setStartPt(startPoint);
    setEndPt(startPoint);
    if (tool === 'freehand') setFreePoints([point]);
  };

  const onCanvasDoubleClick = (event) => {
    if (isEditingTarget(event.target)) return;
    const tag = String(event.target?.tagName || '').toLowerCase();
    if (event.target !== canvasRef.current && tag !== 'svg') return;

    event.preventDefault();
    const point = toCanvas(event);
    const id = Date.now().toString();
    persist({
      shapes: [
        ...boardRef.current.shapes,
        { id, type: 'text', x: point.x, y: point.y, text: '', style: { ...drawStyle, fontSize: 15 } },
      ],
    });
    setSelected([{ id, kind: 'shape' }]);
    setEditingText(id);
    setTool('select');
  };

  const onMouseMove = (event) => {
    if (panning.current) {
      setSnapGuides([]);
      setPan({
        x: panning.current.px + event.clientX - panning.current.x,
        y: panning.current.py + event.clientY - panning.current.y,
      });
      return;
    }

    const point = toCanvas(event);
    if (marqueeStart.current) {
      setSnapGuides([]);
      setMarquee({
        x: Math.min(marqueeStart.current.x, point.x),
        y: Math.min(marqueeStart.current.y, point.y),
        w: Math.abs(point.x - marqueeStart.current.x),
        h: Math.abs(point.y - marqueeStart.current.y),
      });
      return;
    }

    if (drawing) {
      setSnapGuides([]);
      const endBinding = tool === 'arrow' ? findArrowBinding(point, boardRef.current, null, scale) : null;
      drawingBinding.current = {
        ...drawingBinding.current,
        end: endBinding?.binding || null,
      };
      if (tool === 'arrow') {
        const resolved = resolveDrawingArrow(drawingBinding.current.rawStart || startPt, point, boardRef.current, drawingBinding.current);
        setStartPt(resolved.start);
        setEndPt(resolved.end);
      } else {
        setEndPt(point);
      }
      if (tool === 'freehand') setFreePoints(prev => [...prev, point]);
      return;
    }

    if (dragging.current) {
      const drag = dragging.current;
      const dx = (event.clientX - drag.startX) / scale;
      const dy = (event.clientY - drag.startY) / scale;
      if (drag.type === 'card') {
        const snap = snapDrag(shiftedBounds(drag.origBounds, dx, dy), boardSnapTargets(boardRef.current, { kind: 'card', id: drag.id }), scale);
        const nextDx = dx + snap.offsetX;
        const nextDy = dy + snap.offsetY;
        setSnapGuides(snap.guides);
        const nextCards = boardRef.current.cards.map(card => card.id === drag.id ? { ...card, x: drag.origX + nextDx, y: drag.origY + nextDy } : card);
        const nextBoard = applyAllArrowBindings({ ...boardRef.current, cards: nextCards });
        persist({ cards: nextBoard.cards, shapes: nextBoard.shapes });
      } else if (drag.type === 'resize') {
        setSnapGuides([]);
        const nextShapes = boardRef.current.shapes.map(shape => {
          if (shape.id !== drag.id) return shape;
            if (shape.type === 'line' || shape.type === 'arrow') {
              const rawPoint = drag.handle === 'start'
                ? { x: drag.origX + dx, y: drag.origY + dy }
                : { x: drag.origX2 + dx, y: drag.origY2 + dy };
              const binding = shape.type === 'arrow' ? findArrowBinding(rawPoint, boardRef.current, drag.id, scale) : null;
            const otherPoint = drag.handle === 'start' ? { x: shape.x2, y: shape.y2 } : { x: shape.x, y: shape.y };
            const nextPoint = binding?.binding ? anchorPointForBinding(binding.binding, boardRef.current, otherPoint) || rawPoint : rawPoint;
            const bindingPatch = shape.type === 'arrow'
              ? drag.handle === 'start'
                ? { startBinding: binding?.binding || null }
                : { endBinding: binding?.binding || null }
              : {};

            if (!shape.points?.length) {
              if (drag.handle === 'start') return { ...shape, ...bindingPatch, x: nextPoint.x, y: nextPoint.y };
              return { ...shape, ...bindingPatch, x2: nextPoint.x, y2: nextPoint.y };
            }
            const points = replaceEndpoint(shape.points, drag.handle, nextPoint);
            const start = points[0];
            const end = points[points.length - 1];
            return { ...shape, ...bindingPatch, x: start.x, y: start.y, x2: end.x, y2: end.y, points };
          }
          if (shape.type === 'rect' || shape.type === 'ellipse') {
            return { ...shape, ...resizeBox(drag.original, drag.handle, dx, dy) };
          }
          return shape;
        });
        const nextBoard = applyAllArrowBindings({ ...boardRef.current, shapes: nextShapes });
        persist({ shapes: nextBoard.shapes });
      } else {
        const snap = snapDrag(shiftedBounds(drag.origBounds, dx, dy), boardSnapTargets(boardRef.current, { kind: 'shape', id: drag.id }), scale);
        const nextDx = dx + snap.offsetX;
        const nextDy = dy + snap.offsetY;
        const ddx = nextDx - (drag.lastDx || 0);
        const ddy = nextDy - (drag.lastDy || 0);
        setSnapGuides(snap.guides);
        const nextShapes = boardRef.current.shapes.map(shape => shape.id === drag.id ? {
            ...shape,
            x: drag.origX + nextDx,
            y: drag.origY + nextDy,
            ...(shape.type === 'line' || shape.type === 'arrow' ? {
              x2: drag.origX2 + nextDx,
              y2: drag.origY2 + nextDy,
              ...(shape.type === 'arrow' ? { startBinding: null, endBinding: null } : {}),
              ...(shape.points?.length ? { points: shape.points.map(point => ({ x: point.x + ddx, y: point.y + ddy })) } : {}),
            } : {}),
            ...(shape.type === 'freehand' ? { points: shape.points.map(p => ({ x: p.x + ddx, y: p.y + ddy })), x: 0, y: 0 } : {}),
          } : shape);
        const nextBoard = applyAllArrowBindings({ ...boardRef.current, shapes: nextShapes });
        persist({ shapes: nextBoard.shapes });
        dragging.current.lastDx = nextDx;
        dragging.current.lastDy = nextDy;
      }
    }
  };

  const onMouseUp = () => {
    if (panning.current) {
      panning.current = null;
      setSnapGuides([]);
      return;
    }
    if (dragging.current) {
      dragging.current = null;
      setSnapGuides([]);
      return;
    }

    if (marqueeStart.current && marquee && (marquee.w > 6 || marquee.h > 6)) {
      const hits = [];
      boardRef.current.shapes.forEach(shape => {
        const bounds = shapeBounds(shape);
        if (bounds.x < marquee.x + marquee.w && bounds.x + bounds.w > marquee.x && bounds.y < marquee.y + marquee.h && bounds.y + bounds.h > marquee.y) {
          hits.push({ id: shape.id, kind: 'shape' });
        }
      });
      boardRef.current.cards.forEach(card => {
        if (card.x < marquee.x + marquee.w && card.x + CARD_W > marquee.x && card.y < marquee.y + marquee.h && card.y + CARD_H > marquee.y) hits.push({ id: card.id, kind: 'card' });
      });
      if (hits.length > 0) setSelected(hits);
    }
    marqueeStart.current = null;
    setMarquee(null);

    if (drawing && startPt && endPt) {
      const id = Date.now().toString();
      const x = Math.min(startPt.x, endPt.x);
      const y = Math.min(startPt.y, endPt.y);
      const w = Math.abs(endPt.x - startPt.x);
      const h = Math.abs(endPt.y - startPt.y);
      if ((w >= 4 || h >= 4) || tool === 'freehand') {
        let shape = null;
        if (tool === 'rect') shape = { id, type: 'rect', x, y, w, h, style: { ...drawStyle } };
        if (tool === 'ellipse') shape = { id, type: 'ellipse', x, y, w, h, style: { ...drawStyle } };
        if (tool === 'line') shape = { id, type: 'line', x: startPt.x, y: startPt.y, x2: endPt.x, y2: endPt.y, style: { ...drawStyle } };
        if (tool === 'arrow') shape = {
          id,
          type: 'arrow',
          x: startPt.x,
          y: startPt.y,
          x2: endPt.x,
          y2: endPt.y,
          startBinding: drawingBinding.current.start,
          endBinding: drawingBinding.current.end,
          style: { ...drawStyle },
        };
        if (tool === 'freehand') shape = { id, type: 'freehand', x: 0, y: 0, points: freePoints, style: { ...drawStyle } };
        if (shape) persist({ shapes: [...boardRef.current.shapes, shape] });
      }
      setTool('select');
    }
    setDrawing(false);
    setStartPt(null);
    setEndPt(null);
    setFreePoints([]);
    drawingBinding.current = { start: null, end: null };
  };

  const cursor = panning.current ? 'grabbing' : spaceDown ? 'grab' : drawing ? 'crosshair' : tool !== 'select' || linkingFrom ? 'crosshair' : 'default';

  return (
    <div
      ref={canvasRef}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDoubleClick={onCanvasDoubleClick}
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--board-bg)',
        backgroundImage: 'radial-gradient(circle, var(--board-dot) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
        cursor,
      }}
    >
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: drawing ? 'none' : 'auto' }}>
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          {board.connections.map((conn, index) => (
            <ConnectionLine key={`${conn.from}-${conn.to}-${index}`} from={conn.from} to={conn.to} cards={board.cards} onDelete={(from, to) => persist({ connections: boardRef.current.connections.filter(conn => !(conn.from === from && conn.to === to)) })} />
          ))}
          {board.shapes.map(shape => (
            <ShapeEl
              key={shape.id}
              shape={shape}
              selected={selectedIds.has(shape.id) && editingText !== shape.id}
              onMouseDown={event => {
                if (tool !== 'select') return;
                hitRef.current = true;
                event.stopPropagation();
                const additive = event.shiftKey || event.metaKey || event.ctrlKey;
                setSelected(prev => additive
                  ? prev.find(item => item.id === shape.id) ? prev.filter(item => item.id !== shape.id) : [...prev, { id: shape.id, kind: 'shape' }]
                  : [{ id: shape.id, kind: 'shape' }]);
                dragging.current = {
                  type: 'shape',
                  id: shape.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  origX: shape.x,
                  origY: shape.y,
                  origX2: shape.x2,
                  origY2: shape.y2,
                  origBounds: shapeBounds(shape),
                  lastDx: 0,
                  lastDy: 0,
                };
              }}
              onResizeStart={(event, handle) => {
                hitRef.current = true;
                event.stopPropagation();
                setSelected([{ id: shape.id, kind: 'shape' }]);
                dragging.current = {
                  type: 'resize',
                  id: shape.id,
                  handle,
                  startX: event.clientX,
                  startY: event.clientY,
                  origX: shape.x,
                  origY: shape.y,
                  origX2: shape.x2,
                  origY2: shape.y2,
                  original: { ...shape },
                };
              }}
              onDoubleClick={event => { if (shape.type === 'text') { event.stopPropagation(); setEditingText(shape.id); } }}
            />
          ))}
          {drawing && <DrawPreview tool={tool} start={startPt} end={endPt} points={freePoints} style={drawStyle} />}
          {marquee && marquee.w > 2 && (
            <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="var(--accent)" fillOpacity="0.06" stroke="var(--accent)" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} style={{ pointerEvents: 'none' }} />
          )}
          {snapGuides.map((guide, index) => guide.axis === 'x' ? (
            <line key={`snap-x-${index}`} x1={guide.value} y1={guide.start} x2={guide.value} y2={guide.end} stroke="var(--accent)" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} opacity="0.85" style={{ pointerEvents: 'none' }} />
          ) : (
            <line key={`snap-y-${index}`} x1={guide.start} y1={guide.value} x2={guide.end} y2={guide.value} stroke="var(--accent)" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} opacity="0.85" style={{ pointerEvents: 'none' }} />
          ))}
        </g>
      </svg>

      <div style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
        {board.cards.map(card => (
          <BoardCard
            key={card.id}
            card={card}
            selected={selectedIds.has(card.id)}
            linking={linkingFrom === card.id}
            onMouseDown={event => {
              if (tool !== 'select' && !linkingFrom) return;
              hitRef.current = true;
              event.stopPropagation();
              if (linkingFrom) {
                if (linkingFrom !== card.id && !boardRef.current.connections.find(conn => (conn.from === linkingFrom && conn.to === card.id) || (conn.from === card.id && conn.to === linkingFrom))) {
                  persist({ connections: [...boardRef.current.connections, { from: linkingFrom, to: card.id }] });
                }
                setLinkingFrom(null);
                return;
              }
              if (tool === 'select') {
                const additive = event.shiftKey || event.metaKey || event.ctrlKey;
                setSelected(prev => additive
                  ? prev.find(item => item.id === card.id) ? prev.filter(item => item.id !== card.id) : [...prev, { id: card.id, kind: 'card' }]
                  : [{ id: card.id, kind: 'card' }]);
                dragging.current = { type: 'card', id: card.id, startX: event.clientX, startY: event.clientY, origX: card.x, origY: card.y, origBounds: { x: card.x, y: card.y, w: CARD_W, h: CARD_H } };
              }
            }}
            onConnect={id => { setLinkingFrom(id); setTool('select'); }}
            onDelete={id => {
              persist({
                cards: boardRef.current.cards.filter(card => card.id !== id),
                connections: boardRef.current.connections.filter(conn => conn.from !== id && conn.to !== id),
              });
              setSelected(prev => prev.filter(item => item.id !== id));
            }}
            onEdit={(id, note) => persist({ cards: boardRef.current.cards.map(card => card.id === id ? { ...card, note } : card) })}
            onOpenSource={onOpenSource}
          />
        ))}
      </div>

      {editingText && (() => {
        const shape = board.shapes.find(shape => shape.id === editingText);
        if (!shape) return null;
        return <TextEditor shape={shape} pan={pan} scale={scale} onDone={value => {
          const text = String(value || '').trim();
          persist({
            shapes: text
              ? boardRef.current.shapes.map(shape => shape.id === editingText ? { ...shape, text } : shape)
              : boardRef.current.shapes.filter(shape => shape.id !== editingText),
          });
          if (!text) setSelected(prev => prev.filter(item => item.id !== editingText));
          setEditingText(null);
        }} />;
      })()}

      {isEmpty && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none' }}>
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" opacity="0.22"><rect x="4" y="10" width="16" height="24" rx="2" stroke="var(--fg)" strokeWidth="1.5" /><path d="M8 18h8M8 22h8M8 26h5" stroke="var(--fg)" strokeWidth="1.5" strokeLinecap="round" /><path d="M24 18h16M24 24h16M24 30h10" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <div style={{ fontFamily: 'var(--ui-font)', fontSize: 12, color: 'var(--fg-faint)', textAlign: 'center', lineHeight: 1.6 }}>Use the tools to draw, write, and connect notes.</div>
        </div>
      )}

      {selected.length > 0 && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--app-bg)', border: '0.5px solid var(--hairline-strong)', borderRadius: 6, padding: '4px 12px', fontFamily: 'var(--ui-font)', fontSize: 11, color: 'var(--fg-muted)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20 }}>
          {selected.length === 1 ? '1 item selected' : `${selected.length} items selected`} · Delete removes · Shift-click selects more
        </div>
      )}

      <ToolPalette tool={tool} setTool={(next) => { setTool(next); setSelected([]); }} style={drawStyle} setStyle={setDrawStyle} />
      <BottomBar scale={scale} addCard={() => addCard()} resetZoom={() => setScale(1)} resetPan={() => setPan({ x: 60, y: 40 })} linkingFrom={linkingFrom} cancelLink={() => setLinkingFrom(null)} />
    </div>
  );
}
