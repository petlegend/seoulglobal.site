// 서울글로벌 관리자 v1 — content/site.json 을 3개 언어로 고치고 GitHub 에 기록한다.
// 보안: 토큰은 이 변수(메모리)에만 둔다. localStorage·쿠키에 저장하지 않는다. 화면에는 textContent/value 로만 쓴다(innerHTML 미사용).
// 검사: i18n-core.mjs (사이트 빌드와 같은 규칙). 저장: site.json + i18n.lock.json 을 커밋 1개로 기록.
import { leaves, hashInputs, validateData, buildLock } from './i18n-core.js';

const REPO = 'petlegend/seoulglobal-renewal';
const BRANCH = 'main';
const API = 'https://api.github.com';
const FILES = { content: 'content/site.json', lock: 'content/i18n.lock.json', rules: 'content/rules.json' };
const LABEL = { meta: '검색 노출 문구', ui: '공통 문구', nav: '메뉴', hero: '첫 화면', creds: '요약 띠', about: '회사소개', founder: '회장소개',
  vision: '비전·미션', reconnect: '거래 재개', services: '서비스', process: '진행 절차', group: '그룹사', compliance: '준법 원칙',
  contact: '문의', footer: '푸터·연락', privacy: '개인정보 처리방침' };
const ORDER = ['contact', 'footer', 'about', 'founder', 'hero', 'services', 'process', 'reconnect', 'vision', 'group', 'creds', 'nav', 'meta', 'ui', 'compliance', 'privacy'];
const LEGAL = new Set(['privacy', 'compliance']);

let token = '';           // 메모리에만
let baseSha = '';         // 불러온 시점의 main 커밋
let original = null;      // 불러온 site.json
let draft = null;         // 고치는 중인 사본
let rules = null, lock = null;
let current = '';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach((k) => e.append(k)); return e; };

async function gh(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`${res.status} ${res.statusText} ${t.slice(0, 160)}`); }
  return res.status === 204 ? null : res.json();
}
const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
async function readFile(p, ref) { const j = await gh(`/repos/${REPO}/contents/${p}?ref=${ref}`); return b64ToText(j.content); }

// 경로 "founder.career[0].y" 로 값 읽기·쓰기
const parts = (p) => p.replace(/\[(\d+)\]/g, '.$1').split('.');
const getAt = (obj, p) => parts(p).reduce((o, k) => o?.[k], obj);
function setAt(obj, p, v) { const ks = parts(p); const last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = v; }

// ---------- 로그인 ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('login-msg');
  token = $('token').value.trim();
  $('token').value = '';
  msg.className = 'msg'; msg.textContent = '확인 중…';
  try {
    const repo = await gh(`/repos/${REPO}`);
    if (!repo.permissions?.push) throw new Error('이 토큰에 저장소 쓰기 권한(Contents: Read and write)이 없습니다');
    const user = await gh('/user').catch(() => null);
    await load();
    $('who').textContent = user?.login ? `${user.login} 로그인됨` : '로그인됨';
    $('logout').hidden = false; $('login').hidden = true; $('app').hidden = false;
  } catch (err) {
    token = '';
    msg.className = 'msg err';
    msg.textContent = String(err.message).startsWith('401') ? '토큰이 올바르지 않거나 만료되었습니다.' : `로그인 실패: ${err.message}`;
  }
});
$('logout').addEventListener('click', () => { token = ''; location.reload(); });

async function load() {
  const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  baseSha = ref.object.sha;
  const [c, l, r] = await Promise.all([readFile(FILES.content, baseSha), readFile(FILES.lock, baseSha), readFile(FILES.rules, baseSha)]);
  original = JSON.parse(c); draft = JSON.parse(c); lock = JSON.parse(l); rules = JSON.parse(r);
  const keys = Object.keys(draft).filter((k) => !k.startsWith('_'));
  const sorted = [...ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !ORDER.includes(k))];
  const nav = $('sections'); nav.replaceChildren();
  sorted.forEach((k) => { const b = el('button', { type: 'button', textContent: LABEL[k] || k, onclick: () => show(k) }); b.dataset.key = k; nav.append(b); });
  show(sorted[0]);
}

