import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createProject, createRoom } from '../model/project';
import { placeOpening } from '../tools/openings';
import { PlanOpenings, PlanWalls } from './PlanWalls';
import { SurveyOverlay } from './SurveyOverlay';
import { ensureSurveyQueue } from '../survey/queue';

describe('M4 plan symbols', () => {
  it('draws one shared door swing, three window lines, an arch gap and resize handles', () => {
    let project = createProject('2026-11-05');
    for (const [x, width] of [
      [0, 5],
      [5, 3],
    ] as const)
      project = createRoom(
        project,
        project.blocks[0]?.id ?? null,
        [
          { x, y: 0 },
          { x: x + width, y: 0 },
          { x: x + width, y: 3 },
          { x, y: 3 },
        ],
        2.7,
      ).project;
    project = placeOpening(project, 'b1', ['r1', 1], 'door', 1.2).project;
    project = placeOpening(project, 'b1', ['r1', 0], 'window', 2).project;
    project = placeOpening(project, 'b1', ['r1', 2], 'arch', 2).project;
    const block = project.blocks[0]!;
    const markup = renderToStaticMarkup(
      <svg>
        <PlanWalls
          block={block}
          view={{ x: 0, y: 300, scale: 50 }}
          selection={{ roomId: 'r1', openingId: 'o1' }}
        />
        <PlanOpenings
          block={block}
          view={{ x: 0, y: 300, scale: 50 }}
          selectedId="o1"
        />
      </svg>,
    );
    expect(markup.match(/class="door-swing"/g)).toHaveLength(1);
    expect(markup.match(/class="window-line"/g)).toHaveLength(3);
    expect(markup.match(/data-opening-id=/g)).toHaveLength(4);
    expect(markup.match(/class="opening-handle"/g)).toHaveLength(2);
    expect(markup).toContain('class="plan-opening arch"');
    expect(markup).toContain('class="wall-room selected"');
  });
  it('shows a vertical arrow and height text for a room-height reading', () => {
    let project = createRoom(
      createProject('2026-11-05'),
      null,
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      2.7,
    ).project;
    project = ensureSurveyQueue(project, 'b1');
    const block = project.blocks[0]!;
    const current = block.measurements.find(
      (item) => item.target?.type === 'room-height',
    )!;
    const markup = renderToStaticMarkup(
      <svg>
        <SurveyOverlay
          block={block}
          current={current}
          picked={undefined}
          view={{ x: 0, y: 300, scale: 50 }}
          residuals={[]}
          roomId="r1"
        />
      </svg>,
    );
    expect(markup).toContain('class="vertical-measurement-label"');
    expect(markup).toContain('>Height</text>');
    expect(markup).toContain('marker-start="url(#survey-arrowhead)"');
  });
});
