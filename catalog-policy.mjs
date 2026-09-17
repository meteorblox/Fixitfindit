// Launch excludes clearly labeled spare parts. This is not a full product review.
export function isReplacementPart(value) {
  const name=String(value||'').toLowerCase().replace(/[-_]/g,' ');
  // A complete tool bundled with spare heads is still a complete product.
  const standalone=name.replace(/\bwith\s+(?:\d+\s+)?(?:replacement|spare)\s+(?:heads?|brushes|pads?|filters?)\b/g,'');
  return /\b(?:replacement|spare)\s+(?:(?:brush|mop|filter)\s+)?(?:heads?|parts?|pads?|filters?|cartridges?|blades?|brushes|covers?)\b|\brefills?\b|\b(?:head|pad|filter|blade)\s+only\b/i.test(standalone);
}
