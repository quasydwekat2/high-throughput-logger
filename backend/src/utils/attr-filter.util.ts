/**
 * attr.<key> filters for GET /logs and /logs/aggregate.
 *
 * Spec: compared as strings. Stored JSON may be string, number, or boolean
 * (e.g. retries: 3 vs attr.retries=3). Uses @> (containment). There is no
 * GIN on attributes: unknown keys would need one, but ingest COPY on 1 CPU
 * cannot afford to maintain it. Partition pruning keeps attr scans bounded.
 */
export function pushAttrContainment(
  conditions: string[],
  values: unknown[],
  startN: number,
  attrs: Record<string, string>,
): number {
  let n = startN;

  for (const [key, val] of Object.entries(attrs)) {
    const variants: unknown[] = [val];
    if (val === "true") variants.push(true);
    else if (val === "false") variants.push(false);
    if (/^-?\d+(\.\d+)?$/.test(val)) variants.push(Number(val));

    const ors = variants.map((v) => {
      const p = n++;
      values.push(JSON.stringify({ [key]: v }));
      return `attributes @> $${p}::jsonb`;
    });
    conditions.push(`(${ors.join(" OR ")})`);
  }

  return n;
}
