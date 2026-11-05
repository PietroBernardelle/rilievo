import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createProject, createRoom } from '../model/project';
import { fit } from '../solver';
import { rectangleMeasurements } from '../solver/__tests__/fixtures';
import { ContactMarkers } from './ContactMarkers';

describe('sketch contact markers', () => {
  it('draws subtle markers at fitted attached corners and releases them once both rooms are measured', () => {
    let project = createProject('2026-11-05T10:00:00Z');
    for (const [x, width] of [
      [0, 5],
      [5, 2],
    ])
      project = createRoom(
        project,
        project.blocks[0]?.id ?? null,
        [
          { x: x!, y: 0 },
          { x: x! + width!, y: 0 },
          { x: x! + width!, y: 3 },
          { x: x!, y: 3 },
        ],
        2.7,
      ).project;
    const block = project.blocks[0]!;
    block.measurements = rectangleMeasurements(
      block.rooms[0]!.vertexIds,
      4.95,
      3,
      'a-',
    );
    const fitted = fit(block).block;
    const markup = renderToStaticMarkup(
      <svg>
        <ContactMarkers block={fitted} view={{ x: 0, y: 300, scale: 50 }} />
      </svg>,
    );
    expect(markup).toContain('class="sketch-contacts"');
    expect(markup.match(/data-contact-vertex=/g)).toHaveLength(4);
    expect(markup).toContain(
      `data-contact-vertex="v5" cx="${fitted.vertices[4]!.x * 50}"`,
    );
    expect(markup).toContain('r="2.5"');
    fitted.measurements.push(
      ...rectangleMeasurements(fitted.rooms[1]!.vertexIds, 2, 3, 'b-'),
    );
    const measured = renderToStaticMarkup(
      <svg>
        <ContactMarkers block={fitted} view={{ x: 0, y: 300, scale: 50 }} />
      </svg>,
    );
    expect(measured).not.toContain('data-contact-vertex');
  });
});
