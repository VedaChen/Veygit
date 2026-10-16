export function formatRelativeTime(unixSeconds: number): string {
  if (!unixSeconds) {
    return '';
  }
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (diff < 60) {
    return 'just now';
  }
  if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`;
  }
  if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h ago`;
  }
  if (diff < 86400 * 30) {
    return `${Math.floor(diff / 86400)}d ago`;
  }
  const date = new Date(unixSeconds * 1000);
  return date.toISOString().slice(0, 10);
}

export function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf('/');
  if (idx < 0) {
    return { dir: '', name: path };
  }
  return { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
}

export function statusColorClass(status: string): string {
  switch (status) {
    case 'M':
      return 'status-modified';
    case 'A':
      return 'status-added';
    case 'D':
      return 'status-deleted';
    case 'R':
    case 'C':
      return 'status-renamed';
    case 'U':
      return 'status-conflict';
    case '?':
      return 'status-untracked';
    default:
      return 'status-modified';
  }
}
