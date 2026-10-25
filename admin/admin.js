// 서울글로벌 관리자 v1.2 — content/site.json 을 3개 언어로 고치고 GitHub 에 기록한다.
// v1.2(2026-10-25): 2단계 인증 — 비밀번호 + 이 기기의 패스키(Windows Hello 지문·PIN). 아래 「기기 등록」 참고.
// 로그인(2026-10-25 대표 지시): 기기마다 처음 한 번 GitHub 열쇠를 넣고 비밀번호를 정하면, 열쇠를 그 비밀번호로 암호화해
//   이 브라우저(localStorage)에만 보관한다. 다음부터 아이디 admin + 비밀번호로 연다. 비밀번호는 어디에도 저장하지 않는다.
//   암호화: PBKDF2-SHA256 60만 회 → AES-GCM 256 (Web Crypto). 사이트 공개 파일에는 비밀번호·열쇠가 0개.
// 화면에는 textContent/value 로만 쓴다(innerHTML 미사용).
// 검사: i18n-core.mjs (사이트 빌드와 같은 규칙). 저장: site.json + i18n.lock.json 을 커밋 1개로 기록.
import { leaves, hashInputs, validateData, buildLock } from './i18n-core.js';

// 다른 사이트가 이 화면을 틀(iframe) 안에 넣어 클릭을 가로채지 못하게 한다 (GitHub Pages 는 frame-ancestors 헤더를 못 씀)
if (window.top !== window.self) { document.documentElement.replaceChildren(); throw new Error('framed'); }

const REPO = 'petlegend/seoulglobal-renewal';
const BRANCH = 'main';
const API = 'https://api.github.com';
const FILES = { content: 'content/site.json', lock: 'content/i18n.lock.json', rules: 'content/rules.json' };
const LABEL = { meta: '검색 노출 문구', ui: '공통 문구', nav: '메뉴', hero: '첫 화면', creds: '요약 띠', about: '회사소개', founder: '회장소개',
  vision: '비전·미션', reconnect: '거래 재개', services: '서비스', process: '진행 절차', group: '그룹사', compliance: '준법 원칙',
  contact: '문의', footer: '푸터·연락', privacy: '개인정보 처리방침', notFound: '없는 주소(404) 화면', seo: '검색 제목·설명', intro: '메인 소개 단락' };
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

// ---------- 기기 등록(열쇠 암호화 보관) ----------
// v2(2026-10-25, 2단계 인증): 열쇠를 「비밀번호」와 「이 기기의 패스키(Windows Hello 지문·PIN 등)」 두 가지가 모두 있어야 풀리게 잠근다.
//   키 = HKDF( PBKDF2(아이디·비밀번호) ‖ 패스키 PRF 출력 ). 패스키 비밀값은 기기 보안칩 밖으로 나오지 않는다.
//   v1(비밀번호만) 보관함은 다음 로그인 때 패스키를 만들어 v2 로 옮긴다(열쇠 재입력 불필요).
const VAULT_KEY = 'sg_admin_vault_v2', OLD_VAULT_KEY = 'sg_admin_vault_v1';
const ITER = 600000;
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const slot = (k) => ({ get: () => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del: () => { try { localStorage.removeItem(k); } catch {} } });
const store = slot(VAULT_KEY), oldStore = slot(OLD_VAULT_KEY);
async function pwBits(id, pw, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(`${id}\u0000${pw}`), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, 256));
}
async function aesKey(ikm, salt, info, iter) {
  if (!info) { // v1: 비밀번호만
    const base = await crypto.subtle.importKey('raw', ikm, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

// 패스키: 기기 인증(지문·얼굴·PIN) + PRF 로 32바이트 비밀값을 얻는다. 서버가 없으므로 challenge 는 무작위(서명 검증 대신 PRF 값으로 확인).
// 패스키 이름 — Windows 패스키 목록에서 펫레전드 관리자와 구분되게 (2026-10-25 대표 지시). 이름이 다른 옛 패스키는 다음 로그인 때 새로 만든다
const PK_USER = 'seoulglobal-admin';
const prfOf = (cred) => cred?.getClientExtensionResults?.().prf?.results?.first;
async function passkeyGet(credId, prfSalt) {
  const cred = await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(credId) }],
    userVerification: 'required', timeout: 120000, extensions: { prf: { eval: { first: unb64(prfSalt) } } } } });
  const out = prfOf(cred);
  if (!out) throw new Error('NOPRF');
  return new Uint8Array(out);
}
async function passkeyCreate(prfSalt) {
  if (!window.PublicKeyCredential) throw new Error('NOPRF');
  const cred = await navigator.credentials.create({ publicKey: { challenge: rand(32), rp: { name: 'Seoul Global 관리자' },
    user: { id: rand(16), name: PK_USER, displayName: 'Seoul Global admin (seoulglobal.co.kr)' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { userVerification: 'required', residentKey: 'discouraged' }, timeout: 120000, attestation: 'none',
    extensions: { prf: { eval: { first: prfSalt } } } } });
  const credId = b64(cred.rawId), ext = cred.getClientExtensionResults().prf;
  if (!ext?.enabled && !ext?.results) throw new Error('NOPRF');
  // 만들 때 값을 주지 않는 기기도 있다 → 한 번 더 인증해서 받는다
  const out = ext.results?.first ? new Uint8Array(ext.results.first) : await passkeyGet(credId, b64(prfSalt));
  return { credId, out };
}
// 열쇠 잠그기(v2): 비밀번호 + 새 패스키
async function sealToken(id, pw, tok) {
  const salt = rand(16), iv = rand(12), prfSalt = rand(32);
  const pk = await passkeyCreate(prfSalt);
  const key = await aesKey(concat(await pwBits(id, pw, salt), pk.out), salt, 'sg-admin-v2');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(tok)));
  return { v: 2, pk: PK_USER, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct), cred: pk.credId, prfSalt: b64(prfSalt), at: new Date().toISOString().slice(0, 10) };
}
async function openToken(id, pw, vault) {
  const salt = unb64(vault.salt);
  const key = vault.v === 2
    ? await aesKey(concat(await pwBits(id, pw, salt), await passkeyGet(vault.cred, vault.prfSalt)), salt, 'sg-admin-v2')
    : await aesKey(enc.encode(`${id}\u0000${pw}`), salt, '', vault.iter);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct)));
}
// 연속 실패 제한 (이 브라우저 기준): 5번 틀리면 30초씩 늘어나며 대기
const lockout = { get: () => { try { return JSON.parse(sessionStorage.getItem('sg_fail') || '{"n":0,"until":0}'); } catch { return { n: 0, until: 0 }; } },
  set: (o) => { try { sessionStorage.setItem('sg_fail', JSON.stringify(o)); } catch {} } };