// ---------- 편집 화면 ----------
function show(key) {
  current = key;
  [...$('sections').children].forEach((b) => b.setAttribute('aria-current', String(b.dataset.key === key)));
  $('sec-title').textContent = LABEL[key] || key;
  $('sec-warn').hidden = !LEGAL.has(key);
  const box = $('fields'); box.replaceChildren();
  for (const { path, leaf } of leaves(draft[key], key)) {
    if (!leaf) continue;
    const f = el('div', { className: 'field' });
    f.dataset.path = path;
    f.append(el('div', { className: 'path', textContent: path }));
    const langs = el('div', { className: 'langs' + ('all' in leaf ? ' one' : '') });
    for (const l of 'all' in leaf ? ['all'] : ['ko', 'ru', 'en']) {
      const ta = el('textarea', { value: leaf[l] ?? '', rows: Math.min(6, Math.max(1, Math.ceil((leaf[l] || '').length / 60))) });
      ta.addEventListener('input', () => { getAt(draft, path)[l] = ta.value; markChanged(); });
      langs.append(el('label', {}, l === 'all' ? '공통' : { ko: '국문', ru: 'Русский', en: 'English' }[l], ta));
    }
    f.append(langs);
    box.append(f);
  }
  markChanged();
}

function changedPaths() {
  return leaves(draft).filter(({ path, leaf }) => leaf && JSON.stringify(leaf) !== JSON.stringify(getAt(original, path))).map((x) => x.path);
}
function markChanged() {
  const ch = new Set(changedPaths());
  document.querySelectorAll('.field').forEach((f) => f.classList.toggle('changed', ch.has(f.dataset.path)));
  [...$('sections').children].forEach((b) => {
    const key = b.dataset.key;
    const has = [...ch].some((p) => p === key || p.startsWith(key + '.') || p.startsWith(key + '['));
    b.textContent = (LABEL[key] || key) + (has ? ' •' : '');
  });
  $('changes').textContent = ch.size ? `바뀐 항목 ${ch.size}개` : '바뀐 항목 없음';
}

// ---------- 검사 ----------
async function sha16(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
async function hashTable(content) {
  const table = {};
  for (const { path, leaf } of leaves(content)) {
    if (!leaf) continue;
    const h = {};
    for (const [k, v] of Object.entries(hashInputs(leaf))) h[k] = await sha16(v);
    table[path] = h;
  }
  return table;
}
async function runCheck() {
  const table = await hashTable(draft);
  const hashOf = (p) => table[p];
  const res = validateData({ content: draft, rules, lock, hashOf });
  const reason = $('reason').value.trim();
  const blocking = reason ? res.errors.filter((e) => !res.koOnly.some((p) => e.startsWith(`[${p}]`))) : res.errors;
  const rep = $('report'); rep.replaceChildren();
  if (blocking.length) blocking.forEach((e) => rep.append(el('li', { className: 'err', textContent: e })));
  else rep.append(el('li', { className: 'ok', textContent: `검사 통과 — 바뀐 항목 ${res.pending.length + (reason ? res.koOnly.length : 0)}개` }));
  return { ok: !blocking.length, res, hashOf, reason };
}
$('check').addEventListener('click', () => runCheck().catch((e) => alertReport(e)));

// ---------- 저장 (커밋 1개) ----------
function alertReport(e) { $('report').replaceChildren(el('li', { className: 'err', textContent: String(e.message || e) })); }
$('save').addEventListener('click', async () => {
  const btn = $('save'); btn.disabled = true;
  try {
    const ch = changedPaths();
    if (!ch.length) throw new Error('바뀐 항목이 없습니다');
    const { ok, res, hashOf, reason } = await runCheck();
    if (!ok) throw new Error('검사를 통과하지 못했습니다 — 위 목록을 고치세요');
    const head = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    if (head.object.sha !== baseSha) throw new Error('그사이 다른 변경이 저장되었습니다. 새로고침 후 다시 고쳐 주세요(지금 고친 내용은 사라집니다).');
    const baseCommit = await gh(`/repos/${REPO}/git/commits/${baseSha}`);
    const newLock = buildLock(res.list, hashOf);
    const blob = (text) => gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: text, encoding: 'utf-8' }) });
    const [b1, b2] = await Promise.all([blob(JSON.stringify(draft, null, 2) + '\n'), blob(JSON.stringify(newLock, null, 1) + '\n')]);
    const tree = await gh(`/repos/${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: [
      { path: FILES.content, mode: '100644', type: 'blob', sha: b1.sha }, { path: FILES.lock, mode: '100644', type: 'blob', sha: b2.sha }] }) });
    const message = `관리자 수정: ${ch.slice(0, 5).join(', ')}${ch.length > 5 ? ` 외 ${ch.length - 5}건` : ''}${reason ? `\n\n국문만 수정 사유: ${reason}` : ''}`;
    const commit = await gh(`/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }) });
    await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
    baseSha = commit.sha; original = JSON.parse(JSON.stringify(draft)); lock = newLock; $('reason').value = '';
    markChanged();
    $('report').replaceChildren(el('li', { className: 'ok', textContent: `저장 완료 (${commit.sha.slice(0, 7)}). 자동 검사가 끝나면 GitHub → Actions → deploy 로 배포하세요.` }));
  } catch (e) { alertReport(e); } finally { btn.disabled = false; }
});
