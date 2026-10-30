(() => {
  'use strict';

  const app = document.getElementById('app');
  const navEl = document.getElementById('nav-links');
  const flashEl = document.getElementById('flash');
  const S = { user: null, unread: 0, cfg: { categories: [], locations: [], demo: false } };
  let cleanup = null;
  let pending = null;

  // ---------- helpers ----------
  const $ = (sel, root = app) => root.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const fmtShort = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const ago = (v) => {
    const mins = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const h = Math.floor(mins / 60);
    return h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
  };
  const obj = (fd) => Object.fromEntries(fd);
  const badge = (t) => `<span class="badge rounded-pill type-badge type-${t}">${t === 'lost' ? 'Lost' : 'Found'}</span>`;
  const icon = (n) => `<i class="bi bi-${n}"></i>`;

  async function api(path, { method = 'GET', body, form } = {}) {
    const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (form) opts.body = form;
    else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch('/api' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON body */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Try again.');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function flash(type, message) { pending = { type, message }; }
  function showFlash() {
    flashEl.innerHTML = pending
      ? `<div class="container pt-4"><div class="alert alert-${pending.type === 'ok' ? 'success' : 'danger'} alert-dismissible fade show mb-0" role="status">${esc(pending.message)}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div></div>`
      : '';
    pending = null;
  }

  function go(path) {
    if (location.hash === '#' + path) route();
    else location.hash = path;
  }

  function need(admin) {
    if (!S.user) { const e = new Error('Please log in first.'); e.status = 401; throw e; }
    if (admin && S.user.role !== 'admin') { const e = new Error('Admins only.'); e.status = 403; throw e; }
  }

  const errBox = '<div class="alert alert-danger d-none" data-error role="alert"></div>';

  function submit(form, fn) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const box = form.querySelector('[data-error]');
      box.classList.add('d-none');
      btn.disabled = true;
      try { await fn(new FormData(form), form); }
      catch (err) { box.textContent = err.message; box.classList.remove('d-none'); }
      finally { btn.disabled = false; }
    });
  }

  const options = (list, selected, placeholder) =>
    (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') +
    list.map((v) => `<option${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');

  // ---------- shell ----------
  async function refreshMe() {
    try {
      const d = await api('/me');
      S.user = d.user; S.unread = d.unread; S.cfg = d.config;
    } catch (e) { /* keep last known state */ }
  }

  function renderNav(path) {
    const item = (href, label, extra = '') =>
      `<li class="nav-item"><a class="nav-link${path === href ? ' active' : ''}" href="#${href}">${label}${extra}</a></li>`;
    let h = item('/', 'Browse');
    if (S.user) {
      const first = esc((S.user.full_name || S.user.email).split(' ')[0]);
      h += item('/messages', 'Messages', S.unread ? ` <span class="badge rounded-pill text-bg-warning">${S.unread}</span>` : '');
      h += `<li class="nav-item ms-lg-2 my-2 my-lg-0"><a class="btn btn-gold btn-sm" href="#/post/new">${icon('plus-lg')} Post an item</a></li>`;
      h += `<li class="nav-item dropdown">
        <button class="nav-link btn dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">${icon('person-circle')} ${first}</button>
        <ul class="dropdown-menu dropdown-menu-end shadow">
          <li><h6 class="dropdown-header">${esc(S.user.email)}</h6></li>
          <li><a class="dropdown-item" href="#/my-posts">${icon('collection')} My posts</a></li>
          ${S.user.role === 'admin' ? `<li><a class="dropdown-item" href="#/admin">${icon('speedometer2')} Admin dashboard</a></li>` : ''}
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" type="button" data-logout>${icon('box-arrow-right')} Log out</button></li>
        </ul></li>`;
    } else {
      h += item('/login', 'Log in');
      h += `<li class="nav-item ms-lg-2 my-2 my-lg-0"><a class="btn btn-gold btn-sm" href="#/signup">Sign up</a></li>`;
    }
    navEl.innerHTML = h;
  }

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-logout]')) {
      await api('/logout', { method: 'POST' }).catch(() => {});
      S.user = null; S.unread = 0;
      go('/');
    }
  });

  // Fullscreen toggle. Browsers require the click itself, so no state is stored.
  const fsBtn = document.querySelector('[data-fullscreen]');
  const fsLabel = fsBtn.querySelector('[data-fullscreen-label]');
  const fsSync = () => {
    const on = Boolean(document.fullscreenElement);
    fsBtn.setAttribute('aria-pressed', String(on));
    fsLabel.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
  };
  fsBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) { fsLabel.textContent = 'Fullscreen blocked'; }
  });
  document.addEventListener('fullscreenchange', fsSync);

  // ---------- reusable pieces ----------
  function card(p) {
    return `<div class="col"><a class="post-card d-flex flex-column h-100 text-decoration-none" href="#/post/${p.id}">
      <div class="position-relative">
        <div class="ratio ratio-4x3 post-media">${p.image
          ? `<img src="/uploads/${esc(p.image)}" alt="${esc(p.item_name)}" loading="lazy">`
          : '<div class="no-photo">No photo</div>'}</div>
        <span class="position-absolute top-0 start-0 m-3">${badge(p.type)}</span>
      </div>
      <div class="p-4">
        <h3 class="h5 mb-3">${esc(p.item_name)}</h3>
        <p class="mb-1 small text-secondary">${icon('geo-alt')} ${esc(p.location)}</p>
        <p class="mb-1 small text-secondary">${icon('clock')} ${fmtShort(p.occurred_at)}</p>
        <p class="mb-0 small text-secondary">${icon('person')} ${esc(p.full_name || 'A student')}</p>
        ${p.status === 'resolved' ? `<p class="mb-0 mt-3 small fw-bold text-success">${icon('check-circle-fill')} Returned</p>` : ''}
      </div></a></div>`;
  }

  const grid = (posts, empty) => posts.length
    ? `<div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4">${posts.map(card).join('')}</div>`
    : `<div class="surface text-center p-5"><p class="mb-0 text-secondary">${empty}</p></div>`;

  const pageHead = (title, sub, action = '') => `<div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-5">
    <div><h1 class="h2 mb-2">${title}</h1>${sub ? `<p class="text-secondary mb-0">${sub}</p>` : ''}</div>${action}</div>`;

  const authSide = (title, steps) => `<div class="col-lg-6 d-none d-lg-block pe-lg-5">
    <h2 class="h3 mb-4">${title}</h2>
    <ol class="text-secondary ps-3 mb-0">${steps.map((s) => `<li class="mb-3">${s}</li>`).join('')}</ol></div>`;

  // ---------- views ----------
  async function home({ q }) {
    const f = { type: q.get('type') || 'all', status: q.get('status') || 'open', category: q.get('category') || '', location: q.get('location') || '', q: q.get('q') || '' };
    const d = await api('/posts?' + new URLSearchParams(f));
    app.innerHTML = `
      <section class="hero rounded-4 p-4 p-md-5 section-gap">
        <div class="row"><div class="col-lg-8">
          <h1 class="mb-3">Lost something on campus? Found something?</h1>
          <p class="lead mb-4">Browse items reported around Bicol University, or post your own so the owner can find it.</p>
          <a class="btn btn-gold btn-lg" href="#/post/new">${icon('plus-lg')} Post an item</a>
        </div></div>
      </section>

      <form class="surface p-4 p-md-4 section-gap" role="search">
        <div class="row g-4 align-items-end">
          <div class="col-lg-5">
            <label class="form-label" for="f-q">Search</label>
            <div class="input-group">
              <span class="input-group-text bg-white">${icon('search')}</span>
              <input class="form-control" id="f-q" type="search" name="q" placeholder="Umbrella, wallet, keys…" value="${esc(f.q)}">
              <button class="btn btn-primary" type="submit">Search</button>
            </div>
          </div>
          <div class="col-md-6 col-lg-3"><label class="form-label" for="f-c">Category</label>
            <select class="form-select" id="f-c" name="category">${options(S.cfg.categories, f.category, 'All categories')}</select></div>
          <div class="col-md-6 col-lg-4"><label class="form-label" for="f-l">Location</label>
            <select class="form-select" id="f-l" name="location">${options(S.cfg.locations, f.location, 'All locations')}</select></div>
          <div class="col-12 d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div class="btn-group" role="group" aria-label="Item type">
              ${['all', 'lost', 'found'].map((t) => `<input type="radio" class="btn-check" name="type" id="t-${t}" value="${t}"${f.type === t ? ' checked' : ''}>
                <label class="btn btn-outline-primary" for="t-${t}">${t === 'all' ? 'All items' : t[0].toUpperCase() + t.slice(1)}</label>`).join('')}
            </div>
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" role="switch" id="f-s" name="status" value="all"${f.status === 'all' ? ' checked' : ''}>
              <label class="form-check-label" for="f-s">Show returned items</label>
            </div>
          </div>
        </div>
      </form>

      <div class="d-flex justify-content-between align-items-baseline mb-4">
        <h2 class="h4 mb-0">Latest reports</h2><span class="text-secondary small">${d.posts.length} item${d.posts.length === 1 ? '' : 's'}</span>
      </div>
      ${grid(d.posts, 'No items match those filters. Try clearing the search.')}`;
    const form = $('form');
    const apply = () => {
      const p = new URLSearchParams();
      for (const [k, v] of new FormData(form)) if (v && !(k === 'type' && v === 'all')) p.set(k, v);
      go('/' + (p.toString() ? '?' + p : ''));
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
    form.addEventListener('change', apply);
  }

  const demoBox = () => `<div class="border-top mt-4 pt-4 small text-secondary">
    <p class="fw-bold mb-2">Demo accounts (development only)</p>
    <p class="mb-1">Student: <code>juanred.delacruz24@bicol-u.edu.ph</code> / <code>Password123</code></p>
    <p class="mb-1">Admin: <code>admin@bicol-u.edu.ph</code> / <code>Password123</code>, or your <code>ADMIN_PASSWORD</code></p>
    <p class="mb-0">New sign-up codes appear in the <a href="#/outbox">dev outbox</a>.</p></div>`;

  async function loginView({ q }) {
    if (S.user) return go('/');
    const next = q.get('next') || '';
    app.innerHTML = `<div class="row justify-content-center align-items-center g-5">
      ${authSide('Why log in?', ['Post lost or found items with a photo.', 'Message the person who posted an item.', 'Mark an item as returned once it is back with its owner.'])}
      <div class="col-md-9 col-lg-6 col-xl-5"><div class="surface p-4 p-md-5">
        <h1 class="h2 mb-2">Log in</h1><p class="text-secondary mb-4">Use your Bicol University email.</p>
        <form novalidate>${errBox}
          <div class="mb-4"><label class="form-label" for="email">BU email</label>
            <input class="form-control" id="email" type="email" name="email" autocomplete="username" required placeholder="firstname.lastname24@bicol-u.edu.ph"></div>
          <div class="mb-4"><label class="form-label" for="pw">Password</label>
            <input class="form-control" id="pw" type="password" name="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary w-100 btn-lg" type="submit">Log in</button>
        </form>
        <p class="small text-center mt-4 mb-0"><a href="#/forgot">Forgot your password?</a> · <a href="#/signup">Create an account</a></p>
        ${S.cfg.demo ? demoBox() : ''}
      </div></div></div>`;
    submit($('form'), async (fd) => {
      try {
        const r = await api('/login', { method: 'POST', body: obj(fd) });
        S.user = r.user;
        flash('ok', 'Welcome back, ' + (r.user.full_name || r.user.email) + '.');
        go(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      } catch (err) {
        if (err.data && err.data.needsVerify) { flash('err', err.message); return go('/verify?email=' + encodeURIComponent(err.data.email)); }
        throw err;
      }
    });
  }

  async function signupView() {
    if (S.user) return go('/');
    app.innerHTML = `<div class="row justify-content-center align-items-center g-5">
      ${authSide('How it works', ['Enter your BU email and Student ID.', 'Check your inbox for a 6-digit code.', 'Enter the code and you are in.'])}
      <div class="col-md-9 col-lg-6 col-xl-5"><div class="surface p-4 p-md-5">
        <h1 class="h2 mb-2">Create an account</h1><p class="text-secondary mb-4">Only enrolled BU students can sign up.</p>
        <form novalidate>${errBox}
          <div class="mb-4"><label class="form-label" for="email">BU email</label>
            <input class="form-control" id="email" type="email" name="email" autocomplete="username" required placeholder="firstname.lastname24@bicol-u.edu.ph"></div>
          <div class="mb-4"><label class="form-label" for="sid">Student ID</label>
            <input class="form-control" id="sid" name="student_id" required placeholder="2024-00101"></div>
          <div class="mb-4"><label class="form-label" for="pw">Password</label>
            <input class="form-control" id="pw" type="password" name="password" autocomplete="new-password" required minlength="8">
            <div class="form-text">At least 8 characters.</div></div>
          <div class="mb-4"><label class="form-label" for="pw2">Confirm password</label>
            <input class="form-control" id="pw2" type="password" name="confirm_password" autocomplete="new-password" required></div>
          <button class="btn btn-primary w-100 btn-lg" type="submit">Send verification code</button>
        </form>
        <p class="small text-center mt-4 mb-0">Already have an account? <a href="#/login">Log in</a></p>
      </div></div></div>`;
    submit($('form'), async (fd) => {
      const r = await api('/signup', { method: 'POST', body: obj(fd) });
      flash('ok', 'We sent a 6-digit code to ' + r.email + '.');
      go('/verify?email=' + encodeURIComponent(r.email));
    });
  }

  const narrow = (inner) => `<div class="row justify-content-center"><div class="col-md-8 col-lg-6 col-xl-5"><div class="surface p-4 p-md-5">${inner}</div></div></div>`;

  async function verifyView({ q }) {
    const email = (q.get('email') || '').toLowerCase();
    if (!email) return go('/signup');
    app.innerHTML = narrow(`<h1 class="h2 mb-2">Verify your email</h1>
      <p class="text-secondary mb-4">Enter the 6-digit code sent to <strong>${esc(email)}</strong>. It expires in 15 minutes.</p>
      <form novalidate>${errBox}
        <div class="mb-4"><label class="form-label" for="code">Verification code</label>
          <input class="form-control form-control-lg text-center" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
        <button class="btn btn-primary w-100 btn-lg" type="submit">Verify and log in</button>
      </form>
      <p class="text-center mt-4 mb-0"><button class="btn btn-link p-0" type="button" data-resend>Send a new code</button></p>
      ${S.cfg.demo ? '<p class="small text-secondary text-center mt-3 mb-0">No SMTP yet? Read the code in the <a href="#/outbox">dev outbox</a>.</p>' : ''}`);
    submit($('form'), async (fd) => {
      const r = await api('/verify', { method: 'POST', body: { email, code: fd.get('code') } });
      S.user = r.user;
      flash('ok', 'Email verified. Welcome, ' + (r.user.full_name || r.user.email) + '!');
      go('/');
    });
    $('[data-resend]').addEventListener('click', async () => {
      await api('/verify/resend', { method: 'POST', body: { email } }).catch(() => {});
      flash('ok', 'If that account is waiting for verification, a new code is on the way.');
      showFlash();
    });
  }

  async function forgotView() {
    app.innerHTML = narrow(`<h1 class="h2 mb-2">Forgot your password?</h1>
      <p class="text-secondary mb-4">Enter your BU email and we will send a reset code.</p>
      <form novalidate>${errBox}
        <div class="mb-4"><label class="form-label" for="email">BU email</label>
          <input class="form-control" id="email" type="email" name="email" required autocomplete="username"></div>
        <button class="btn btn-primary w-100 btn-lg" type="submit">Send reset code</button>
      </form>`);
    submit($('form'), async (fd) => {
      const r = await api('/forgot', { method: 'POST', body: obj(fd) });
      flash('ok', 'If that account exists, a reset code is on the way.');
      go('/reset?email=' + encodeURIComponent(r.email));
    });
  }

  async function resetView({ q }) {
    app.innerHTML = narrow(`<h1 class="h2 mb-4">Reset password</h1>
      <form novalidate>${errBox}
        <div class="mb-4"><label class="form-label" for="email">BU email</label>
          <input class="form-control" id="email" type="email" name="email" value="${esc(q.get('email') || '')}" required autocomplete="username"></div>
        <div class="mb-4"><label class="form-label" for="code">Code</label>
          <input class="form-control" id="code" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div>
        <div class="mb-4"><label class="form-label" for="pw">New password</label>
          <input class="form-control" id="pw" type="password" name="password" required minlength="8" autocomplete="new-password"></div>
        <div class="mb-4"><label class="form-label" for="pw2">Confirm new password</label>
          <input class="form-control" id="pw2" type="password" name="confirm_password" required autocomplete="new-password"></div>
        <button class="btn btn-primary w-100 btn-lg" type="submit">Save new password</button>
      </form>
      ${S.cfg.demo ? '<p class="small text-secondary text-center mt-4 mb-0">Read the code in the <a href="#/outbox">dev outbox</a>.</p>' : ''}`);
    submit($('form'), async (fd) => {
      await api('/reset', { method: 'POST', body: obj(fd) });
      flash('ok', 'Password updated. You can log in now.');
      go('/login');
    });
  }

  async function postNew() {
    need();
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    app.innerHTML = `<div class="row justify-content-center"><div class="col-lg-8 col-xl-7">
      ${pageHead('Post an item', 'Describe what you lost or found. The admin is notified automatically.')}
      <form class="surface p-4 p-md-5" novalidate>${errBox}
        <div class="btn-group w-100 mb-4" role="group" aria-label="Post type">
          <input type="radio" class="btn-check" name="type" id="p-lost" value="lost" checked><label class="btn btn-outline-primary py-3" for="p-lost">I lost something</label>
          <input type="radio" class="btn-check" name="type" id="p-found" value="found"><label class="btn btn-outline-primary py-3" for="p-found">I found something</label>
        </div>
        <div class="mb-4"><label class="form-label" for="n">Item name</label>
          <input class="form-control" id="n" name="item_name" maxlength="120" required placeholder="Black umbrella"></div>
        <div class="row g-4 mb-4">
          <div class="col-md-6"><label class="form-label" for="c">Category</label>
            <select class="form-select" id="c" name="category" required>${options(S.cfg.categories, '', 'Choose a category')}</select></div>
          <div class="col-md-6"><label class="form-label" for="l">Campus location</label>
            <select class="form-select" id="l" name="location" required>${options(S.cfg.locations, '', 'Choose a location')}</select></div>
        </div>
        <div class="mb-4"><label class="form-label" for="w">When did it happen?</label>
          <input class="form-control" id="w" type="datetime-local" name="occurred_at" value="${now}" max="${now}" required></div>
        <div class="mb-4"><label class="form-label" for="d">Description</label>
          <textarea class="form-control" id="d" name="description" rows="5" maxlength="2000" required placeholder="Color, brand, marks, what was inside…"></textarea></div>
        <div class="mb-4"><label class="form-label" for="ph">Photo <span class="text-secondary fw-normal">(optional · JPG, PNG or WEBP, up to 5 MB)</span></label>
          <input class="form-control" id="ph" type="file" name="photo" accept="image/jpeg,image/png,image/webp">
          <div class="preview d-none mt-3"></div></div>
        <button class="btn btn-primary btn-lg w-100" type="submit">Post item</button>
      </form></div></div>`;
    const file = $('input[type="file"]');
    const preview = $('.preview');
    let url = null;
    file.addEventListener('change', () => {
      if (url) URL.revokeObjectURL(url);
      const f = file.files && file.files[0];
      preview.innerHTML = '';
      preview.classList.toggle('d-none', !f);
      if (!f) return;
      url = URL.createObjectURL(f);
      const img = document.createElement('img');
      img.alt = 'Selected photo preview';
      img.src = url;
      preview.appendChild(img);
    });
    cleanup = () => { if (url) URL.revokeObjectURL(url); };
    submit($('form'), async (fd) => {
      if (!fd.get('photo') || !fd.get('photo').size) fd.delete('photo');
      const r = await api('/posts', { method: 'POST', form: fd });
      flash('ok', 'Posted. The admin has been notified.');
      go('/post/' + r.id);
    });
  }

  async function postShow({ args: [id] }) {
    const d = await api('/posts/' + id);
    const p = d.post;
    const fact = (ic, label, value) => `<div class="col-6"><div class="small text-secondary mb-1">${icon(ic)} ${label}</div><div class="fw-bold">${value}</div></div>`;
    app.innerHTML = `<a class="d-inline-block mb-4 text-decoration-none" href="#/">${icon('arrow-left')} Back to browse</a>
      <div class="row g-5">
        <div class="col-lg-6">${p.image ? `<img class="detail-img" src="/uploads/${esc(p.image)}" alt="${esc(p.item_name)}">`
          : '<div class="surface no-photo py-5" style="min-height:300px">No photo</div>'}</div>
        <div class="col-lg-6">
          <div class="d-flex align-items-center gap-2 mb-3">${badge(p.type)}${p.status === 'resolved' ? `<span class="fw-bold text-success small">${icon('check-circle-fill')} Returned</span>` : ''}</div>
          <h1 class="h2 mb-3">${esc(p.item_name)}</h1>
          <p class="mb-4">${esc(p.description).replace(/\n/g, '<br>')}</p>
          <div class="surface p-4 mb-4"><div class="row g-4">
            ${fact('tag', 'Category', esc(p.category))}${fact('geo-alt', 'Location', esc(p.location))}
            ${fact('calendar-event', p.type === 'lost' ? 'Lost on' : 'Found on', fmt(p.occurred_at))}${fact('clock-history', 'Posted', ago(p.created_at))}
          </div></div>
          <div class="surface p-4">
            <div class="d-flex align-items-center gap-3 ${p.course ? 'mb-4' : ''}">
              <span class="fs-2 text-secondary lh-1">${icon('person-circle')}</span>
              <div><div class="fw-bold">${esc(p.full_name || 'A student')}</div>
              ${p.course ? `<div class="small text-secondary">${esc(p.course)} · Year ${esc(p.year_level)} · Block ${esc(p.block)}</div>` : ''}</div>
            </div>
            <div class="d-flex flex-wrap gap-2">
              ${d.canContact ? `<button class="btn btn-primary" type="button" data-contact>${icon('chat-dots')} ${p.type === 'lost' ? 'I found this' : 'This is mine'}</button>` : ''}
              ${!S.user ? `<a class="btn btn-primary" href="#/login?next=${encodeURIComponent('/post/' + p.id)}">Log in to contact</a>` : ''}
              ${d.canResolve && p.status !== 'resolved' ? `<button class="btn btn-outline-primary" type="button" data-resolve>${icon('check2-circle')} Mark as resolved</button>` : ''}
            </div>
          </div>
          ${d.conversations.length ? `<h2 class="h5 mt-5 mb-3">Messages about this item</h2>
            <div class="list-group">${d.conversations.map((c) => `<a class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" href="#/messages/${c.id}">
              <span>${esc(c.name)}</span><span class="small text-secondary">${c.message_count} message${c.message_count === 1 ? '' : 's'}</span></a>`).join('')}</div>` : ''}
        </div>
      </div>`;
    const contact = $('[data-contact]');
    if (contact) contact.addEventListener('click', async () => {
      contact.disabled = true;
      try { const r = await api(`/posts/${id}/contact`, { method: 'POST' }); go('/messages/' + r.conversationId); }
      catch (err) { flash('err', err.message); showFlash(); contact.disabled = false; }
    });
    const resolve = $('[data-resolve]');
    if (resolve) resolve.addEventListener('click', async () => {
      if (!confirm('Mark this item as resolved?')) return;
      try { await api(`/posts/${id}/resolve`, { method: 'POST' }); flash('ok', 'Marked as resolved.'); go('/post/' + id); }
      catch (err) { flash('err', err.message); showFlash(); }
    });
  }

  async function myPosts() {
    need();
    const d = await api('/my-posts');
    app.innerHTML = pageHead('My posts', 'Items you reported.', `<a class="btn btn-primary" href="#/post/new">${icon('plus-lg')} Post an item</a>`) +
      grid(d.posts, 'You have not posted anything yet. <a href="#/post/new">Post your first item</a>.');
  }

  async function messages() {
    need();
    const d = await api('/conversations');
    const me = S.user.id;
    const row = (c) => {
      const peer = c.other_id === me ? (c.owner_name || c.owner_email) : (c.other_name || c.other_email);
      return `<a class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3" href="#/messages/${c.id}">
        <div class="min-w-0"><div class="fw-bold">${esc(peer)}</div>
          <div class="small text-secondary text-truncate">${c.item_name ? esc(c.item_name) : 'Direct message'} — ${esc(c.last_body || 'No messages yet')}</div></div>
        <div class="d-flex align-items-center gap-2 flex-shrink-0"><span class="small text-secondary">${c.last_at ? ago(c.last_at) : ''}</span>${c.unread ? `<span class="badge rounded-pill text-bg-warning">${c.unread}</span>` : ''}</div>
      </a>`;
    };
    app.innerHTML = `<div class="row justify-content-center"><div class="col-lg-9 col-xl-8">
      ${pageHead('Messages', d.isAdmin ? 'Messages students sent directly to you.' : 'Conversations about posted items.', d.isAdmin ? '' : `<button class="btn btn-outline-primary" type="button" data-admin-dm>${icon('headset')} Message the admin</button>`)}
      ${d.conversations.length ? `<div class="list-group shadow-sm">${d.conversations.map(row).join('')}</div>`
        : `<div class="surface text-center p-5 text-secondary">${d.isAdmin ? 'No student has messaged you yet.' : 'No conversations yet. Open an item and choose “I found this” or “This is mine”.'}</div>`}
    </div></div>`;
    const dm = $('[data-admin-dm]');
    if (dm) dm.addEventListener('click', async () => {
      try { const r = await api('/conversations/admin', { method: 'POST' }); go('/messages/' + r.conversationId); }
      catch (err) { flash('err', err.message); showFlash(); }
    });
  }

  async function thread({ args: [id] }) {
    need();
    const d = await api('/conversations/' + id);
    const { conv, peer } = d;
    const me = S.user.id;
    app.innerHTML = `<div class="row justify-content-center"><div class="col-lg-9 col-xl-8">
      <a class="d-inline-block mb-4 text-decoration-none" href="#/messages">${icon('arrow-left')} All messages</a>
      <div class="surface overflow-hidden shadow-sm">
        <div class="p-4 border-bottom bg-white">
          <h1 class="h5 mb-1">${esc(peer.full_name || peer.email)}</h1>
          ${peer.course ? `<div class="small text-secondary">${esc(peer.course)} · Year ${esc(peer.year_level)} · Block ${esc(peer.block)}</div>` : ''}
          <div class="small text-secondary">${conv.item_name ? `About <a href="#/post/${conv.post_id}">${esc(conv.item_name)}</a>` : 'Direct message'}</div>
        </div>
        <div class="thread-box" data-box></div>
        <form class="p-3 p-md-4 border-top bg-white d-flex gap-3 align-items-end">
          <textarea class="form-control" name="body" rows="2" maxlength="2000" placeholder="Write a message…" aria-label="Message" required></textarea>
          <button class="btn btn-primary" type="submit">${icon('send')} Send</button>
        </form>
      </div></div></div>`;
    const box = $('[data-box]');
    const form = $('form');
    const textarea = $('textarea');
    let lastId = 0;
    let busy = false;

    const bubble = (m) => {
      const mine = m.sender_id === me;
      const w = document.createElement('div');
      w.className = 'bubble' + (mine ? ' mine' : '');
      w.dataset.id = m.id;
      const p = document.createElement('p');
      p.textContent = m.body;
      const meta = document.createElement('span');
      meta.className = 'small text-secondary';
      meta.textContent = (mine ? 'You' : m.full_name || 'Student') + ' · ' + fmtShort(m.created_at);
      w.append(p, meta);
      return w;
    };
    const add = (list) => {
      let added = false;
      for (const m of list) {
        if (box.querySelector(`[data-id="${m.id}"]`)) continue;
        box.appendChild(bubble(m));
        lastId = Math.max(lastId, m.id);
        added = true;
      }
      if (added) box.scrollTop = box.scrollHeight;
    };
    add(d.messages);

    async function poll() {
      if (busy || document.hidden) return;
      busy = true;
      try { add((await api(`/conversations/${id}/feed?after=${lastId}`)).messages); }
      catch (e) { /* offline for a moment; next tick retries */ }
      finally { busy = false; }
    }
    const timer = setInterval(poll, 3000);
    cleanup = () => clearInterval(timer);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = textarea.value.trim();
      if (!body) return;
      try { await api(`/conversations/${id}/messages`, { method: 'POST', body: { body } }); textarea.value = ''; poll(); }
      catch (err) { flash('err', err.message); showFlash(); }
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
  }

  async function adminView() {
    need(true);
    const d = await api('/admin');
    const s = d.stats;
    const stat = (n, l) => `<div class="col"><div class="surface p-4 text-center h-100"><div class="h2 mb-1 text-primary">${n}</div><div class="small text-secondary">${l}</div></div></div>`;
    const panel = (title, inner) => `<section class="surface section-gap overflow-hidden"><h2 class="h5 p-4 mb-0 border-bottom">${title}</h2>${inner}</section>`;
    app.innerHTML = pageHead('Admin dashboard', 'Moderate posts and review accounts.') +
      `<div class="row row-cols-2 row-cols-md-4 g-4 section-gap">${stat(s.posts, 'Posts')}${stat(s.open_lost, 'Open lost')}${stat(s.open_found, 'Open found')}${stat(s.resolved, 'Resolved')}${stat(s.users, 'Students')}${stat(s.pending, 'Unverified')}${stat(s.unread_messages, 'Unread messages')}</div>` +
      panel('New since your last visit', d.newPosts.length
        ? `<div class="list-group list-group-flush">${d.newPosts.map((p) => `<a class="list-group-item list-group-item-action d-flex align-items-center gap-3 p-3 px-4" href="#/post/${p.id}">${badge(p.type)}<span class="fw-bold">${esc(p.item_name)}</span><span class="small text-secondary ms-auto">${esc(p.full_name || 'unknown')} · ${ago(p.created_at)}</span></a>`).join('')}</div>`
        : '<p class="p-4 mb-0 text-secondary">Nothing new.</p>') +
      panel('Recent posts', `<div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Item</th><th>Type</th><th>Posted by</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
        <tbody>${d.recent.map((p) => `<tr><td><a href="#/post/${p.id}">${esc(p.item_name)}</a></td><td>${badge(p.type)}</td><td>${esc(p.full_name || '')}</td><td>${p.status}</td>
          <td class="text-end text-nowrap">${p.status !== 'resolved' ? `<button class="btn btn-sm btn-outline-primary me-2" type="button" data-resolve="${p.id}">Resolve</button>` : ''}<button class="btn btn-sm btn-outline-danger" type="button" data-remove="${p.id}">Remove</button></td></tr>`).join('')}</tbody>
      </table></div>`) +
      panel('Accounts', `<div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Course</th><th>Verified</th></tr></thead>
        <tbody>${d.users.map((u) => `<tr><td>${esc(u.full_name || '—')}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${esc(u.course || '')}</td><td>${u.verified_at ? 'Yes' : 'Pending'}</td></tr>`).join('')}</tbody>
      </table></div>`);
    app.addEventListener('click', onAdminClick);
    cleanup = () => app.removeEventListener('click', onAdminClick);
  }

  async function onAdminClick(e) {
    const btn = e.target.closest('[data-resolve],[data-remove]');
    if (!btn) return;
    const remove = btn.hasAttribute('data-remove');
    const id = btn.dataset.remove || btn.dataset.resolve;
    if (remove && !confirm('Remove post #' + id + ' permanently?')) return;
    try {
      await api(`/admin/posts/${id}/${remove ? 'remove' : 'resolve'}`, { method: 'POST' });
      flash('ok', 'Post #' + id + (remove ? ' removed.' : ' marked resolved.'));
      go('/admin');
    } catch (err) { flash('err', err.message); showFlash(); }
  }

  async function outbox() {
    if (!S.cfg.demo) return notFound();
    const d = await api('/dev/outbox');
    app.innerHTML = pageHead('Dev outbox', 'Emails the app tried to send. Development only; this page does not exist in production.') +
      (d.messages.length ? `<div class="d-grid gap-4">${d.messages.map((m) => `<article class="surface mail p-4"><div class="d-flex flex-wrap justify-content-between gap-2 mb-3"><strong>${esc(m.subject)}</strong><span class="small text-secondary">to ${esc(m.to_email)} · ${fmt(m.created_at)}</span></div><pre>${esc(m.body)}</pre></article>`).join('')}</div>`
        : '<div class="surface text-center p-5 text-secondary">No emails yet.</div>');
  }

  async function about() {
    app.innerHTML = `<div class="row justify-content-center"><div class="col-lg-8"><div class="surface p-4 p-md-5">
      <h1 class="h2 mb-4">About FoundIT</h1>
      <p>FoundIT is the Bicol University campus lost and found. Students post items they lost or found, message each other, and mark items as returned.</p>
      <p class="mb-0">Only enrolled students with a BU email can post. An admin can resolve or remove posts.</p></div></div></div>`;
  }

  function notFound() {
    app.innerHTML = '<div class="surface text-center p-5"><h1 class="h3 mb-3">Page not found</h1><p class="text-secondary">That page does not exist.</p><a class="btn btn-primary" href="#/">Back to browse</a></div>';
  }

  // ---------- router ----------
  const routes = [
    [/^\/$/, home], [/^\/login$/, loginView], [/^\/signup$/, signupView], [/^\/verify$/, verifyView],
    [/^\/forgot$/, forgotView], [/^\/reset$/, resetView], [/^\/post\/new$/, postNew], [/^\/post\/(\d+)$/, postShow],
    [/^\/my-posts$/, myPosts], [/^\/messages$/, messages], [/^\/messages\/(\d+)$/, thread],
    [/^\/admin$/, adminView], [/^\/about$/, about], [/^\/outbox$/, outbox],
  ];

  let seq = 0;
  async function route() {
    const mine = ++seq;
    if (cleanup) { cleanup(); cleanup = null; }
    const raw = location.hash.slice(1) || '/';
    const [path, qs = ''] = raw.split('?');
    await refreshMe();
    if (mine !== seq) return;
    renderNav(path);
    const menu = document.getElementById('mainNav');
    if (menu.classList.contains('show')) bootstrap.Collapse.getOrCreateInstance(menu).hide();
    window.scrollTo(0, 0);
    const hit = routes.find(([re]) => re.test(path));
    try {
      if (!hit) notFound();
      else await hit[1]({ q: new URLSearchParams(qs), args: path.match(hit[0]).slice(1) });
    } catch (err) {
      if (err.status === 401) { go('/login?next=' + encodeURIComponent(raw)); return; }
      app.innerHTML = `<div class="surface text-center p-5"><h1 class="h3 mb-3">Something went wrong</h1><p class="text-secondary mb-0">${esc(err.message)}</p></div>`;
    }
    if (mine === seq) { renderNav(path); showFlash(); }
  }

  window.addEventListener('hashchange', route);
  setInterval(async () => {
    if (!S.user || document.hidden) return;
    const before = S.unread;
    await refreshMe();
    if (S.unread !== before) renderNav((location.hash.slice(1) || '/').split('?')[0]);
  }, 20000);
  fsSync();
  route();
})();
