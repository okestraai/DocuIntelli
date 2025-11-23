export function formatUTCDate(dateString: string | undefined): string {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);

  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatUTCDateTime(dateString: string | undefined): string {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);

  return date.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }) + ' UTC';
}

export function getCurrentUTCTimestamp(): string {
  return new Date().toISOString();
}

export function parseUTCDate(dateString: string): Date {
  return new Date(dateString);
}
