// Branding: the tool mark, the client logo (uploaded or picked up from the workbook cover sheet)
// and the brand colour. Everything is data URLs inside the session – no network, no files.

/** Tool mark: a "fit" block next to a dashed "gap" block, bridged. */
function Mark({ size = 28, radius = 7 }) {
  return html`<svg width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true" class="mark-svg">
    <defs><linearGradient id="fgMarkGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f4e79" /><stop offset="1" stop-color="#2f7a7a" /></linearGradient></defs>
    <rect width="32" height="32" rx=${radius} fill="url(#fgMarkGrad)" />
    <rect x="6.5" y="8.5" width="8.5" height="15" rx="1.8" fill="#fff" />
    <rect x="17.5" y="8.5" width="8.5" height="15" rx="1.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-dasharray="3.2 2.2" />
    <path d="M15 16h2.5" stroke="#9dbbd6" stroke-width="2" stroke-linecap="round" />
    <circle cx="21.75" cy="16" r="1.6" fill="#9dbbd6" />
  </svg>`;
}
const MARK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%231f4e79'/><stop offset='1' stop-color='%232f7a7a'/></linearGradient></defs><rect width='32' height='32' rx='7' fill='url(%23g)'/><rect x='6.5' y='8.5' width='8.5' height='15' rx='1.8' fill='%23fff'/><rect x='17.5' y='8.5' width='8.5' height='15' rx='1.8' fill='none' stroke='%23fff' stroke-width='1.8' stroke-dasharray='3.2 2.2'/><path d='M15 16h2.5' stroke='%239dbbd6' stroke-width='2' stroke-linecap='round'/><circle cx='21.75' cy='16' r='1.6' fill='%239dbbd6'/></svg>`;
const MARK_DATA_URL = 'data:image/svg+xml,' + MARK_SVG;

/** Wordmark next to the mark. */
function Lockup({ size = 28, sub, light }) {
  return html`<div class=${`lockup${light ? ' light' : ''}`}><${Mark} size=${size} /><div class="lockup-text"><div class="lockup-name">GBS Fit-Gap Workbench</div>${sub && html`<div class="lockup-sub">${sub}</div>`}</div></div>`;
}

/**
 * SVGs that only carry a viewBox have no intrinsic size; inside a flex plate the browser then sizes the plate to
 * zero and the logo overflows it. Give such SVGs width/height from their viewBox (data URL in, data URL out).
 */
const svgSizeCache = new Map();
function svgWithSize(dataUrl) {
  if (!/^data:image\/svg\+xml/.test(dataUrl || '')) return dataUrl;
  if (svgSizeCache.has(dataUrl)) return svgSizeCache.get(dataUrl);
  let out = dataUrl;
  try {
    const comma = dataUrl.indexOf(','); const head = dataUrl.slice(0, comma), body = dataUrl.slice(comma + 1); const b64 = /;base64/.test(head);
    const text = b64 ? new TextDecoder().decode(Uint8Array.from(atob(body), c => c.charCodeAt(0))) : decodeURIComponent(body);
    const root = text.match(/<svg\b[^>]*>/);
    if (root && !/\swidth\s*=/.test(root[0]) && !/\sheight\s*=/.test(root[0])) {
      const vb = root[0].match(/viewBox\s*=\s*["'][\d.\s,-]*?([\d.]+)[\s,]+([\d.]+)\s*["']/);
      if (vb) {
        const fixed = text.replace(root[0], root[0].replace(/^<svg\b/, `<svg width="${vb[1]}" height="${vb[2]}"`));
        const bytes = new TextEncoder().encode(fixed); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        out = 'data:image/svg+xml;base64,' + btoa(bin);
      }
    }
  } catch { /* keep the original */ }
  svgSizeCache.set(dataUrl, out); return out;
}

/** Client logo on a plate that matches the logo: light logos go on a dark plate and vice versa. */
// Explicit width from the aspect ratio: the plate is sized before the image is decoded, and an <img> with
// width:auto then contributes 0 px – the plate collapses and the logo overflows it.
const logoAspectCache = new Map();
function ClientLogo({ settings, height = 28, plate = true, className = '' }) {
  const src = settings?.logoDataUrl ? svgWithSize(settings.logoDataUrl) : null;
  const [aspect, setAspect] = useState(() => (src && logoAspectCache.get(src)) || settings?.logoAspect || 0);
  useEffect(() => { if (!src) return; const known = logoAspectCache.get(src); if (known) { setAspect(known); return; } const img = new Image(); img.onload = () => { const a = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0; if (a) { logoAspectCache.set(src, a); setAspect(a); } }; img.src = src; }, [src]);
  if (!src) return null;
  const dark = !!settings.logoOnDark;
  const style = `--logo-h:${height}px${aspect ? `;--logo-w:${(height * aspect).toFixed(1)}px` : ''}`;
  return html`<span class=${`logo-plate${plate ? '' : ' bare'}${dark ? ' lp-dark' : ' lp-light'}${aspect ? ' sized' : ''} ${className}`} style=${style}><img src=${src} alt=${settings.clientName ? `${settings.clientName} logo` : 'Client logo'} /></span>`;
}

const STREAM_ICON = { R2R: 'ledger', A2R: 'building', I2P: 'cart', I2C: 'coins', ICO: 'swap', MD: 'database' };
function streamIcon(stream) { return STREAM_ICON[String(stream || '').replace(/-.*$/, '')] || 'layers'; }

// ---------- logo processing (browser only) ----------

function loadImage(src) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('image could not be decoded')); img.src = src; }); }

