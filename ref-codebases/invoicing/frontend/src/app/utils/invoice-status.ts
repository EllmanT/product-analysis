const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Fiscalized',
  QUEUED: 'Queued',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

/** Human-readable invoice status (API still uses SUBMITTED). */
export function formatInvoiceStatus(status: string | undefined | null): string {
  if (status == null || status === '') return '—';
  return STATUS_LABELS[status] ?? status;
}
