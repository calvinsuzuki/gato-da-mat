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
    title: 'Gata da Mat',
    heading: 'Em memória',
    share: 'Compartilhe suas fotos',
    loading: 'Carregando…',
    empty: 'Ainda não há fotos.',
    error: 'Não foi possível carregar as fotos.',
    footer: 'USP São Carlos · Calvin Suzuki',
    modalTitle: 'Compartilhe suas fotos',
    modalBody: 'Envie suas fotos e histórias da gata para:',
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

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|ogv)$/i;

const typeFor = (entry) => {
  if (typeof entry === 'object' && entry.type) return entry.type;
  return VIDEO_EXT.test(fileFor(entry)) ? 'video' : 'image';
};

const renderGrid = (images, captions) => {
  if (!images.length) {
    STATE.textContent = T.empty;
    return;
  }
  GRID.innerHTML = images
    .map((entry, i) => {
      const file = fileFor(entry);
      const kind = typeFor(entry);
      const src = `images/${encodeURIComponent(file)}`;
      const poster =
        typeof entry === 'object' && entry.poster
          ? `images/${entry.poster.split('/').map(encodeURIComponent).join('/')}`
          : src;
      const media =
        kind === 'video'
          ? `<img src="${poster}" alt="" loading="lazy" />
             <span class="play-badge" aria-hidden="true">▶</span>`
          : `<img src="${src}" alt="" loading="lazy" />`;
      return `
        <button class="tile tile-${kind}" data-index="${i}" aria-label="${T.openPhotoAria(i + 1)}">
          ${media}
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

let lightboxObserver = null;

const renderLightbox = (images, captions) => {
  LIGHTBOX_TRACK.innerHTML = images
    .map((entry, i) => {
      const file = fileFor(entry);
      const kind = typeFor(entry);
      const src = `images/${encodeURIComponent(file)}`;
      const poster =
        typeof entry === 'object' && entry.poster
          ? `images/${entry.poster.split('/').map(encodeURIComponent).join('/')}`
          : '';
      const caption = captionFor(entry, captions);
      const media =
        kind === 'video'
          ? `<video data-src="${src}" ${poster ? `poster="${poster}"` : ''} controls playsinline muted preload="none"></video>`
          : `<img data-src="${src}" alt="" />`;
      return `
        <div class="lightbox-slide" data-index="${i}" data-type="${kind}">
          ${media}
          ${caption ? `<p class="lightbox-caption">${escapeHtml(caption)}</p>` : ''}
        </div>`;
    })
    .join('');

  if (lightboxObserver) lightboxObserver.disconnect();
  lightboxObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const slide = e.target;
        const media = slide.querySelector('img, video');
        if (!media) return;

        const active = e.intersectionRatio >= 0.6;
        const nearby = e.isIntersecting;

        // Lazy-load when slide is anywhere near viewport.
        if (nearby && media.dataset.src && !media.src) {
          media.src = media.dataset.src;
        }

        if (media.tagName !== 'VIDEO') return;

        if (active) {
          const p = media.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else {
          media.pause();
          if (!nearby) media.currentTime = 0;
        }
      });
    },
    { root: LIGHTBOX, rootMargin: '200px 0px', threshold: [0, 0.6] }
  );
  LIGHTBOX_TRACK.querySelectorAll('.lightbox-slide').forEach((s) =>
    lightboxObserver.observe(s)
  );
};

const openLightbox = (images, captions, startIndex) => {
  if (!LIGHTBOX_TRACK.children.length) renderLightbox(images, captions);
  LIGHTBOX.hidden = false;
  LIGHTBOX.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const target = LIGHTBOX_TRACK.querySelector(`[data-index="${startIndex}"]`);
  if (target) {
    // Force-load this slide immediately, even before observer fires.
    const media = target.querySelector('img, video');
    if (media && media.dataset.src && !media.src) {
      media.src = media.dataset.src;
    }
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    if (media && media.tagName === 'VIDEO') {
      const p = media.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }
};

const closeLightbox = () => {
  LIGHTBOX.hidden = true;
  LIGHTBOX.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  LIGHTBOX_TRACK.querySelectorAll('video').forEach((v) => {
    v.pause();
    v.currentTime = 0;
  });
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