// ---------- 열쇠 확인 → 편집 화면 열기 ----------
async function enter(tok) {
  token = tok;
  const user = await gh('/user').catch((e) => { throw new Error(String(e.message).startsWith('401') ? 'BAD' : e.message); });
  let repo;
  try { repo = await gh(`/repos/${REPO}`); } catch (e) { throw new Error(/^(403|404)/.test(e.message) ? 'NOREPO' : e.message); }
  if (!repo.permissions?.push) throw new Error('NOPUSH');
  await load();
  $('who').textContent = `admin 로그인됨${user?.login ? ` (GitHub ${user.login})` : ''}`;
  $('logout').hidden = false; $('login').hidden = true; $('app').hidden = false;
}
const reason = (m) => (m === 'BAD' ? 'GitHub 이 이 열쇠를 거부했습니다(401). 열쇠가 만료·삭제되었을 수 있습니다. 「이 기기 등록 지우기」 후 새 열쇠로 다시 등록하세요.'
  : m === 'NOREPO' ? '열쇠는 맞지만 seoulglobal-renewal 저장소에 접근할 수 없습니다. 열쇠 설정의 Repository access 에서 petlegend/seoulglobal-renewal 을 선택했는지 확인하세요.'
  : m === 'NOPUSH' ? '열쇠는 맞지만 쓰기 권한이 없습니다. Permissions → Contents 를 「Read and write」로 바꾸세요.'
  : `로그인 실패: ${m}`);

// 화면 고르기: 이 기기에 등록돼 있으면 아이디·비밀번호, 아니면 처음 등록
const vaultNow = () => store.get() || oldStore.get();
// 패스키 단계 실패 사유 (비밀번호 틀림과 구분 — 실패 횟수에 넣지 않는다)
const pkReason = (e) => (e?.message === 'NOPRF'
  ? '이 기기·브라우저는 2단계 인증(패스키 PRF)을 지원하지 않습니다. PC 크롬 최신판(Windows Hello)에서 등록하세요.'
  : e?.name === 'NotAllowedError' ? '2단계 인증(지문·PIN 확인)이 취소되었거나 시간이 지났습니다. 다시 로그인하세요.'
  : e?.name === 'InvalidStateError' ? '이 기기에 이미 같은 패스키가 있습니다. 「이 기기 등록 지우기」 후 다시 등록하세요.'
  : `2단계 인증 실패: ${e?.name || ''} ${e?.message || e}`);
const isPk = (e) => e?.message === 'NOPRF' || ['NotAllowedError', 'InvalidStateError', 'SecurityError', 'NotSupportedError', 'AbortError'].includes(e?.name);
function showLogin() {
  const has = !!vaultNow();
  $('pw-form').hidden = !has; $('login-form').hidden = has; $('howto').hidden = has;
  (has ? $('uid') : $('token')).focus();
}
showLogin();
$('remember').addEventListener('change', () => { $('set-pw').hidden = !$('remember').checked; });
$('forget').addEventListener('click', () => { store.del(); oldStore.del(); lockout.set({ n: 0, until: 0 }); $('pw-msg').textContent = ''; showLogin(); });

