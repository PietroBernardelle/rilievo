// Version 1 had implicit doorway pairing and no swing or scalar-reading targets.
export function migrateProject(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1
  )
    return value;
  const project = structuredClone(value) as Record<string, unknown>;
  if (!Array.isArray(project.blocks)) return project;
  for (const raw of project.blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as Record<string, unknown>;
    if (!Array.isArray(block.openings) || !Array.isArray(block.joins)) continue;
    const openings = block.openings.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object',
    );
    for (const opening of openings) {
      if (opening.type === 'door') {
        opening.hinge = 0;
        opening.swing = 'in';
      }
    }
    for (const join of block.joins) {
      if (!join || typeof join !== 'object') continue;
      const item = join as Record<string, unknown>;
      const source = openings.find((opening) => opening.id === item.via);
      if (!source || !Array.isArray(item.a) || !Array.isArray(item.b)) continue;
      const opposite =
        source.roomId === item.a[0] && source.edge === item.a[1]
          ? item.b
          : item.a;
      const matches = openings.filter(
        (opening) =>
          opening.id !== item.via &&
          opening.roomId === opposite[0] &&
          opening.edge === opposite[1] &&
          opening.type === source.type &&
          typeof opening.width === 'number' &&
          typeof source.width === 'number' &&
          Math.abs(opening.width - source.width) < 0.0001,
      );
      if (matches.length !== 1)
        throw new Error(
          `Cannot migrate join ${String(item.id)}: expected one matching doorway, found ${matches.length}.`,
        );
      item.pairedWith = matches[0]!.id;
      if (source.type === 'door') {
        matches[0]!.hinge = 1;
        matches[0]!.swing = 'out';
      }
      // Existing joins already affected the fit in version 1; preserve that behaviour.
      item.measured = true;
    }
  }
  project.schemaVersion = 2;
  return project;
}
