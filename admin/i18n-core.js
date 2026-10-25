// 3개 언어(ko/ru/en) 검사 규칙 — Node(i18n.mjs)와 관리자 화면(브라우저)이 함께 쓰는 순수 함수.
// 파일·해시 계산은 하지 않는다. 해시는 호출하는 쪽이 hashOf(path, leaf) 로 넘긴다
// (Node = crypto, 브라우저 = Web Crypto). 해시 형식: SHA-256 16진수 앞 16자리.
export const LANGS = ['ko', 'ru', 'en'];

export function isLeaf(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const keys = Object.keys(o);
  return keys.length > 0 && keys.every((k) => k === 'all' || LANGS.includes(k));
}

export function leaves(node, p = '', out = []) {
  if (isLeaf(node)) out.push({ path: p, leaf: node });
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${p}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('_')) leaves(v, p ? `${p}.${k}` : k, out);
  } else out.push({ path: p, leaf: null, raw: node });
  return out;
}

// 해시를 매길 문자열 목록 — {all} 은 하나, 언어별은 ko/ru/en
export const hashInputs = (leaf) => ('all' in leaf ? { all: leaf.all } : Object.fromEntries(LANGS.map((l) => [l, leaf[l] ?? ''])));

export const tagsOf = (s) => (s.match(/<\/?([a-z]+)[^>]*>/gi) || []).map((t) => t.toLowerCase().replace(/\s.*?>/, '>')).sort();

// errors: 반드시 고쳐야 하는 문제 / pending: 확인 후 잠금 갱신이 필요한 변경 / koOnly: 국문만 바뀐 항목
export function validateData({ content, rules, lock = {}, useLock = true, hashOf }) {
  const list = leaves(content);
  const errors = [];
  const pending = [];
  const koOnly = [];

  for (const { path: p, leaf, raw } of list) {
    if (!leaf) { errors.push(`[${p}] 값은 {"ko","ru","en"} 또는 {"all"} 형태여야 합니다 (현재: ${JSON.stringify(raw)})`); continue; }
    if ('all' in leaf) {
      if (Object.keys(leaf).length > 1) errors.push(`[${p}] "all" 과 언어별 값을 함께 쓸 수 없습니다`);
      if (typeof leaf.all !== 'string' || !leaf.all.trim()) errors.push(`[${p}] "all" 값이 비어 있습니다`);
    } else {
      for (const l of LANGS) {
        if (typeof leaf[l] !== 'string' || !leaf[l].trim()) errors.push(`[${p}] ${l.toUpperCase()} 누락 — 국문을 쓰면 RU·EN 도 반드시 함께 작성`);
      }
      const t = LANGS.map((l) => tagsOf(leaf[l] || '').join(','));
      if (new Set(t).size > 1) errors.push(`[${p}] 강조 태그(<em>/<b> 등)가 언어마다 다릅니다: ${LANGS.map((l, i) => `${l}=${t[i] || '없음'}`).join(' / ')}`);
    }
    for (const l of LANGS) {
      const text = 'all' in leaf ? leaf.all : leaf[l];
      if (typeof text !== 'string') continue;
      for (const tag of tagsOf(text)) {
        const name = tag.replace(/[<>/]/g, '');
        if (!rules.allowedTags.includes(name)) errors.push(`[${p}] 허용되지 않은 태그 ${tag}`);
      }
      // 태그에 속성(onclick·style·href 등)을 붙이는 것은 금지 — 문구로 스크립트를 심지 못하게 한다
      if (/<\/?[a-z]+\s+[^>]*>/i.test(text)) errors.push(`[${p}] 태그에 속성을 붙일 수 없습니다 (예: <b> 만 허용, <b onclick=…> 금지)`);
      for (const r of rules.forbidden) {
        if (!r.langs.includes(l) && !('all' in leaf)) continue;
        if (new RegExp(r.pattern, r.flags || '').test(text)) errors.push(`[${p}] 금지 표기 "${r.pattern}" — ${r.reason}`);
      }
      for (const r of rules.requiredContext) {
        if (r.lang !== l && !('all' in leaf)) continue;
        const flags = (r.flags || '') + 'g';
        const n = (text.match(new RegExp(r.pattern, flags)) || []).length;
        const ok = (text.match(new RegExp(r.mustMatch, flags)) || []).length;
        if (n > ok) errors.push(`[${p}] ${r.reason}`);
      }
    }

    if (!useLock) continue;
    const prev = lock[p];
    const now = hashOf(p, leaf);
    if (!prev) { pending.push(`[${p}] 신규 항목`); continue; }
    if ('all' in now || 'all' in prev) {
      if (JSON.stringify(prev) !== JSON.stringify(now)) pending.push(`[${p}] 변경됨`);
      continue;
    }
    const koChanged = prev.ko !== now.ko;
    const untranslated = ['ru', 'en'].filter((l) => prev[l] === now[l]);
    if (koChanged && untranslated.length) {
      koOnly.push(p);
      errors.push(`[${p}] 국문이 바뀌었는데 ${untranslated.map((l) => l.toUpperCase()).join('·')} 가 그대로입니다 — 같은 내용으로 함께 수정하세요`);
    } else if (koChanged || prev.ru !== now.ru || prev.en !== now.en) {
      pending.push(`[${p}] 변경됨`);
    }
  }
  if (useLock) {
    const current = new Set(list.map((x) => x.path));
    for (const p of Object.keys(lock)) if (!current.has(p)) pending.push(`[${p}] 삭제됨`);
  }
  return { errors, pending, koOnly, list };
}

// 새 잠금 내용 (lock 파일 형식과 같다)
export function buildLock(list, hashOf) {
  const lock = {};
  for (const { path: p, leaf } of list) if (leaf) lock[p] = hashOf(p, leaf);
  return lock;
}
