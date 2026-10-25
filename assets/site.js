// Seoul Global — 시계, 모바일 메뉴, 상담 신청서(서버 저장 없이 이메일로 전달)
(function () {
  var data = {};
  try { data = JSON.parse(document.getElementById('i18n-data').textContent); } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };

  // 서울·모스크바 시계
  function fmt(tz) {
    try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date()); }
    catch (e) { return '--:--'; }
  }
  function tick() {
    if (!$('t-seoul')) return;
    $('t-seoul').textContent = fmt('Asia/Seoul');
    $('t-msk').textContent = fmt('Europe/Moscow');
    var h = parseInt(fmt('Europe/Moscow').slice(0, 2), 10);
    var s = $('overlap');
    var now = h >= 9 && h < 12;
    s.textContent = '';
    if (now) { var b = document.createElement('b'); b.textContent = data.overlapNow + ' '; s.appendChild(b); }
    s.appendChild(document.createTextNode(data.overlap || ''));
  }
  tick(); setInterval(tick, 30000);

  // 모바일 메뉴
  var header = document.querySelector('.site-header');
  var toggle = $('menu-toggle');
  if (toggle && header) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    header.querySelectorAll('.menu a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function () { header.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); });
    });
  }

  // 카피 방지 — 입력칸·신청서 미리보기만 예외 (화면 단 억제이며 소스 보기·캡처까지는 막지 못함)
  function editable(el) { return el && el.closest && el.closest('input, textarea, select, pre, [contenteditable]'); }
  ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (!editable(e.target)) e.preventDefault(); });
  });

  // 광고 전환 신호 — content/tracking.json 에 값이 있는 전환만 보낸다 (기본: 아무것도 안 보냄)
  var tr = data.track || { g: {}, n: {}, m: {} };
  function track(kind) {
    try { if (tr.m && tr.m[kind] && window.fbq) window.fbq('track', tr.m[kind]); } catch (e) {}
    try { if (tr.g[kind] && window.gtag) window.gtag('event', 'conversion', { send_to: tr.g[kind] }); } catch (e) {}
    try { if (tr.n[kind] && window.wcs && window.wcs.trans) window.wcs.trans({ type: tr.n[kind] }); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a, .copy-num');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if (el.id === 'form-mail') track('inquiry');                                   // 상담 신청서 → 이메일로 보내기
    else if (href.indexOf('tel:') === 0) track('call');                            // 전화
    else if (el.classList.contains('copy-num') || href.indexOf('wa.me/') > -1) track('messenger'); // 카카오톡·WhatsApp
    else if (href.indexOf('mailto:') === 0) track('email');                        // 이메일
  });

  // 푸터 카카오톡 번호 복사 (전화번호만으로 여는 카카오톡 링크는 없음)
  document.querySelectorAll('.copy-num').forEach(function (b) {
    var n = b.querySelector('.n');
    b.addEventListener('click', function () {
      var num = b.getAttribute('data-copy'), orig = n.textContent;
      function done() { n.textContent = data.numCopied || num; setTimeout(function () { n.textContent = orig; }, 1800); }
      try { navigator.clipboard.writeText(num).then(done, function () {}); } catch (e) {}
    });
  });

  // 상담 신청서
  var form = $('inquiry');
  if (!form) return;
  var f = data.form || {};
  function v(id) { return ($(id).value || '').trim(); }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true;
    ['f-co', 'f-nm', 'f-em'].forEach(function (id) {
      var bad = !v(id) || (id === 'f-em' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v(id)));
      $(id).setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) ok = false;
    });
    var msg = $('form-msg'), out = $('form-out');
    if (!ok) { msg.textContent = f.error; msg.className = 'form-msg err'; msg.hidden = false; out.hidden = true; return; }
    var svc = [].slice.call(form.querySelectorAll('.chips input:checked')).map(function (i) { return i.value; }).join(', ') || f.none;
    var text = f.subject + ' ' + v('f-co') + '\n' +
      f.co + ': ' + v('f-co') + '\n' +
      f.nm + ': ' + v('f-nm') + '\n' +
      f.em + ': ' + v('f-em') + '\n' +
      f.ph + ': ' + (v('f-ph') || '-') + '\n' +
      f.cat + ': ' + v('f-cat') + '\n' +
      f.svc + ': ' + svc + '\n\n' +
      f.msg + ':\n' + (v('f-msg') || '-');
    $('form-pre').textContent = text;
    $('form-mail').href = 'mailto:' + data.email + '?subject=' + encodeURIComponent(f.subject + ' ' + v('f-co')) + '&body=' + encodeURIComponent(text);
    msg.textContent = f.ready; msg.className = 'form-msg'; msg.hidden = false;
    out.hidden = false;
  });
  $('form-copy').addEventListener('click', function () {
    var pre = $('form-pre'), b = this;
    function sel() {
      var r = document.createRange(); r.selectNodeContents(pre);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      b.textContent = f.selected;
    }
    try { navigator.clipboard.writeText(pre.textContent).then(function () { b.textContent = f.copied; }, sel); }
    catch (e) { sel(); }
  });
})();
