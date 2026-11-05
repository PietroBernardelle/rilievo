import { CommandLine } from './CommandLine';
import { MenuBar } from './MenuBar';
import { ProjectPanel } from './ProjectPanel';
import { StatusBar } from './StatusBar';
import { ToolPalette } from './ToolPalette';

export function App() {
  return (
    <div className="app-shell">
      <MenuBar />
      <div className="workspace">
        <ToolPalette />
        <main className="drawing-area" aria-label="Drawing workspace">
          <svg
            className="drawing-canvas"
            role="img"
            aria-labelledby="drawing-title drawing-description"
          >
            <title id="drawing-title">Drawing area</title>
            <desc id="drawing-description">
              Empty plan. No rooms have been drawn.
            </desc>
          </svg>
        </main>
        <ProjectPanel />
      </div>
      <CommandLine />
      <StatusBar />
    </div>
  );
}
