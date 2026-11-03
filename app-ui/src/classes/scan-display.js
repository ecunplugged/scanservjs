export function dateTime(value) {
  return value ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

export function megabytes(value) {
  return (Number(value || 0) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Phase milestones, not an estimate of page-by-page or upload-byte completion.
export function tileProgress(stage, paperlessEnabled) {
  if (stage === 'completed' || stage === 'cleanup') {
    return 100;
  }
  if (stage === 'paperless_processing' || stage === 'pending') {
    return 75;
  }
  if (stage === 'uploading') {
    return 50;
  }
  if (stage === 'processing') {
    return paperlessEnabled ? 25 : 50;
  }
  return 0;
}
