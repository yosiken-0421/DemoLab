// 統合機能用の最小限の .xlsx 読み込み。本アプリの出力ファイルと、
// それを Excel で開いて保存し直したもの（共有文字列形式）の両方を読める。
import JSZip from 'jszip';

export type ReadValue = string | number | null;
export interface ReadSheet {
  name: string;
  rows: ReadValue[][];
}

function unescapeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unescapeXml(m[1]) : undefined;
}

/** <t> 要素を連結（ふりがな <rPh> 内は除外） */
function textOf(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  const parts = [...withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)];
  return parts.map((m) => unescapeXml(m[1] ?? '')).join('');
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolvePath(target: string): string {
  const t = target.replace(/^\//, '');
  return t.startsWith('xl/') ? t : `xl/${t}`;
}

export async function readXlsx(data: Uint8Array | ArrayBuffer): Promise<ReadSheet[]> {
  const zip = await JSZip.loadAsync(data);
  const read = async (path: string) => (await zip.file(path)?.async('string')) ?? null;

  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('Excelファイル（.xlsx）として読み込めませんでした');
  const rels = (await read('xl/_rels/workbook.xml.rels')) ?? '';
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) relMap.set(id, resolvePath(target));
  }

  const shared: string[] = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const sheets: ReadSheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name') ?? '';
    const rid = attr(m[0], 'r:id');
    const path = rid ? relMap.get(rid) : undefined;
    const xml = path ? await read(path) : null;
    if (!xml) continue;
    const rows: ReadValue[][] = [];
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rIndex = Number(attr(`<row${rm[1]}>`, 'r') ?? rows.length + 1) - 1;
      const row: ReadValue[] = [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const open = `<c${cm[1]}>`;
        const ref = attr(open, 'r');
        const type = attr(open, 't');
        const body = cm[2] ?? '';
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value: ReadValue = null;
        if (type === 's') value = v !== undefined ? shared[Number(v)] ?? '' : null;
        else if (type === 'inlineStr') value = textOf(body);
        else if (type === 'str' || type === 'e') value = v !== undefined ? unescapeXml(v) : null;
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== undefined) value = Number(v);
        row[ref ? colIndex(ref) : row.length] = value;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
      rows[rIndex] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows });
  }
  return sheets;
}

/** Excel のシリアル日付（1900年基準）を YYYY-MM-DD に変換 */
export function excelSerialToYmd(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
