export function squaredNorm(values: number[]): number {
  return values.reduce((sum, value) => sum + value * value, 0);
}

export function solveLinear(
  matrix: number[][],
  rhs: number[],
): number[] | null {
  const n = rhs.length;
  if (matrix.length !== n || matrix.some((row) => row.length !== n))
    throw new Error('Linear system must be square.');
  const a = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++)
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!))
        pivot = row;
    if (Math.abs(a[pivot]![column]!) < 1e-15) return null;
    [a[column], a[pivot]] = [a[pivot]!, a[column]!];
    for (let row = column + 1; row < n; row++) {
      const factor = a[row]![column]! / a[column]![column]!;
      for (let j = column; j <= n; j++)
        a[row]![j] = a[row]![j]! - factor * a[column]![j]!;
    }
  }
  const result = Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let value = a[row]![n]!;
    for (let j = row + 1; j < n; j++) value -= a[row]![j]! * result[j]!;
    result[row] = value / a[row]![row]!;
  }
  return result.every(Number.isFinite) ? result : null;
}
export function matrixRank(
  matrix: number[][],
  relativeTolerance = 1e-7,
): number {
  if (!matrix.length || !matrix[0]!.length) return 0;
  const a = matrix.map((row) => [...row]);
  const width = a[0]!.length;
  const tolerance = relativeTolerance * Math.max(1, ...a.flat().map(Math.abs));
  let rank = 0;
  for (let column = 0; column < width && rank < a.length; column++) {
    let pivot = rank;
    for (let row = rank + 1; row < a.length; row++)
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!))
        pivot = row;
    if (Math.abs(a[pivot]![column]!) <= tolerance) continue;
    [a[rank], a[pivot]] = [a[pivot]!, a[rank]!];
    for (let row = rank + 1; row < a.length; row++) {
      const factor = a[row]![column]! / a[rank]![column]!;
      for (let j = column; j < width; j++)
        a[row]![j] = a[row]![j]! - factor * a[rank]![j]!;
    }
    rank++;
  }
  return rank;
}