/** Average luminance of the opaque pixels (0 … 1) and the share of opaque pixels. */
function imageStats(img, w, h) {
  const c = document.createElement('canvas'); const W = Math.max(1, Math.min(200, Math.round(w))), H = Math.max(1, Math.round(W * h / Math.max(1, w)));
  c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data; let lum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 40) continue; lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
  return { lum: n ? lum / n : 0, opaque: n / (W * H) };
}

/** Normalise any logo file / data URL: SVG stays SVG, rasters are downscaled to ≤ 1200 px; detects "white logo". */
async function prepareLogo(dataUrl, mime) {
  const isSvg = /^data:image\/svg\+xml/.test(dataUrl) || /svg/.test(mime || '');
  if (isSvg) dataUrl = svgWithSize(dataUrl);
  let out = dataUrl, w = 0, h = 0, onDark = false;
  try {
    const img = await loadImage(dataUrl);
    w = img.naturalWidth || img.width || 300; h = img.naturalHeight || img.height || 150;
    if (isSvg) { const m = atob(dataUrl.split(',')[1] || '').match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/); if (m && (!img.naturalWidth || img.naturalWidth === 300)) { w = Number(m[1]); h = Number(m[2]); } }
    const st = imageStats(img, w, h);
    onDark = st.lum > 0.78;
    if (isSvg && !w) { w = 300; h = 150; }
    if (!isSvg && w > 1200) { const c = document.createElement('canvas'); c.width = 1200; c.height = Math.round(1200 * h / w); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); out = c.toDataURL('image/png'); }
  } catch { /* keep the original */ }
  return { dataUrl: out, onDark, width: w, height: h };
}

function fileToDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); }); }

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };
const brandDirOf = (p) => p.replace(/[^/]*$/, '');
function brandResolvePath(base, target) { const parts = (brandDirOf(base) + target).split('/'); const out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); } return out.join('/'); }
function brandRelsOf(xml) { const out = {}; for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) { const id = m[0].match(/\bId="([^"]+)"/)?.[1], target = m[0].match(/\bTarget="([^"]+)"/)?.[1], type = m[0].match(/\bType="[^"]*\/([a-zA-Z]+)"/)?.[1]; if (id && target) out[id] = { target, type }; } return out; }

/** Pixel size of a PNG / JPEG / SVG from its bytes (null if unknown). */
function imageDims(bytes, ext) {
  try {
    if (ext === 'png' && bytes.length > 24) { const dv = new DataView(bytes.buffer, bytes.byteOffset); return { w: dv.getUint32(16), h: dv.getUint32(20) }; }
    if (ext === 'jpg' || ext === 'jpeg') { let i = 2; while (i < bytes.length - 9) { if (bytes[i] !== 0xFF) { i++; continue; } const m = bytes[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] }; } i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]); } return null; }
    if (ext === 'svg') { const head = new TextDecoder().decode(bytes.subarray(0, 600)); const vb = head.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/); if (vb) return { w: Number(vb[1]), h: Number(vb[2]) }; const w = head.match(/\swidth="([\d.]+)/), h = head.match(/\sheight="([\d.]+)/); if (w && h) return { w: Number(w[1]), h: Number(h[1]) }; }
  } catch { /* ignore */ }
  return null;
}

