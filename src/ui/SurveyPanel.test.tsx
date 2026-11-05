import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/project';
import { fit } from '../solver';
import { consistencyDiagnostics } from '../solver/diagnostics';
import { measurement, squareBlock } from '../solver/__tests__/fixtures';
import { measurementLabel } from '../survey/points';
import { SurveyPanel } from './SurveyPanel';
import { ProjectPanel } from './ProjectPanel';
import { SurveyOverlay } from './SurveyOverlay';

describe('survey feedback', () => {
  it('shows a red room status and ordered re-measure suggestions even without individual residual flags', () => {
    const block = squareBlock();
    block.measurements.push(
      measurement('BD', { vertex: 'v2' }, { vertex: 'v4' }, 5),
    );
    block.measurements.find((item) => item.id === 'CD')!.value = 4.04;
    const result = fit(block);
    expect(result.residuals.every((item) => !item.flagged)).toBe(true);
    const diagnostics = consistencyDiagnostics(result.block, 0.015);
    const markup = renderToStaticMarkup(
      <ProjectPanel
        selectedOpening={undefined}
        onOpeningSelect={() => {}}
        onOpeningUpdate={() => true}
        onOpeningLink={() => {}}
        onOpeningUnlink={() => {}}
        onOpeningDelete={() => {}}
        onWallUpdate={() => true}
        project={{ ...createProject('2026-11-05'), blocks: [result.block] }}
        activeBlock={result.block}
        selectedRoom={result.block.rooms[0]}
        diagnostics={diagnostics.rooms}
        settings={null}
        onBlock={() => {}}
        onSelect={() => {}}
        onUpdate={() => true}
        queue={
          <SurveyPanel
            block={result.block}
            diagnostics={diagnostics}
            currentId={null}
            active
            onPick={() => {}}
            onMove={() => {}}
          />
        }
      />,
    );
    expect(markup).toContain('room-status inconsistent');
    expect(markup).toContain('Re-measure suggestions');
    expect(markup).toContain('From fitted plan');
    const labels = result.rooms[0]!.suspectMeasurements.map(
      (item) =>
        `Re-measure ${measurementLabel(
          block,
          block.measurements.find((measurement) => measurement.id === item.id)!,
        )}`,
    );
    const positions = labels.map((label) => markup.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
  it('shows unchecked distances, a second-diagonal prompt and the current SVG arrow', () => {
    const result = fit(squareBlock());
    const current = {
      ...measurement('BD', { vertex: 'v2' }, { vertex: 'v4' }, 5),
      value: null,
      status: 'queued' as const,
    };
    const block = {
      ...result.block,
      measurements: [...result.block.measurements, current],
    };
    const diagnostics = consistencyDiagnostics(block, 0.015);
    const markup = renderToStaticMarkup(
      <ProjectPanel
        selectedOpening={undefined}
        onOpeningSelect={() => {}}
        onOpeningUpdate={() => true}
        onOpeningLink={() => {}}
        onOpeningUnlink={() => {}}
        onOpeningDelete={() => {}}
        onWallUpdate={() => true}
        project={{ ...createProject('2026-11-05'), blocks: [block] }}
        activeBlock={block}
        selectedRoom={block.rooms[0]}
        diagnostics={diagnostics.rooms}
        settings={null}
        queue={
          <SurveyPanel
            block={block}
            diagnostics={diagnostics}
            currentId="BD"
            active
            onPick={() => {}}
            onMove={() => {}}
          />
        }
        onBlock={() => {}}
        onSelect={() => {}}
        onUpdate={() => true}
      />,
    );
    expect(markup).toContain('rigid but unchecked');
    expect(markup).toContain('measure the second diagonal');
    expect(markup).toContain('aria-current="true"');
    const overlay = renderToStaticMarkup(
      <svg>
        <SurveyOverlay
          block={block}
          current={current}
          picked={undefined}
          view={{ x: 0, y: 300, scale: 50 }}
          residuals={diagnostics.residuals}
          roomId="r1"
        />
      </svg>,
    );
    expect(overlay).toContain('data-current-measurement="BD"');
    expect(overlay).toContain('class="survey-arrow"');
  });
});
