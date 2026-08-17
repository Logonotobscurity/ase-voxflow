/**
 * Pure formatting helpers for the /app surfaces. Kept dependency-free so
 * they are unit-testable without a DOM (Route Completion Contract: the
 * data contract and states are the same across routes).
 */

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function formatCostMinor(amountMinor: number | undefined, currency = 'NGN'): string {
  if (amountMinor === undefined || !Number.isFinite(amountMinor)) return '—';
  return `${currency} ${(amountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function statusTone(status: string): 'green' | 'orange' | 'red' | 'cyan' | 'gray' {
  switch (status) {
    case 'COMPLETED':
    case 'READY':
    case 'APPROVED':
      return 'green';
    case 'WAITING_APPROVAL':
    case 'PENDING':
    case 'DRAFT':
    case 'PAUSED':
    case 'RUNNING':
      return 'orange';
    case 'FAILED':
    case 'REJECTED':
    case 'CANCELLED':
      return 'red';
    default:
      return 'gray';
  }
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
