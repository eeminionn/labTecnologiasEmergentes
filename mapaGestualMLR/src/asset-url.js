export function assetUrl(url) {
  const base = import.meta.env.BASE_URL;
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith(base)) return url;
  return base + url.slice(1);
}
