/* I18N */
const I18N = {
  en: {
    title: 'Math Cat',
    heading: 'In memory',
    share: 'Share your images',
    loading: 'Loading…',
    empty: 'No photos yet.',
    error: 'Could not load photos.',
    footer: 'USP São Carlos · Calvin Suzuki',
    modalTitle: 'Share your images',
    modalBody: 'Send your photos and stories of the cat to:',
    modalNote: 'Photos will be added manually. Include your name (or anonymous) and an optional caption.',
    copy: 'Copy',
    copied: 'Copied!',
    copyFailed: 'Failed',
    closeAria: 'Close',
    openPhotoAria: (i) => `Open photo ${i}`,
  },
  pt: {
    title: 'Gato da Mat',
    heading: 'Em memória',
    share: 'Compartilhe suas fotos',
    loading: 'Carregando…',
    empty: 'Ainda não há fotos.',
    error: 'Não foi possível carregar as fotos.',
    footer: 'USP São Carlos · Calvin Suzuki',
    modalTitle: 'Compartilhe suas fotos',
    modalBody: 'Envie suas fotos e histórias do gato para:',
    modalNote: 'As fotos serão adicionadas manualmente. Inclua seu nome (ou anônimo) e uma legenda opcional.',
    copy: 'Copiar',
    copied: 'Copiado!',
    copyFailed: 'Falhou',
    closeAria: 'Fechar',
    openPhotoAria: (i) => `Abrir foto ${i}`,
  },
};

const detectLang = () => {
  const langs = navigator.languages || [navigator.language || 'en'];
  for (const l of langs) {
    if (l && l.toLowerCase().startsWith('pt')) return 'pt';
  }
  return 'en';
};

const LANG = detectLang();
const T = I18N[LANG];

document.documentElement.lang = LANG === 'pt' ? 'pt-BR' : 'en';
document.title = T.title;

document.querySelectorAll('[data-i18n]').forEach((el) => {
  const key = el.dataset.i18n;
  if (T[key]) el.textContent = T[key];
});

document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
  el.dataset.i18nAttr.split(',').forEach((pair) => {
    const [attr, key] = pair.split(':').map((s) => s.trim());
    if (T[key]) el.setAttribute(attr, T[key]);
  });
});

const GRID = document.getElementById('grid');
const STATE = document.getElementById('state');
const LIGHTBOX = document.getElementById('lightbox');
const LIGHTBOX_TRACK = document.getElementById('lightbox-track');
const LIGHTBOX_CLOSE = document.getElementById('lightbox-close');

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const fetchJson = async (url, fallback) => {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
};

const captionFor = (entry, captions) => {
  if (typeof entry === 'object' && entry.caption) return entry.caption;
  return captions[entry.file || entry] || '';
};

const fileFor = (entry) => (typeof entry === 'string' ? entry : entry.file);

const renderGrid = (images, captions) => {
  if (!images.length) {
    STATE.textContent = T.empty;
    return;
  }
  GRID.innerHTML = images
    .map((entry, i) => {
      const file = fileFor(entry);
      const src = `images/${encodeURIComponent(file)}`;
      return `
        <button class="tile" data-index="${i}" aria-label="${T.openPhotoAria(i + 1)}">
          <img src="${src}" alt="" loading="lazy" />
        </button>`;
    })
    .join('');

  GRID.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const idx = Number(tile.dataset.index);
      openLightbox(images, captions, idx);
    });
  });
};

const renderLightbox = (images, captions) => {
  LIGHTBOX_TRACK.innerHTML = images
    .map((entry, i) => {
      const file = fileFor(entry);
      const src = `images/${encodeURIComponent(file)}`;
      const caption = captionFor(entry, captions);
      return `
        <div class="lightbox-slide" data-index="${i}">
          <img src="${src}" alt="" />
          ${caption ? `<p class="lightbox-caption">${escapeHtml(caption)}</p>` : ''}
        </div>`;
    })
    .join('');
};

const openLightbox = (images, captions, startIndex) => {
  if (!LIGHTBOX_TRACK.children.length) renderLightbox(images, captions);
  LIGHTBOX.hidden = false;
  LIGHTBOX.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const target = LIGHTBOX_TRACK.querySelector(`[data-index="${startIndex}"]`);
  if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
};

const closeLightbox = () => {
  LIGHTBOX.hidden = true;
  LIGHTBOX.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
};

LIGHTBOX_CLOSE.addEventListener('click', closeLightbox);

/* SHARE MODAL */
const SHARE_BTN = document.getElementById('share-btn');
const SHARE_MODAL = document.getElementById('share-modal');
const SHARE_EMAIL = document.getElementById('share-email');
const COPY_BTN = document.getElementById('copy-btn');

const openShare = () => {
  SHARE_MODAL.hidden = false;
  SHARE_MODAL.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
};

const closeShare = () => {
  SHARE_MODAL.hidden = true;
  SHARE_MODAL.setAttribute('aria-hidden', 'true');
  if (LIGHTBOX.hidden) document.body.style.overflow = '';
};

SHARE_BTN.addEventListener('click', openShare);
SHARE_MODAL.querySelectorAll('[data-close]').forEach((el) =>
  el.addEventListener('click', closeShare)
);

COPY_BTN.addEventListener('click', async () => {
  const email = SHARE_EMAIL.textContent.trim();
  let ok = false;
  try {
    await navigator.clipboard.writeText(email);
    ok = true;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(SHARE_EMAIL);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      ok = document.execCommand('copy');
    } catch {}
    sel.removeAllRanges();
  }
  COPY_BTN.textContent = ok ? T.copied : T.copyFailed;
  COPY_BTN.classList.toggle('copied', ok);
  setTimeout(() => {
    COPY_BTN.textContent = T.copy;
    COPY_BTN.classList.remove('copied');
  }, 1800);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!SHARE_MODAL.hidden) closeShare();
  else if (!LIGHTBOX.hidden) closeLightbox();
});

(async () => {
  const images = await fetchJson('images.json', null);
  if (!images) {
    STATE.textContent = T.error;
    return;
  }
  const captions = await fetchJson('captions.json', {});
  renderGrid(images, captions);
})();
