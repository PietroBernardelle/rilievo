import type { Tool } from './editor';
const TOOLS = [
  { label: 'Select', shortcut: 'V', path: 'M6 3v16l4-5 5 7 3-2-5-7h6Z' },
  { label: 'Rectangle', shortcut: 'R', path: 'M4 5h16v14H4Z' },
  { label: 'Polygon', shortcut: 'P', path: 'm12 3 9 7-4 11H6L3 10Z' },
  {
    label: 'Circle',
    shortcut: 'C',
    path: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  },
  { label: 'Line', shortcut: 'L', path: 'M4 20 20 4M3 18v3h3M18 3h3v3' },
  { label: 'Door', shortcut: 'D', path: 'M3 20h5V4h13M8 20a16 16 0 0 0 13-16' },
  {
    label: 'Window',
    shortcut: 'W',
    path: 'M3 7h18v10H3ZM8 7v10M16 7v10M3 12h18',
  },
  {
    label: 'Measure',
    shortcut: 'M',
    path: 'M3 5v14M21 5v14M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  },
  {
    label: 'Pan',
    shortcut: 'Space',
    path: 'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',
  },
];

export function ToolPalette({
  tool,
  onTool,
}: {
  tool: Tool;
  onTool: (tool: Tool) => void;
}) {
  return (
    <aside className="tool-palette" aria-label="Drawing tools">
      {TOOLS.map(({ label, shortcut, path }) => (
        <button
          key={label}
          className="tool-button bevel"
          type="button"
          disabled={!['V', 'R', 'P', 'Space'].includes(shortcut)}
          aria-pressed={tool === shortcut}
          onClick={() => onTool(shortcut as Tool)}
          aria-label={`${label} (${shortcut})`}
          title={`${label} (${shortcut})${['V', 'R', 'P', 'Space'].includes(shortcut) ? '' : ' — coming in a later milestone'}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={path} />
          </svg>
          <span className="tool-shortcut">{shortcut}</span>
        </button>
      ))}
    </aside>
  );
}