// 아이디·비밀번호 로그인
$('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('pw-msg'), lo = lockout.get();
  const fail = (t) => { token = ''; msg.className = 'msg err'; msg.textContent = t; };
  if (Date.now() < lo.until) return fail(`여러 번 틀려서 잠시 막혔습니다. ${Math.ceil((lo.until - Date.now()) / 1000)}초 뒤에 다시 시도하세요.`);
  const id = $('uid').value.trim(), pw = $('upw').value;
  $('upw').value = '';
  const vault = vaultNow();
  msg.className = 'msg';
  msg.textContent = vault.v === 2 ? '2단계 인증 — 지문·PIN 확인 창이 뜹니다…' : '확인 중…';
  let tok;
  try { tok = await openToken(id, pw, vault); } catch (err) {
    if (isPk(err)) return fail(pkReason(err));
    const n = lo.n + 1;
    lockout.set({ n, until: n >= 5 ? Date.now() + 30000 * (n - 4) : 0 });
    return fail(`아이디 또는 비밀번호가 틀렸습니다${n >= 5 ? ' — 잠시 막힙니다' : ` (${n}/5)`}.`);
  }
  lockout.set({ n: 0, until: 0 });
  if (vault.v !== 2 || vault.pk !== PK_USER) {
    // 비밀번호만으로 잠긴 옛 등록, 또는 이름이 「admin」 인 옛 패스키 → 이번에 「seoulglobal-admin」 패스키를 만들어 다시 잠근다(열쇠 재입력 없음)
    msg.textContent = `2단계 인증 등록 — 이 기기의 지문·PIN 으로 패스키 「${PK_USER}」를 만듭니다. 확인 창이 두 번 뜰 수 있습니다…`;
    try { if (!store.set(await sealToken(id, pw, tok))) throw new Error('저장 실패(시크릿 창 등)'); oldStore.del(); }
    catch (err) { return fail(isPk(err) ? pkReason(err) : `2단계 인증 등록 실패: ${err.message}`); }
  }
  try { await enter(tok); } catch (err) { fail(reason(String(err.message))); }
});

// 처음 등록(열쇠) 로그인
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('login-msg');
  const fail = (text) => { token = ''; msg.className = 'msg err'; msg.textContent = text; };
  // 복사할 때 섞이기 쉬운 공백·줄바꿈·따옴표를 지운다 (열쇠 자체에는 이런 글자가 없다)
  const tok = $('token').value.replace(/[\s"'`]/g, '');
  if (!/^(github_pat_[A-Za-z0-9_]{60,}|ghp_[A-Za-z0-9]{30,})$/.test(tok)) {
    return fail(`열쇠 모양이 아닙니다 (지금 ${tok.length}글자, 앞부분 「${tok.slice(0, 11)}」). 「github_pat_」로 시작하는 긴 글자(90자 안팎)를 처음부터 끝까지 복사했는지 확인하세요.`);
  }
  const remember = $('remember').checked;
  const id = $('new-id').value.trim(), pw = $('new-pw').value, pw2 = $('new-pw2').value;
  if (remember) {
    if (!id) return fail('아이디를 넣으세요.');
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return fail('비밀번호는 10자 이상, 영문과 숫자를 섞어 주세요.');
    if (pw !== pw2) return fail('비밀번호 두 칸이 서로 다릅니다.');
  }
  $('token').value = ''; $('new-pw').value = ''; $('new-pw2').value = '';
  msg.className = 'msg'; msg.textContent = '확인 중…';
  try {
    await enter(tok);   // 열쇠가 실제로 맞을 때만 이 기기에 등록한다
  } catch (err) { return fail(reason(String(err.message))); }
  if (!remember) return;
  const say = (ok, t) => $('report').replaceChildren(el('li', { className: ok ? 'ok' : 'err', textContent: t }));
  say(true, '2단계 인증 등록 — 이 기기의 지문·PIN 확인 창이 뜹니다(두 번 뜰 수 있음)…');
  try {
    const ok = store.set(await sealToken(id, pw, tok));
    if (ok) oldStore.del();
    say(ok, ok ? `이 기기를 등록했습니다. 다음부터 아이디 「${id}」 + 비밀번호 + 지문·PIN(2단계)으로 로그인하세요.`
      : '이 브라우저가 저장을 막아 기기 등록을 하지 못했습니다(시크릿 창 등). 다음에도 열쇠를 넣어야 합니다.');
  } catch (err) { say(false, `기기 등록을 하지 못했습니다 — ${isPk(err) ? pkReason(err) : err.message} 이번 접속은 계속 쓸 수 있고, 다음에는 열쇠를 다시 넣어야 합니다.`); }
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
    $('report').replaceChildren(el('li', { className: 'ok', textContent: `저장 완료 (${commit.sha.slice(0, 7)}). 자동 검사가 끝나면 사이트에 자동 반영됩니다(2~3분).` }));
  } catch (e) { alertReport(e); } finally { btn.disabled = false; }
});
