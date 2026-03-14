export function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 2) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}
