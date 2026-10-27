// Fullscreen toggle. Browsers require the click itself, so no state is stored.
const fullscreenBtn = document.querySelector('[data-fullscreen]');
if (fullscreenBtn) {
  const label = fullscreenBtn.querySelector('[data-fullscreen-label]');
  const sync = () => {
    const on = Boolean(document.fullscreenElement);
    fullscreenBtn.setAttribute('aria-pressed', String(on));
    label.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
  };
  fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (err) {
      label.textContent = 'Fullscreen blocked';
    }
  });
  document.addEventListener('fullscreenchange', sync);
  sync();
}

// Photo preview on the post form.
document.querySelectorAll('input[type="file"][data-preview]').forEach((input) => {
  const target = document.querySelector('[data-preview-target]');
  if (!target) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    target.innerHTML = '';
    target.hidden = !file;
    if (!file) return;
    const img = document.createElement('img');
    img.alt = 'Selected photo preview';
    img.src = URL.createObjectURL(file);
    target.appendChild(img);
  });
});

// Conversation polling: refresh every 3 seconds instead of websockets.
const thread = document.querySelector('[data-thread]');
if (thread) {
  const conversationId = thread.dataset.conversation;
  const me = Number(thread.dataset.me);
  const box = thread.querySelector('[data-messages]');
  const form = thread.querySelector('[data-send]');
  let lastId = 0;
  let polling = false;

  box.querySelectorAll('[data-id]').forEach((el) => {
    lastId = Math.max(lastId, Number(el.dataset.id));
  });

  const scrollDown = () => { box.scrollTop = box.scrollHeight; };
  scrollDown();

  function bubbleFor(message) {
    const wrapper = document.createElement('div');
    wrapper.className = 'bubble ' + (message.sender_id === me ? 'mine' : 'theirs');
    wrapper.dataset.id = message.id;

    const body = document.createElement('p');
    body.textContent = message.body;

    const meta = document.createElement('span');
    meta.className = 'small';
    meta.textContent = (message.sender_id === me ? 'You' : message.full_name || 'Student') + ' · just now';

    wrapper.append(body, meta);
    return wrapper;
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const res = await fetch(`/messages/${conversationId}/feed?after=${lastId}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      let added = false;
      for (const message of data.messages) {
        if (box.querySelector(`[data-id="${message.id}"]`)) continue;
        box.appendChild(bubbleFor(message));
        lastId = Math.max(lastId, message.id);
        added = true;
      }
      if (added) scrollDown();
    } catch (err) {
      // Offline for a moment; the next tick retries.
    } finally {
      polling = false;
    }
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const textarea = form.querySelector('textarea');
      const body = textarea.value.trim();
      if (!body) return;

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body }),
      })
        .then((res) => { if (res.ok) { textarea.value = ''; return poll(); } })
        .catch(() => {});
    });
  }

  setInterval(poll, 3000);
}
