export default function presetSummary(preset, translate) {
  const params = preset.request.params;
  const format = preset.request.pipeline.match(/\b(PDF|PNG|JPG|TIF|TXT)\b/i);
  let source = params.source;
  if (source) {
    const key = `source.${source.toLowerCase()}`;
    const translated = translate(key);
    if (translated !== key) {
      source = translated;
    }
  }
  return [params.resolution && `${params.resolution} dpi`, source,
    params.width && params.height && `${Math.round(params.width)} × ${Math.round(params.height)} mm`,
    format ? format[1] : preset.request.pipeline].filter(Boolean).join(' · ');
}
