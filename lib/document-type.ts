const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * A short badge label from the real `mime_type` column — never a guess
 * from the filename, and never a type that isn't actually one of these.
 * Anything unrecognized falls back to a generic "FILE" label rather than
 * fabricating a specific type it isn't.
 */
export function documentTypeLabel(mimeType: string | null): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case DOCX_MIME:
      return "DOCX";
    case "text/csv":
      return "CSV";
    case "text/markdown":
      return "MD";
    case "text/plain":
    case null:
      return "TXT";
    default:
      return "FILE";
  }
}
