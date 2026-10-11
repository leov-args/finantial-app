export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

function canShareFiles(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && 'canShare' in navigator && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function downloadFile(file: File): 'downloaded' {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking right after click() cancels the download in some browsers (Safari).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

/** Shares a file with the Web Share API or downloads it as a fallback. */
export async function shareFile(file: File): Promise<ShareResult> {
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      throw error;
    }
  }
  return downloadFile(file);
}