/**
 * Looks for the client logo in the workbook. Scores every picture in every sheet: logos sit in the first rows,
 * are a few centimetres wide, often carry an SVG; cover backgrounds, header strips and flow screenshots are large.
 * Returns { dataUrl, mime, sheet, name, score } or null.
 */
async function extractWorkbookLogo(buffer) {
  if (typeof JSZip === 'undefined') return null;
  const zip = await JSZip.loadAsync(buffer);
  const wbXml = await zip.file('xl/workbook.xml')?.async('string'); if (!wbXml) return null;
  const wbRels = brandRelsOf(await zip.file('xl/_rels/workbook.xml.rels')?.async('string') || '');
  const sheets = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map(m => ({ name: (m[0].match(/\bname="([^"]*)"/)?.[1] || '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<'), rId: m[0].match(/\br:id="([^"]+)"/)?.[1] }));
  const candidates = []; const seenMedia = new Map();
  for (const sh of sheets) {
    const rel = wbRels[sh.rId]; if (!rel) continue;
    const sheetPath = rel.target.startsWith('/') ? rel.target.slice(1) : 'xl/' + rel.target.replace(/^\/?xl\//, '');
    const sheetRels = brandRelsOf(await zip.file(sheetPath.replace(/([^/]+)$/, '_rels/$1.rels'))?.async('string') || '');
    const drawingRel = Object.values(sheetRels).find(r => r.type === 'drawing'); if (!drawingRel) continue;
    const drawingPath = brandResolvePath(sheetPath, drawingRel.target);
    const drawingXml = await zip.file(drawingPath)?.async('string'); if (!drawingXml) continue;
    const drawingRels = brandRelsOf(await zip.file(drawingPath.replace(/([^/]+)$/, '_rels/$1.rels'))?.async('string') || '');
    for (const anchor of drawingXml.matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/g)) {
      const a = anchor[0]; if (!/<xdr:pic>/.test(a)) continue;
      const ext = a.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/); const cxCm = ext ? Number(ext[1]) / 360000 : 0, cyCm = ext ? Number(ext[2]) / 360000 : 0;
      const fromRow = Number(a.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? 0), toRow = Number(a.match(/<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? fromRow);
      const svgId = a.match(/svgBlip\b[^>]*r:embed="([^"]+)"/)?.[1]; const blipId = a.match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[1];
      for (const id of [svgId, blipId].filter(Boolean)) {
        const r = drawingRels[id]; if (!r) continue; const path = brandResolvePath(drawingPath, r.target); const ext2 = path.split('.').pop().toLowerCase(); const mime = MIME_BY_EXT[ext2]; if (!mime || !zip.file(path)) continue;
        let bytes = seenMedia.get(path); if (!bytes) { bytes = await zip.file(path).async('uint8array'); seenMedia.set(path, bytes); }
        if (bytes.length > 3_000_000) continue;
        const dims = imageDims(bytes, ext2); const aspect = dims && dims.h ? dims.w / dims.h : 0;
        let score = 0;
        if (ext2 === 'svg') score += 4;
        if (fromRow <= 3) score += 2;
        if (cyCm > 0 && cyCm <= 2.5) score += 2;
        if (cxCm > 0 && cxCm <= 12) score += 1;
        if (cxCm > 60) score -= 4;
        if (toRow - fromRow >= 10) score -= 4;
        if (aspect >= 1.2 && aspect <= 12) score += 1; else if (aspect > 15 || (aspect > 0 && aspect < 0.5)) score -= 3;
        if (seenMedia.has(path + '#used')) score += 1; seenMedia.set(path + '#used', true);
        candidates.push({ path, mime, bytes, score, sheet: sh.name, isSvg: ext2 === 'svg' });
        if (ext2 === 'svg') break; // the PNG fallback of the same picture is not needed
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((x, y) => y.score - x.score || (y.isSvg - x.isSvg));
  const pick = candidates[0]; if (pick.score < 4) return null;
  let bin = ''; for (let i = 0; i < pick.bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, pick.bytes.subarray(i, i + 0x8000));
  return { dataUrl: `data:${pick.mime};base64,${btoa(bin)}`, mime: pick.mime, sheet: pick.sheet, name: pick.path.split('/').pop(), score: pick.score };
}

/** Brand colour → CSS variables on the document (present cover, hero, client plate). */
function applyBrandColor(color) {
  const el = document.documentElement;
  if (color && /^#[0-9a-f]{6}$/i.test(color)) { el.style.setProperty('--brand', color); el.setAttribute('data-brand', 'on'); } else { el.style.removeProperty('--brand'); el.removeAttribute('data-brand'); }
}

/** Plan page block: logo upload / preview / white-logo switch / brand colour. */
function BrandSettings({ session, updateSession, toast }) {
  const st = session.settings; const inp = useRef(); const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/^image\//.test(f.type) || f.size > 4_000_000) { toast('Please pick a PNG, SVG or JPG under 4 MB'); return; }
    setBusy(true);
    try { const raw = await fileToDataUrl(f); const logo = await prepareLogo(raw, f.type); updateSession(s => { s.settings.logoDataUrl = logo.dataUrl; s.settings.logoOnDark = logo.onDark; s.settings.logoSource = `upload:${f.name}`; }); toast(`Logo set${logo.onDark ? ' – white logo, shown on a dark plate' : ''}`); }
    catch (err) { toast(`Could not read the image: ${err.message}`); }
    finally { setBusy(false); }
  };
  return html`<div class="brand-settings">
    <div class="brand-preview">
      ${st.logoDataUrl ? html`<${ClientLogo} settings=${st} height=${44} />` : html`<div class="brand-empty"><${Icon} name="image" size=${18} /><span>No client logo yet – it is picked up automatically from the workbook cover sheet, or upload one.</span></div>`}
    </div>
    <div class="sg-row" style="margin:.5rem 0 0">
      <${Button} size="sm" icon="upload" disabled=${busy} onClick=${() => inp.current.click()}>${st.logoDataUrl ? 'Replace logo…' : 'Upload logo…'}</${Button}>
      ${st.logoDataUrl && html`<${Button} size="sm" variant="text" icon="trash" onClick=${() => { updateSession(s => { s.settings.logoDataUrl = null; s.settings.logoOnDark = false; s.settings.logoSource = 'removed'; }); toast('Logo removed'); }}>Remove</${Button}>`}
      ${st.logoDataUrl && html`<${Switch} checked=${!!st.logoOnDark} onChange=${v => updateSession(s => { s.settings.logoOnDark = v; })}>White logo (dark plate)</${Switch}>`}
      <input ref=${inp} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" style="display:none" onChange=${onFile} />
    </div>
    <div class="sg-row" style="margin:.6rem 0 0;align-items:center">
      <label class="small" style="display:flex;align-items:center;gap:.5rem"><span class="eyebrow">Brand colour</span><input type="color" class="colorpick" value=${st.brandColor || '#1f4e79'} onInput=${e => updateSession(s => { s.settings.brandColor = e.target.value; })} /></label>
      ${st.brandColor && html`<${Button} size="sm" variant="text" onClick=${() => updateSession(s => { s.settings.brandColor = ''; })}>Reset</${Button}>`}
      <span class="hint" style="margin:0">Used for the cover slide, the client plate and the hero – the gap colours stay as they are.</span>
    </div>
    ${st.logoSource && /^workbook:/.test(st.logoSource) && html`<div class="hint" style="margin-top:.4rem"><${Icon} name="info" size=${12} /> Picked up from ${st.logoSource.replace(/^workbook:/, '')}.</div>`}
  </div>`;
}
