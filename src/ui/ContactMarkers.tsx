import { useMemo } from 'react';
import type { Block } from '../model/types';
import { sketchContacts } from '../solver/contacts';
import { toScreen } from '../tools/viewport';
import type { Viewport } from '../tools/viewport';

export function ContactMarkers({
  block,
  view,
}: {
  block: Block;
  view: Viewport;
}) {
  const corners = useMemo(() => {
    const attached = new Set<string>();
    for (const contact of sketchContacts(block)) {
      attached.add(contact.a.vertex);
      if ('vertex' in contact.b) attached.add(contact.b.vertex);
    }
    return block.vertices.filter((vertex) => attached.has(vertex.id));
  }, [block]);
  return (
    <g
      className="sketch-contacts"
      aria-label="Sketch contacts"
      pointerEvents="none"
    >
      {corners.map((corner) => {
        const point = toScreen(corner, view);
        return (
          <circle
            key={corner.id}
            data-contact-vertex={corner.id}
            cx={point.x}
            cy={point.y}
            r="2.5"
          >
            <title>Sketch contact</title>
          </circle>
        );
      })}
    </g>
  );
}
