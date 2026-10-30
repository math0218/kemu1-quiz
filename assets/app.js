(function () {
  'use strict';

  const DATA = window.QUIZ_DATA;
  const QUESTIONS = DATA.questions;
  const META = DATA.meta;
  const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const STORAGE_KEY = 'kemu1-quiz-v1';

  const view = document.getElementById('view');
  const modalRoot = document.getElementById('modalRoot');
  const toastRoot = document.getElementById('toastRoot');
  const navWrong = document.getElementById('navWrongCount');
  const footerMeta = document.getElementById('footerMeta');

  let session = null;
  let current = null;
  let currentView = 'home';

  /* ---------------- state ---------------- */

  function defaultState() {
    return {
      answered: {},
      wrong: {},
      last: { mode: 'sequence', index: 0 },
      positions: { sequence: 0, random: 0, wrong: 0, unseen: 0 },
      randomOrder: null,
      settings: { autoNext: false }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        answered: parsed.answered || {},
        wrong: parsed.wrong || {},
        last: { ...base.last, ...(parsed.last || {}) },
        positions: { ...base.positions, ...(parsed.positions || {}) },
        settings: { ...base.settings, ...(parsed.settings || {}) }
      };
    } catch (e) {
      return defaultState();
    }
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage may be full or unavailable */
    }
  }

  function answeredCount() { return Object.keys(state.answered).length; }
  function correctCount() {
    return Object.values(state.answered).filter((a) => a && a.correct).length;
  }
  function wrongCount() { return Object.keys(state.wrong).length; }

  function accuracy() {
    const n = answeredCount();
    if (!n) return 0;
    return Math.round((correctCount() / n) * 100);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildOrder(mode) {
    if (mode === 'sequence') return QUESTIONS.map((q) => q.id);
    if (mode === 'random') {
      if (!Array.isArray(state.randomOrder) || state.randomOrder.length !== QUESTIONS.length) {
        state.randomOrder = shuffle(QUESTIONS.map((q) => q.id));
        save();
      }
      return state.randomOrder.slice();
    }
    if (mode === 'wrong') {
      return Object.keys(state.wrong)
        .map(Number)
        .sort((a, b) => (state.wrong[b].ts || 0) - (state.wrong[a].ts || 0))
        .filter((id) => BY_ID.has(id));
    }
    if (mode === 'unseen') {
      return QUESTIONS.filter((q) => !state.answered[q.id]).map((q) => q.id);
    }
    return QUESTIONS.map((q) => q.id);
  }

  function startMode(mode, opts = {}) {
    if (mode === 'random' && !opts.resume) {
      state.randomOrder = shuffle(QUESTIONS.map((q) => q.id));
      state.positions.random = 0;
      save();
    }
    const order = buildOrder(mode);
    let index = opts.resume ? (state.positions[mode] || 0) : 0;
    if (index >= order.length) index = 0;
    if (opts.focusId) {
      const found = order.indexOf(opts.focusId);
      if (found >= 0) index = found;
    }
    session = {
      mode,
      order,
      index,
      answeredIds: new Set(),
      removedIds: new Set(),
      answeredThisRound: 0,
      correctThisRound: 0,
      retryId: null
    };
    state.last = { mode, index };
    state.positions[mode] = index;
    save();
    if (location.hash !== '#/practice') location.hash = '#/practice';
    else render();
  }

  function resumeSession() {
    if (session) return;
    const mode = state.last.mode || 'sequence';
    const order = buildOrder(mode);
    let index = state.positions[mode] || 0;
    if (index >= order.length) index = 0;
    session = {
      mode,
      order,
      index,
      answeredIds: new Set(),
      removedIds: new Set(),
      answeredThisRound: 0,
      correctThisRound: 0,
      retryId: null
    };
  }

  /* ---------------- helpers ---------------- */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  const icon = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    broom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 5-4 4M14 6l4 4M5 21c.8-3 2.5-5.5 5-8l3 3c-2.5 2.5-5 4.2-8 5ZM13 10l-3-3 3-3 3 3-3 3Z"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1"/></svg>'
  };

  function typeChip(type) {
    if (type === '判断题') return '<span class="chip chip-judge">判断题</span>';
    if (type === '多选题') return '<span class="chip chip-multi">多选题</span>';
    return '<span class="chip chip-single">单选题</span>';
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastRoot.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'all .2s ease';
      setTimeout(() => el.remove(), 220);
    }, 2100);
  }

  function updateNav() {
    const n = wrongCount();
    navWrong.textContent = n;
    navWrong.hidden = n === 0;
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === currentView);
    });
    footerMeta.textContent = `共 ${META.total} 题 · ${META.figures} 张配图`;
  }

  function openOverlay(html, onClose) {
    modalRoot.innerHTML = html;
    const overlay = modalRoot.querySelector('.overlay');
    const close = () => {
      modalRoot.innerHTML = '';
      document.removeEventListener('keydown', escClose);
      if (onClose) onClose();
    };
    const escClose = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escClose);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    return close;
  }

  function openLightbox(src) {
    openOverlay(`
      <div class="overlay">
        <button class="lightbox-close" data-close aria-label="关闭">${icon.close}</button>
        <img class="lightbox-img" src="${esc(src)}" alt="题目配图">
      </div>
    `);
  }

  function confirmModal(title, text, confirmLabel, onConfirm, danger) {
    const close = openOverlay(`
      <div class="overlay">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${esc(title)}</h3>
          <p>${esc(text)}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost btn-sm" data-close>取消</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" id="modalConfirm">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `);
    document.getElementById('modalConfirm').addEventListener('click', () => {
      close();
      onConfirm();
    });
  }

  /* ---------------- home ---------------- */

  function renderHome() {
    currentView = 'home';
    current = null;
    session = null;
    updateNav();
    const total = META.total;
    const done = answeredCount();
    const pct = Math.round((done / total) * 100);
    const acc = accuracy();
    const wrong = wrongCount();
    const unseen = total - done;
    let contMode = state.last.mode || 'sequence';
    if (contMode === 'wrong' && !wrong) contMode = 'sequence';
    if (contMode === 'unseen' && !unseen) contMode = 'sequence';
    const lastIndex = state.positions[contMode] || 0;
    const atEnd = (contMode === 'sequence' || contMode === 'random') && lastIndex >= total;
    const continueLabel = atEnd ? '再刷一轮' : (lastIndex > 0 || done > 0 ? '继续练习' : '开始顺序练习');
    const continueSub = atEnd
      ? '题库已刷完一轮，从头再来'
      : (lastIndex > 0 ? `第 ${Math.min(lastIndex + 1, total)} 题 · ${modeName(contMode)}` : '从第一题开始');

    view.innerHTML = `
      <section class="hero">
        <div>
          <p class="eyebrow">科目一 · 精简题库</p>
          <h1>刷完这 ${total} 题，<br><em>科一稳过。</em></h1>
          <p class="hero-sub">每道题选完立即出解析和记忆口诀，答错的题自动收进错题集。不用注册，进度只存在你自己的浏览器里。</p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" id="continueBtn">
              ${continueLabel} ${icon.arrowRight}
            </button>
            <button class="btn btn-ghost btn-lg" id="randomBtn">随机来一组</button>
          </div>
        </div>
        <aside class="progress-card" aria-label="学习进度">
          <div class="ring" style="--p:${pct}">
            <div class="ring-inner"><strong>${pct}%</strong><span>已练习</span></div>
          </div>
          <div class="mini-stats">
            <div class="mini-stat"><strong>${done}<small style="font-size:11px;color:var(--faint);font-weight:500"> / ${total}</small></strong><span>已练题数</span></div>
            <div class="mini-stat"><strong>${done ? acc + '%' : '—'}</strong><span>正确率</span></div>
            <div class="mini-stat"><strong style="${wrong ? 'color:var(--red)' : ''}">${wrong}</strong><span>待攻克错题</span></div>
          </div>
        </aside>
      </section>

      <div class="section-head">
        <h2>选择练习方式</h2>
        <p>${continueSub}</p>
      </div>

      <section class="mode-grid">
        <button class="mode-card" id="modeSequence">
          <span class="mode-icon">${icon.list}</span>
          <span class="mode-body">
            <span class="mode-title">顺序练习</span>
            <span class="mode-desc">按题库顺序刷，接着上次的位置继续。</span>
          </span>
          <span class="mode-count">${state.positions.sequence >= total ? '已完成' : (state.positions.sequence > 0 ? '第 ' + Math.min(state.positions.sequence + 1, total) + ' 题' : total + ' 题')}</span>
        </button>

        <button class="mode-card" id="modeRandom">
          <span class="mode-icon green">${icon.shuffle}</span>
          <span class="mode-body">
            <span class="mode-title">随机练习</span>
            <span class="mode-desc">打乱顺序，查漏补缺；每次点都重新洗牌。</span>
          </span>
          <span class="mode-count">${total} 题</span>
        </button>

        <button class="mode-card" id="modeWrong" ${wrong ? '' : 'disabled'}>
          <span class="mode-icon amber">${icon.bookmark}</span>
          <span class="mode-body">
            <span class="mode-title">错题重练</span>
            <span class="mode-desc">${wrong ? '只看错题，答对自动移出错题集。' : '还没有错题，继续保持。'}</span>
          </span>
          <span class="mode-count">${wrong} 道</span>
        </button>

        <button class="mode-card" id="modeUnseen" ${unseen ? '' : 'disabled'}>
          <span class="mode-icon gray">${icon.circle}</span>
          <span class="mode-body">
            <span class="mode-title">只做未做</span>
            <span class="mode-desc">${unseen ? '跳过已经做过的题，专门清空剩余题目。' : '全部题目都做过了。'}</span>
          </span>
          <span class="mode-count">${unseen} 题</span>
        </button>
      </section>

      <div class="home-note">
        ${icon.info}
        <span>答错会自动加入错题集；在「错题重练」里答对会自动移出。单选题按 A–D 键作答，回车进入下一题。</span>
      </div>
    `;

    document.getElementById('continueBtn').addEventListener('click', () => {
      startMode(contMode, { resume: true });
    });
    document.getElementById('randomBtn').addEventListener('click', () => startMode('random'));
    document.getElementById('modeSequence').addEventListener('click', () => startMode('sequence', { resume: true }));
    document.getElementById('modeRandom').addEventListener('click', () => startMode('random'));
    document.getElementById('modeWrong').addEventListener('click', () => { if (wrong) startMode('wrong'); });
    document.getElementById('modeUnseen').addEventListener('click', () => { if (unseen) startMode('unseen'); });
  }

  function modeName(mode) {
    return { sequence: '顺序练习', random: '随机练习', wrong: '错题重练', unseen: '只做未做' }[mode] || '顺序练习';
  }

  /* ---------------- practice ---------------- */

  function ensureSession() {
    if (!session) resumeSession();
    if (!session) return false;
    if (session.mode !== state.last.mode) return false;
    return true;
  }

  function renderPractice(opts = {}) {
    currentView = 'practice';
    if (!ensureSession()) {
      startMode('sequence');
      return;
    }
    updateNav();

    if (!session.order.length) {
      renderNoQuestions();
      return;
    }

    if (session.index >= session.order.length) {
      renderCompletion();
      return;
    }

    const q = BY_ID.get(session.order[session.index]);
    if (!q) {
      session.index = 0;
      renderPractice();
      return;
    }

    const saved = state.answered[q.id];
    const retrying = session.retryId === q.id;
    const showSaved = !!saved && !retrying && !(session.mode === 'wrong' && !session.answeredIds.has(q.id));
    current = { q, showSaved };

    const progress = Math.round(((session.index + 1) / session.order.length) * 100);
    const answerIdx = q.answerIndex;

    const optionsHtml = q.options.map((opt, i) => {
      const classes = ['option'];
      let mark = '';
      if (showSaved) {
        if (i === answerIdx) { classes.push('is-correct'); mark = icon.check; }
        else if (i === saved.selected) { classes.push('is-wrong'); mark = icon.x; }
        else { classes.push('is-dim'); }
      }
      return `
        <button class="${classes.join(' ')}" data-opt="${i}" ${showSaved ? 'disabled' : ''} aria-label="选项 ${LETTERS[i]}：${esc(opt)}">
          <span class="opt-letter">${LETTERS[i]}</span>
          <span class="opt-text">${esc(opt)}</span>
          <span class="opt-mark">${mark}</span>
        </button>`;
    }).join('');

    const figHtml = q.figure ? `
      <div class="figure-wrap">
        <button class="figure-btn" id="figureBtn" aria-label="查看大图">
          <img src="${esc(q.figure)}" alt="题目配图" loading="lazy">
        </button>
      </div>` : '';

    view.innerHTML = `
      <div class="practice-shell">
        <div class="practice-head">
          <button class="icon-btn" id="backBtn" aria-label="返回首页">${icon.arrowLeft}</button>
          <div class="practice-progress">
            <div class="progress-track" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="practice-meta">
              <span>${modeName(session.mode)}</span>
              <span class="practice-count">${session.index + 1} / ${session.order.length}</span>
            </div>
          </div>
        </div>

        <article class="qcard">
          <div class="qmeta">
            ${typeChip(q.type)}
            <span class="chip chip-cat">${esc(q.category)}</span>
            <span class="q-index">题库第 ${q.id} 题</span>
          </div>

          <h2 class="stem">${esc(q.stem)}</h2>

          ${figHtml}

          <div class="options" role="group" aria-label="选项">${optionsHtml}</div>

          <div id="feedback" class="feedback" aria-live="polite">${showSaved ? feedbackHtml(q, saved) : ''}</div>
        </article>

        <div class="practice-actions">
          <button class="btn btn-ghost" id="prevBtn" ${session.index === 0 ? 'disabled' : ''}>上一题</button>
          <span class="practice-hint">A–D 选择 · ← → 切换 · 回车下一题</span>
          <button class="btn btn-primary" id="nextBtn">${session.index + 1 >= session.order.length ? '完成本轮' : '下一题'} ${icon.arrowRight}</button>
        </div>
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => { location.hash = '#/'; });
    document.getElementById('prevBtn').addEventListener('click', () => go(-1));
    document.getElementById('nextBtn').addEventListener('click', () => go(1));
    if (q.figure) {
      document.getElementById('figureBtn').addEventListener('click', () => openLightbox(q.figure));
    }
    view.querySelectorAll('[data-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!showSaved) answer(q, Number(btn.dataset.opt));
      });
    });
    const retry = document.getElementById('retryBtn');
    if (retry) {
      retry.addEventListener('click', () => {
        session.retryId = q.id;
        renderPractice();
      });
    }

    if (opts.scrollToFeedback) {
      const fb = document.getElementById('feedback');
      if (fb) setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    } else if (opts.keepScroll !== true) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function feedbackHtml(q, saved) {
    if (!saved) return '';
    const correct = saved.correct;
    const ans = q.answerIndex;
    const selected = saved.selected;
    const ansLabel = `${LETTERS[ans]} · ${q.options[ans] || ''}`;
    const selLabel = `${LETTERS[selected] || '?'} · ${q.options[selected] || ''}`;
    const removed = correct && session && session.removedIds && session.removedIds.has(q.id);
    const sub = correct
      ? `正确答案：<strong>${esc(ansLabel)}</strong>${removed ? ' · 已移出错题集' : ''}`
      : `你选了 ${esc(selLabel)}，正确答案是 <strong>${esc(ansLabel)}</strong> · 已加入错题集`;
    const tip = q.tip ? `
      <div class="note note-tip">
        <div class="note-label">${icon.bookmark} 记忆口诀</div>
        <p>${esc(q.tip)}</p>
      </div>` : '';
    const analysis = q.analysis ? `
      <div class="note">
        <div class="note-label">${icon.info} 解析</div>
        <p>${esc(q.analysis)}</p>
      </div>` : '';
    const empty = !q.tip && !q.analysis ? `
      <div class="note"><div class="note-label">${icon.info} 解析</div><p>本题暂无解析，记住正确答案即可。</p></div>` : '';

    return `
      <div class="result-banner ${correct ? 'correct' : 'wrong'}">
        <span class="result-icon">${correct ? icon.check : icon.x}</span>
        <div class="result-body">
          <div class="result-title">${correct ? '回答正确' : '回答错误'}</div>
          <div class="result-sub">${sub}</div>
        </div>
        ${session && session.mode !== 'wrong' ? '<button class="link-btn result-actions" id="retryBtn">重做</button>' : ''}
      </div>
      ${tip}
      ${analysis}
      ${empty}
    `;
  }

  function answer(q, idx) {
    const correct = idx === q.answerIndex;
    const prevWrong = !!state.wrong[q.id];
    state.answered[q.id] = { selected: idx, correct, ts: Date.now() };
    if (!correct) {
      const w = state.wrong[q.id];
      state.wrong[q.id] = { count: (w ? w.count : 0) + 1, ts: Date.now() };
    } else if (prevWrong) {
      delete state.wrong[q.id];
      if (session.removedIds) session.removedIds.add(q.id);
      toast('答对了，已移出错题集');
    }
    session.answeredIds.add(q.id);
    session.answeredThisRound += 1;
    if (correct) session.correctThisRound += 1;
    session.retryId = null;
    save();
    renderPractice({ scrollToFeedback: true });
  }

  function go(delta) {
    if (!session) return;
    session.retryId = null;
    const next = session.index + delta;
    if (next < 0) return;
    session.index = next;
    state.positions[session.mode] = Math.min(next, session.order.length);
    state.last = { mode: session.mode, index: Math.min(next, session.order.length) };
    save();
    renderPractice();
  }

  function renderNoQuestions() {
    const isWrong = session.mode === 'wrong';
    view.innerHTML = `
      <div class="practice-shell">
        <div class="practice-head">
          <button class="icon-btn" id="backBtn" aria-label="返回首页">${icon.arrowLeft}</button>
          <div class="practice-progress"><div class="progress-track"><div class="progress-fill" style="width:100%"></div></div></div>
        </div>
        <div class="empty-state">
          <div class="empty-icon">${icon.check}</div>
          <h2>${isWrong ? '错题集已经清空' : '没有待做的题了'}</h2>
          <p>${isWrong ? '所有错题都已经答对并移出错题集，保持这个状态。' : '这个练习方式下暂时没有题目，换一种方式继续。'}</p>
          <button class="btn btn-primary" id="backHome">回到首页</button>
        </div>
      </div>`;
    document.getElementById('backBtn').addEventListener('click', () => { location.hash = '#/'; });
    document.getElementById('backHome').addEventListener('click', () => { location.hash = '#/'; });
  }

  function renderCompletion() {
    const total = session.order.length;
    const answered = session.answeredThisRound;
    const correct = session.correctThisRound;
    const acc = answered ? Math.round((correct / answered) * 100) : 0;
    const isWrong = session.mode === 'wrong';
    const remainingWrong = wrongCount();
    view.innerHTML = `
      <div class="practice-shell">
        <div class="done-card">
          <div class="done-icon">${icon.trophy}</div>
          <h2>${isWrong && remainingWrong === 0 ? '错题全部攻克' : '这一轮完成了'}</h2>
          <p>${isWrong
            ? (remainingWrong === 0 ? '错题集已清空，可以回到首页开始新一轮练习。' : `还有 ${remainingWrong} 道错题没有掌握，可以再练一轮。`)
            : `本轮共 ${total} 题，已全部走完。${answered ? '继续保持，考试时也是这个节奏。' : ''}`}</p>
          <div class="done-stats">
            <div><strong>${answered}</strong><span>本轮作答</span></div>
            <div><strong style="color:var(--green)">${correct}</strong><span>答对</span></div>
            <div><strong>${acc}%</strong><span>正确率</span></div>
          </div>
          <div class="done-actions">
            <button class="btn btn-ghost" id="doneHome">回到首页</button>
            ${remainingWrong ? '<button class="btn btn-ghost" id="doneWrong">重练错题</button>' : ''}
            ${isWrong && remainingWrong === 0 ? '' : '<button class="btn btn-primary" id="doneAgain">再刷一轮</button>'}
          </div>
        </div>
      </div>`;
    document.getElementById('doneHome').addEventListener('click', () => { location.hash = '#/'; });
    const dw = document.getElementById('doneWrong');
    if (dw) dw.addEventListener('click', () => startMode('wrong'));
    const again = document.getElementById('doneAgain');
    if (again) again.addEventListener('click', () => {
      if (session.mode === 'random') startMode('random');
      else if (session.mode === 'wrong') startMode('wrong');
      else if (session.mode === 'unseen') startMode('unseen');
      else startMode('sequence');
    });
  }

  /* ---------------- wrong book ---------------- */

  function renderWrongBook() {
    currentView = 'wrong';
    current = null;
    updateNav();
    const ids = Object.keys(state.wrong)
      .map(Number)
      .filter((id) => BY_ID.has(id))
      .sort((a, b) => (state.wrong[b].ts || 0) - (state.wrong[a].ts || 0));
    const items = ids.map((id) => {
      const q = BY_ID.get(id);
      const w = state.wrong[id];
      const ans = q.answerIndex >= 0 ? `${q.answerLetter} · ${q.options[q.answerIndex] || ''}` : q.answerLetter;
      return `
        <div class="wrong-item" data-id="${id}">
          <div class="wrong-main" role="button" tabindex="0" data-open="${id}">
            <div class="wrong-top">
              ${typeChip(q.type)}
              <span class="chip chip-cat">${esc(q.category)}</span>
              <span class="wrong-times">错 ${w.count || 1} 次</span>
            </div>
            <p class="wrong-stem">${esc(q.stem)}</p>
            <p class="wrong-answer">正确答案：<strong>${esc(ans)}</strong></p>
          </div>
          <div class="wrong-side">
            <button class="btn btn-ghost btn-sm" data-open="${id}">重做</button>
          </div>
        </div>`;
    }).join('');

    view.innerHTML = `
      <div class="wrong-shell">
        <div class="page-head">
          <div>
            <h1>错题集</h1>
            <p>${ids.length ? `共 ${ids.length} 道题，答对后自动移出。` : '做错的题会自动出现在这里。'}</p>
          </div>
          ${ids.length ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="redoAll">全部重做</button>
            <button class="btn btn-danger btn-sm" id="clearWrong">清空</button>
          </div>` : ''}
        </div>
        ${ids.length ? `<div class="wrong-list">${items}</div>` : `
          <div class="empty-state">
            <div class="empty-icon">${icon.check}</div>
            <h2>还没有错题</h2>
            <p>做题时选错的题目会自动收进这里。在错题重练中答对，就会自动移出。</p>
            <button class="btn btn-primary" id="goPractice">去练习</button>
          </div>`}
      </div>`;

    view.querySelectorAll('[data-open]').forEach((el) => {
      const open = () => startMode('wrong', { focusId: Number(el.dataset.open) });
      el.addEventListener('click', (e) => { e.stopPropagation(); open(); });
      if (el.getAttribute('role') === 'button') {
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      }
    });
    const redoAll = document.getElementById('redoAll');
    if (redoAll) redoAll.addEventListener('click', () => startMode('wrong'));
    const clear = document.getElementById('clearWrong');
    if (clear) clear.addEventListener('click', () => {
      confirmModal('清空错题集？', `将移除全部 ${ids.length} 道错题记录，做题进度和正确率不受影响。`, '清空', () => {
        state.wrong = {};
        save();
        toast('错题集已清空');
        renderWrongBook();
      }, true);
    });
    const gp = document.getElementById('goPractice');
    if (gp) gp.addEventListener('click', () => { location.hash = '#/'; });
  }

  /* ---------------- router ---------------- */

  function parseHash() {
    const h = (location.hash || '#/').replace(/^#\/?/, '');
    if (h.startsWith('practice')) return 'practice';
    if (h.startsWith('wrong')) return 'wrong';
    return 'home';
  }

  function render() {
    const route = parseHash();
    if (route === 'practice') renderPractice();
    else if (route === 'wrong') renderWrongBook();
    else renderHome();
    updateNav();
  }

  /* ---------------- keyboard ---------------- */

  document.addEventListener('keydown', (e) => {
    if (modalRoot.innerHTML.trim()) return;
    if (currentView !== 'practice' || !current) return;
    const q = current.q;
    if (!q || current.showSaved) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      return;
    }
    const key = e.key.toUpperCase();
    const letterIdx = LETTERS.indexOf(key);
    const numIdx = /^[1-6]$/.test(key) ? Number(key) - 1 : -1;
    const idx = letterIdx >= 0 ? letterIdx : numIdx;
    if (idx >= 0 && idx < q.options.length) {
      e.preventDefault();
      answer(q, idx);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  window.addEventListener('hashchange', render);
  render();
})();
