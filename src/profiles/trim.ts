/**
 * The value without the slashes at its end. It is trimmed with a loop, as
 * `/\/+$/` tries every slash of a run as a start, so its cost on a long run
 * of slashes followed by anything else grows with the square of the run.
 */
export function withoutTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) end--
  return value.slice(0, end)
}
