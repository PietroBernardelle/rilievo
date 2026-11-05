const SERIES_TOLERANCE = 1e-14;
const MAX_ITERATIONS = 1000;
const MIN_DENOMINATOR = 1e-300;
const RANK_TOLERANCE = 1e-7;

// Q(df/2, chiSquare/2). Integer df only needs integer/half-integer log Gamma.
// Series and continued-fraction forms: https://dlmf.nist.gov/8.7 and /8.9.
export function chiSquareSurvival(
  chiSquare: number,
  degreesOfFreedom: number,
): number {
  if (
    Number.isNaN(chiSquare) ||
    chiSquare < 0 ||
    !Number.isInteger(degreesOfFreedom) ||
    degreesOfFreedom <= 0
  )
    throw new Error(
      'Chi-square needs a non-negative statistic and positive integer degrees of freedom.',
    );
  if (chiSquare === 0) return 1;
  if (chiSquare === Infinity) return 0;
  const a = degreesOfFreedom / 2;
  const x = chiSquare / 2;
  let logGamma = degreesOfFreedom % 2 ? Math.log(Math.PI) / 2 : 0;
  for (let value = degreesOfFreedom % 2 ? 0.5 : 1; value < a; value++)
    logGamma += Math.log(value);
  const factor = Math.exp(a * Math.log(x) - x - logGamma);
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      term *= x / (a + i);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * SERIES_TOLERANCE)
        return Math.max(0, Math.min(1, 1 - factor * sum));
    }
  } else {
    let b = x + 1 - a;
    let c = 1 / MIN_DENOMINATOR;
    let d = 1 / b;
    let fraction = d;
    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      const numerator = -i * (i - a);
      b += 2;
      d = numerator * d + b;
      if (Math.abs(d) < MIN_DENOMINATOR) d = MIN_DENOMINATOR;
      c = b + numerator / c;
      if (Math.abs(c) < MIN_DENOMINATOR) c = MIN_DENOMINATOR;
      d = 1 / d;
      const change = d * c;
      fraction *= change;
      if (Math.abs(change - 1) < SERIES_TOLERANCE)
        return Math.max(0, Math.min(1, factor * fraction));
    }
  }
  throw new Error('Chi-square probability did not converge.');
}

export interface MeasurementProjection {
  rank: number;
  redundancy: number[];
}
export function measurementProjection(
  jacobian: number[][],
): MeasurementProjection {
  const count = jacobian.length;
  if (!count) return { rank: 0, redundancy: [] };
  const width = jacobian[0]!.length;
  if (
    jacobian.some((row) => row.length !== width || !row.every(Number.isFinite))
  )
    throw new Error('Measurement Jacobian must be rectangular and finite.');
  const columns = Array.from({ length: width }, (_, j) =>
    jacobian.map((row) => row[j]!),
  );
  const norm = (column: number[]): number => Math.hypot(...column);
  const threshold = RANK_TOLERANCE * Math.max(0, ...columns.map(norm));
  const basis: number[][] = [];
  // Pivoted, twice-reorthogonalised QR avoids inverting a singular J^T J.
  while (columns.length && basis.length < count) {
    let pivot = 0;
    for (let i = 1; i < columns.length; i++)
      if (norm(columns[i]!) > norm(columns[pivot]!)) pivot = i;
    const column = columns.splice(pivot, 1)[0]!;
    for (let pass = 0; pass < 2; pass++)
      for (const q of basis) {
        const dot = column.reduce((sum, value, i) => sum + value * q[i]!, 0);
        for (let i = 0; i < count; i++) column[i] = column[i]! - dot * q[i]!;
      }
    const length = norm(column);
    if (length <= threshold) break;
    const q = column.map((value) => value / length);
    basis.push(q);
    for (const other of columns)
      for (let pass = 0; pass < 2; pass++) {
        const dot = other.reduce((sum, value, i) => sum + value * q[i]!, 0);
        for (let i = 0; i < count; i++) other[i] = other[i]! - dot * q[i]!;
      }
  }
  // diag(I - QQ^T), equivalent to I - J (J^T J)^+ J^T.
  return {
    rank: basis.length,
    redundancy: Array.from({ length: count }, (_, i) =>
      Math.max(
        0,
        Math.min(1, 1 - basis.reduce((sum, q) => sum + q[i]! ** 2, 0)),
      ),
    ),
  };
}
