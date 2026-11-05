# Data model (project file, JSON)

All lengths are in **metres** (stored as numbers, displayed with 3 decimals). Angles are in radians. IDs are short strings (`v12`, `r3`). The file carries a `schemaVersion` so it can be migrated later.

```jsonc
{
  "schemaVersion": 1,
  "name": "Casa Valmorea",
  "units": "m",
  "createdAt": "2026-11-05T10:00:00Z",
  "settings": { "tolerance": 0.015, "laserSigma": 0.002, "placementSigma": 0.005 },

  "blocks": [
    {
      "id": "b1",
      "name": "Piano terra (nonna)",
      "kind": "floor",                 // floor | site | other
      "elevation": 0.0,                // floor level, metres
      "placement": { "x": 0, "y": 0, "rotation": 0 },  // block position in project coords (set by links)
      "vertices": [ { "id": "v1", "x": 0, "y": 0, "sketch": { "x": 0, "y": 0 } } ],
      "rooms": [
        { "id": "r1", "name": "Cucina", "vertexIds": ["v1","v2","v3","v4"], "height": 2.95 }
      ],
      "walls": [
        // optional extra info per room edge, keyed by room + edge index
        { "roomId": "r1", "edge": 0, "thickness": 0.30, "exterior": true }
      ],
      "openings": [
        { "id": "o1", "roomId": "r1", "edge": 1, "type": "door",   // door | window | arch
          "offset": 0.85, "width": 0.80, "height": 2.10, "sill": 0 }
      ],
      "features": [
        { "id": "f1", "type": "circle", "cx": 5, "cy": 3, "r": 0.4, "label": "albero" }
      ],
      "measurements": [
        { "id": "m1",
          "kind": "distance",          // distance | height | thickness | offset
          "a": { "vertex": "v1" },     // point refs: vertex | opening jamb | point on edge
          "b": { "vertex": "v2" },
          "value": 3.425,              // null while only requested
          "sigma": 0.005,
          "status": "done",            // queued | done | skipped | rejected
          "note": "" }
      ],
      "constraints": [
        // soft unless "hard": true. Generated from the sketch, editable
        { "kind": "perpendicular", "edges": [["r1",0],["r1",1]], "weight": 0.1 },
        { "kind": "collinear", "edges": [["r1",2],["r2",0]], "weight": 1 }
      ],
      "joins": [
        { "id": "j1", "a": ["r1", 1], "b": ["r2", 3], "thickness": 0.30,
          "via": "o1" }                // the shared doorway that aligns the two rooms
      ]
    }
  ],

  "links": [
    // later: tie blocks together through points surveyed in both
    { "id": "l1", "a": { "block": "b1", "vertex": "v9" }, "b": { "block": "b2", "vertex": "v1" } }
  ]
}
```

## Point references
A measurement end (`a` or `b`) can be:
- `{ "vertex": "v3" }`: a room corner.
- `{ "jamb": "o1", "side": 0 }`: a door or window jamb (0 = start, 1 = end, along the edge direction).
- `{ "edgePoint": ["r1", 2], "t": 0.5 }`: a point on an edge (t from 0 to 1). Used when a corner is blocked.

## Rules
- `sketch` keeps the original drawn position. The fit writes `x`/`y`, so the sketch can always be restored.
- Rooms never share vertices. Rooms are tied together through `joins`. This keeps each room's fit independent and the joins explicit.
- Never delete measurements. Mark wrong ones `rejected`, so the history is kept.
- M3 re-measurement creates a new `done` record and marks the old reading
  `rejected`. Skipped requests stay `skipped` until revisited. Queue order follows
  the measurement array, excluding rejected records and deferred height records.
- `settings.placementSigma` is positive and editable. New and re-measured readings
  capture `sqrt(laserSigma² + placementSigma²)` in their own `sigma`; changing the
  setting does not rewrite historical measurement uncertainties.
- The active survey cursor and undo stack are transient editor state. Queued
  requests, skipped requests, values and settings persist in schema 1 unchanged.

## Polygon convention and coordinate precision

- Coordinates use **x right, y up**. Every room is stored counter-clockwise
  (positive signed area), on creation, manual editing, and JSON load/save.
- Edge `i` goes from `vertexIds[i]` to `vertexIds[(i + 1) % n]`.
  Its outward unit normal is on the **right**: `(dy, -dx) / length`.
- Normalisation keeps the first vertex fixed and reverses the remaining order
  when necessary. Edge indices, opening offsets, jamb sides and edge-point `t`
  values are remapped together, preserving their physical locations. Rejected
  measurements retain historical references to deleted geometry.
- Snapped points, stored corner `x`/`y`, their `sketch` coordinates, and block
  placement `x`/`y` are rounded to **0.0001 m**. Display remains at 3 decimals.
  Geometry that collapses at this precision is rejected.
- These are normalisation rules for the existing schema; `schemaVersion` stays 1.
