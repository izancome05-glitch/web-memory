// ==UserScript==
// @name         Web Memory
// @namespace    https://github.com/tu-usuario/web-memory
// @version      0.2.1
// @description  Save, organize and search snippets from anywhere on the web. Local-first.
// @description:es Guarda, organiza y busca fragmentos de internet. Todo queda en tu navegador.
// @author       Tu nombre
// @license      MIT
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// ==/UserScript==

/**
 * Web Memory 0.2.1
 * ----------------------------------------------------------------------------
 * Prioridad local (local-first): sin peticiones de red ni dependencias externas.
 *
 * Estructura del archivo:
 *   1. Configuración
 *   2. Textos (i18n)
 *   3. Utilidades puras
 *   4. Saneado de datos y almacenamiento
 *   5. Estado de la aplicación
 *   6. Estilos (Shadow DOM)
 *   7. Construcción de la interfaz
 *   8. Render
 *   9. Acciones (guardar, editar, borrar, importar…)
 *  10. Eventos y atajos
 *  11. Arranque
 *
 * Datos: se mantiene la clave y el esquema v1, así que los recuerdos
 * guardados con la versión 0.1.0 siguen funcionando sin migración.
 */
(function () {
  'use strict';

  /* ==========================================================================
   * 1. CONFIGURACIÓN
   * ======================================================================== */

  const STORAGE_KEY = 'webMemory.data.v1';
  const HOST_ID = 'web-memory-host';
  const LAUNCHER_KEY = 'webMemory.launcher.v1'; // preferencia: botón flotante visible

  const MAX_ITEMS = 10000;
  const MAX_TEXT = 20000;
  const MAX_NOTE = 5000;
  const MAX_TAGS = 30;
  const MAX_TAG_LENGTH = 40;
  const MAX_TITLE = 500;
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

  const PAGE_SIZE = 40;          // tarjetas renderizadas por tanda
  const CLAMP_CHARS = 320;       // a partir de aquí el texto se pliega
  const SEARCH_DEBOUNCE_MS = 120;
  const TOAST_MS = 3200;
  const UNDO_MS = 7000;
  const STAGGER_MAX = 8;         // máximo de tarjetas con entrada escalonada

  /* ==========================================================================
   * 2. TEXTOS (i18n)
   * Las plantillas usan {variable}; se rellenan con fmt().
   * ======================================================================== */

  const LANG = (navigator.language || 'en').toLowerCase().startsWith('es')
    ? 'es'
    : 'en';

  const I18N = {
    es: {
      subtitle: 'Tu memoria personal de internet',
      search: 'Buscar en tu memoria…',
      filterGroup: 'Filtrar recuerdos',
      all: 'Todos',
      favorites: 'Favoritos',
      save: 'Guardar selección',
      selectionPreview: 'Texto seleccionado',
      note: 'Nota personal (opcional)',
      tags: 'Etiquetas separadas por comas',
      saveButton: 'Guardar',
      saveChanges: 'Guardar cambios',
      cancel: 'Cancelar',
      close: 'Cerrar',
      saved: 'Recuerdo guardado.',
      updated: 'Cambios guardados.',
      deleted: 'Recuerdo eliminado.',
      undo: 'Deshacer',
      emptySelection: 'Selecciona texto en la página y vuelve a pulsar «Guardar selección».',
      empty: 'Aún no hay recuerdos',
      emptyHint: 'Selecciona texto en cualquier página y pulsa «Guardar selección» o Alt + Shift + S.',
      noResults: 'Sin resultados para esta búsqueda.',
      count: 'Recuerdos: {filtered} de {total}',
      loadMore: 'Mostrar {n} más',
      showMore: 'Ver más',
      showLess: 'Ver menos',
      source: 'Abrir fuente',
      favorite: 'Marcar como favorito',
      unfavorite: 'Quitar de favoritos',
      edit: 'Editar nota y etiquetas',
      delete: 'Eliminar recuerdo',
      filterByTag: 'Filtrar por «{tag}»',
      export: 'Exportar JSON',
      import: 'Importar JSON',
      importDone: 'Importación completada. Nuevos: {added}. Omitidos: {skipped}.',
      importError: 'Archivo JSON no válido o demasiado grande.',
      emptyFile: 'El archivo no contiene recuerdos válidos.',
      importLimit: 'Se alcanzó el límite de {max} recuerdos.',
      duplicate: 'Este fragmento ya está guardado en esta página.',
      storageError: 'No se pudo guardar. Exporta tus datos como copia de seguridad.',
      invalidUrl: 'La dirección de la fuente no es válida.',
      open: 'Abrir Web Memory',
      menuSave: 'Guardar selección en Web Memory',
      launcherToggle: 'Mostrar u ocultar el botón flotante'
    },
    en: {
      subtitle: 'Your personal memory of the web',
      search: 'Search your memory…',
      filterGroup: 'Filter memories',
      all: 'All',
      favorites: 'Favorites',
      save: 'Save selection',
      selectionPreview: 'Selected text',
      note: 'Personal note (optional)',
      tags: 'Comma-separated tags',
      saveButton: 'Save',
      saveChanges: 'Save changes',
      cancel: 'Cancel',
      close: 'Close',
      saved: 'Memory saved.',
      updated: 'Changes saved.',
      deleted: 'Memory deleted.',
      undo: 'Undo',
      emptySelection: 'Select text on the page, then press “Save selection” again.',
      empty: 'No memories yet',
      emptyHint: 'Select text on any page, then press “Save selection” or Alt + Shift + S.',
      noResults: 'No results for this search.',
      count: 'Memories: {filtered} of {total}',
      loadMore: 'Show {n} more',
      showMore: 'Show more',
      showLess: 'Show less',
      source: 'Open source',
      favorite: 'Add to favorites',
      unfavorite: 'Remove from favorites',
      edit: 'Edit note and tags',
      delete: 'Delete memory',
      filterByTag: 'Filter by “{tag}”',
      export: 'Export JSON',
      import: 'Import JSON',
      importDone: 'Import complete. New: {added}. Skipped: {skipped}.',
      importError: 'Invalid or oversized JSON file.',
      emptyFile: 'The file contains no valid memories.',
      importLimit: 'The limit of {max} memories has been reached.',
      duplicate: 'This snippet is already saved on this page.',
      storageError: 'Could not save. Export your data as a backup.',
      invalidUrl: 'The source address is not valid.',
      open: 'Open Web Memory',
      menuSave: 'Save selection to Web Memory',
      launcherToggle: 'Show or hide the floating button'
    }
  };

  const t = I18N[LANG];
  const dateFormat = new Intl.DateTimeFormat(LANG, { dateStyle: 'medium' });

  /* ==========================================================================
   * 3. UTILIDADES PURAS
   * ======================================================================== */

  /** Sustituye {variables} en una plantilla de texto. */
  const fmt = (template, vars = {}) =>
    template.replace(/\{(\w+)\}/g, (_, key) =>
      key in vars ? vars[key] : `{${key}}`);

  /** Escapa HTML para los pocos sitios donde se usa innerHTML. */
  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function debounce(fn, wait) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /** UUID cuando existe (solo en contextos seguros); si no, un id aleatorio. */
  function makeId() {
    if (globalThis.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function cleanText(value, maxLength) {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  /** Limpia una selección: unifica saltos de línea y colapsa líneas vacías. */
  function tidySelection(value) {
    return cleanText(
      String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n'),
      MAX_TEXT
    );
  }

  /** Minúsculas y sin acentos, para búsquedas y detección de duplicados. */
  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function cleanTags(value) {
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    return [...new Set(
      list.map(tag => cleanText(tag, MAX_TAG_LENGTH)).filter(Boolean)
    )].slice(0, MAX_TAGS);
  }

  /** Devuelve un objeto URL solo si es http(s); si no, null. */
  function parseHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch {
      return null;
    }
  }

  function hostnameOf(value) {
    const url = parseHttpUrl(value);
    return url ? url.hostname.replace(/^www\./, '') : value;
  }

  const dedupeKey = item => `${normalizeText(item.text)}\n${item.url}`;
  const byNewest = (a, b) => b.createdAt - a.createdAt;

  /**
   * Crea un elemento DOM sin innerHTML.
   * props: class, dataset, text, atributos aria-*, propiedades del elemento.
   */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'text') el.textContent = value;
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
    el.append(...children.flat().filter(child => child != null && child !== false));
    return el;
  }

  /* --- Iconos SVG en línea (trazo, heredan currentColor) ------------------ */

  const ICON_PATHS = {
    x: 'M18 6 6 18M6 6l12 12',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z',
    pencil: 'M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10zM14 7l3 3',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    bookmark: 'M6 4h12v16l-6-4-6 4z'
  };

  const svg = name =>
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ` +
    `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `<path d="${ICON_PATHS[name]}"/></svg>`;

  const icon = name => h('span', { class: 'wm-icon', innerHTML: svg(name) });

  /* ==========================================================================
   * 4. SANEADO DE DATOS Y ALMACENAMIENTO
   * ======================================================================== */

  /**
   * Valida y normaliza un recuerdo (guardado, importado o cargado).
   * Devuelve null si no es válido. keepId conserva el id original.
   */
  function sanitizeItem(raw, { keepId = false } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.text !== 'string' || typeof raw.url !== 'string') return null;

    const text = cleanText(raw.text, MAX_TEXT);
    const url = parseHttpUrl(raw.url);
    if (!text || !url) return null;

    const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();

    return {
      id: keepId && typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
      text,
      note: cleanText(raw.note, MAX_NOTE),
      tags: cleanTags(raw.tags),
      title: cleanText(raw.title, MAX_TITLE),
      url: url.href,
      createdAt,
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt,
      favorite: raw.favorite === true
    };
  }

  /** Sanea una lista completa: sin ids repetidos, ordenada de más nueva a más antigua. */
  function sanitizeList(data) {
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    const result = [];
    for (const raw of data) {
      if (result.length >= MAX_ITEMS) break;
      const item = sanitizeItem(raw, { keepId: true });
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
    return result.sort(byNewest);
  }

  const Store = {
    read() {
      try {
        return sanitizeList(GM_getValue(STORAGE_KEY, []));
      } catch (error) {
        console.error('[Web Memory] Read error:', error);
        return [];
      }
    },
    write(list) {
      try {
        GM_setValue(STORAGE_KEY, list);
        return true;
      } catch (error) {
        console.error('[Web Memory] Storage error:', error);
        return false;
      }
    }
  };

  /* ==========================================================================
   * 5. ESTADO DE LA APLICACIÓN
   * ======================================================================== */

  /** Lee si el botón flotante debe mostrarse (por defecto, sí). */
  function readLauncherPref() {
    try {
      return GM_getValue(LAUNCHER_KEY, true) !== false;
    } catch {
      return true;
    }
  }

  const state = {
    memories: Store.read(),   // siempre ordenado: más reciente primero
    filter: 'all',            // 'all' | 'favorites'
    query: '',
    visibleCount: PAGE_SIZE,
    editingId: null,          // id de la tarjeta en edición inline
    pendingText: '',          // texto a punto de guardarse
    snapshot: '',             // selección de la página al abrir el panel
    lastFocused: null,        // elemento a enfocar al cerrar el panel
    entrance: false,          // anima la entrada de tarjetas en el próximo render
    freshId: null,            // tarjeta recién creada o restaurada
    launcherVisible: readLauncherPref(),
    fromLauncher: false       // el panel se abrió desde el botón flotante
  };

  /** Texto de búsqueda precalculado por recuerdo (evita normalizar en cada tecla). */
  const haystacks = new WeakMap();

  function haystackOf(item) {
    let value = haystacks.get(item);
    if (value === undefined) {
      value = normalizeText(
        [item.text, item.note, item.title, item.url, ...item.tags].join(' ')
      );
      haystacks.set(item, value);
    }
    return value;
  }

  const findMemory = id => state.memories.find(item => item.id === id);

  function isDuplicate(text, url) {
    const key = normalizeText(text) + '\n' + url;
    return state.memories.some(item => dedupeKey(item) === key);
  }

  function getFiltered() {
    const terms = normalizeText(state.query).split(/\s+/).filter(Boolean);
    return state.memories.filter(item =>
      (state.filter === 'all' || item.favorite) &&
      terms.every(term => haystackOf(item).includes(term))
    );
  }

  /** Guarda en almacenamiento; avisa al usuario si falla. */
  function persist() {
    const ok = Store.write(state.memories);
    if (!ok) toast(t.storageError, { tone: 'error', duration: 6000 });
    return ok;
  }

  /** Lee la selección de la página (incluye campos de texto, excluye contraseñas). */
  function readSelection() {
    const active = document.activeElement;
    const isTextField = active && active.id !== HOST_ID && (
      active.tagName === 'TEXTAREA' ||
      (active.tagName === 'INPUT' &&
        /^(text|search|url|tel|email)$/i.test(active.type))
    );

    if (isTextField) {
      try {
        const { selectionStart: start, selectionEnd: end, value } = active;
        if (start != null && end > start) return tidySelection(value.slice(start, end));
      } catch { /* algunos tipos de input no exponen selección */ }
    }

    const selection = window.getSelection();
    return selection ? tidySelection(selection.toString()) : '';
  }

  /* ==========================================================================
   * 6. ESTILOS (dentro del Shadow DOM, no se filtran a la página)
   *
   * Dirección visual: un cuaderno de subrayados. Cada recuerdo es una cita en
   * tipografía serif con marcador fluorescente; el elemento más memorable es
   * la banda de marcador que distingue los favoritos y la tarjeta nueva.
   * Las animaciones usan solo transform y opacity, salvo el plegado de paneles
   * (grid-template-rows), que sí recalcula el layout, pero se limita a
   * elementos pequeños.
   * ======================================================================== */

  const STYLES = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }

    /* --- Tokens ----------------------------------------------------------- */
    .wm-panel, .wm-launcher {
      --ink: #15171e;
      --paper: #fbfbfd;
      --surface: #ffffff;
      --line: #e3e5ec;
      --muted: #5d6475;
      --accent: #4448d8;
      --accent-ink: #ffffff;
      --accent-soft: #eceefd;
      --seg-bg: #eceef4;
      --marker: rgba(255, 213, 74, .62);
      --stripe: #f2b705;
      --shadow: 0 1px 2px rgba(15, 18, 30, .06), 0 22px 56px -14px rgba(15, 18, 30, .32);
      --ease-out: cubic-bezier(.22, 1, .36, 1);
      --ease-spring: cubic-bezier(.34, 1.56, .64, 1);
      --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      --font-quote: ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
      color-scheme: light;
    }
    @media (prefers-color-scheme: dark) {
      .wm-panel, .wm-launcher {
        --ink: #eceef6;
        --paper: #14161d;
        --surface: #1b1e27;
        --line: #2b2f3b;
        --muted: #9aa1b4;
        --accent: #8c90ff;
        --accent-ink: #10122b;
        --accent-soft: #262a52;
        --seg-bg: #232733;
        --marker: rgba(255, 213, 74, .26);
        --stripe: #ffd54a;
        --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 22px 56px -14px rgba(0, 0, 0, .7);
        color-scheme: dark;
      }
    }

    /* --- Panel: entra desde la derecha con transform + opacity ------------ */
    .wm-panel {
      position: fixed; top: 16px; right: 16px;
      width: min(440px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      max-height: calc(100dvh - 32px);
      display: flex; flex-direction: column;
      background: var(--paper); color: var(--ink);
      border: 1px solid var(--line); border-radius: 18px;
      box-shadow: var(--shadow);
      font: 14px/1.5 var(--font-ui);
      overflow: hidden;
      opacity: 0; visibility: hidden;
      transform: translate3d(28px, 0, 0) scale(.98);
      transform-origin: top right;
      transition:
        opacity .18s ease,
        transform .28s var(--ease-out),
        visibility 0s linear .28s;
    }
    .wm-panel.open {
      opacity: 1; visibility: visible; transform: none;
      transition:
        opacity .22s ease,
        transform .45s var(--ease-out),
        visibility 0s;
    }

    /* --- Cabecera --------------------------------------------------------- */
    .wm-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 14px 16px;
      background: var(--surface); border-bottom: 1px solid var(--line);
    }
    .wm-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .wm-brand svg { flex: none; }
    .wm-title { margin: 0; font-size: 17px; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; }
    .wm-subtitle { margin: 2px 0 0; font-size: 12px; color: var(--muted); }

    /* --- Cuerpo ----------------------------------------------------------- */
    .wm-body {
      padding: 14px 14px 16px; overflow-y: auto; min-height: 0;
      overscroll-behavior: contain; scrollbar-gutter: stable;
    }

    /* --- Controles -------------------------------------------------------- */
    .wm-icon { display: inline-flex; flex: none; }
    .wm-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      min-height: 34px; padding: 6px 12px;
      border: 1px solid var(--line); border-radius: 10px;
      background: var(--surface); color: var(--ink);
      font: inherit; font-weight: 550; cursor: pointer; white-space: nowrap;
      transition: background-color .18s ease, border-color .18s ease,
                  color .18s ease, transform .18s var(--ease-out);
    }
    .wm-btn:hover { background: var(--accent-soft); }
    .wm-btn:active { transform: scale(.96); }
    .wm-btn--primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .wm-btn--primary:hover { background: var(--accent); filter: brightness(1.1); }
    .wm-btn--icon { width: 34px; padding: 0; color: var(--muted); border-color: transparent; background: transparent; }
    .wm-btn--icon:hover { color: var(--ink); }
    .wm-btn--text { padding-inline: 8px; border-color: transparent; background: transparent; color: var(--accent); }
    .wm-btn:focus-visible, .wm-input:focus-visible, .wm-seg button:focus-visible {
      outline: 2px solid var(--accent); outline-offset: 2px;
    }

    .wm-input {
      width: 100%; min-width: 0; padding: 9px 11px;
      border: 1px solid var(--line); border-radius: 10px;
      background: var(--surface); color: var(--ink); font: inherit;
      transition: border-color .18s ease;
    }
    .wm-input:hover { border-color: var(--muted); }
    .wm-input::placeholder { color: var(--muted); }
    .wm-textarea { resize: vertical; min-height: 68px; }

    .wm-search { position: relative; margin-bottom: 10px; }
    .wm-search .wm-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
    .wm-search .wm-input { padding-left: 36px; }

    .wm-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }

    /* --- Control segmentado con indicador deslizante (solo transform) ----- */
    .wm-seg { position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 3px; background: var(--seg-bg); border-radius: 12px; min-width: 176px; }
    .wm-seg::before {
      content: ""; position: absolute; top: 3px; bottom: 3px; left: 3px;
      width: calc(50% - 3px); border-radius: 9px; background: var(--surface);
      box-shadow: 0 1px 2px rgba(15, 18, 30, .14);
      transition: transform .38s var(--ease-out);
    }
    .wm-seg[data-value="favorites"]::before { transform: translateX(100%); }
    .wm-seg button {
      position: relative; z-index: 1; padding: 6px 12px;
      border: 0; border-radius: 9px; background: none; color: var(--muted);
      font: inherit; font-weight: 600; cursor: pointer;
      transition: color .2s ease;
    }
    .wm-seg button[aria-pressed="true"] { color: var(--ink); }

    /* --- Formulario de captura (plegable) --------------------------------- */
    .wm-collapse {
      display: grid; grid-template-rows: 0fr; opacity: 0;
      transition: grid-template-rows .45s var(--ease-out), opacity .25s ease;
    }
    .wm-collapse[data-open="true"] { grid-template-rows: 1fr; opacity: 1; }
    .wm-collapse-inner { min-height: 0; overflow: hidden; }
    .wm-capture { display: grid; gap: 12px; padding: 3px 3px 14px; }
    .wm-field { display: grid; gap: 5px; }
    .wm-field label { font-size: 12px; font-weight: 600; color: var(--muted); }
    .wm-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

    .wm-preview { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); }
    .wm-preview figcaption { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
    .wm-preview blockquote {
      margin: 0; font: 14px/1.55 var(--font-quote);
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden;
      white-space: pre-wrap; overflow-wrap: anywhere;
    }

    .wm-count { margin: 0 0 10px; font-size: 12px; color: var(--muted); }

    /* --- Lista y tarjetas ------------------------------------------------- */
    .wm-list { list-style: none; margin: 0; padding: 0; }

    /* El li colapsa con grid-template-rows al eliminarse (sin saltos de layout). */
    .wm-item {
      display: grid; grid-template-rows: 1fr;
      transition: grid-template-rows .32s var(--ease-out), opacity .22s ease;
    }
    .wm-item-inner { min-height: 0; padding-bottom: 10px; }
    .wm-item.is-leaving { grid-template-rows: 0fr; opacity: 0; }
    .wm-item.is-leaving .wm-item-inner { overflow: hidden; }

    .wm-item.is-entering { animation: wm-rise .5s var(--ease-out) backwards; animation-delay: calc(var(--i, 0) * 45ms); }
    .wm-item.is-fresh { animation: wm-drop .55s var(--ease-out) backwards; }

    .wm-card {
      position: relative; padding: 12px 14px 10px 17px;
      background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
      overflow-wrap: anywhere;
    }
    /* Banda de marcador: indica "favorito" y se dibuja con scaleY. */
    .wm-card::before {
      content: ""; position: absolute; left: 0; top: 12px; bottom: 12px; width: 4px;
      border-radius: 0 4px 4px 0; background: var(--stripe);
      transform: scaleY(0); transform-origin: top;
      transition: transform .5s var(--ease-out);
    }
    .wm-card.is-favorite::before { transform: scaleY(1); }
    /* Destello de la tarjeta nueva (solo opacity). */
    .wm-card::after {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      background: var(--marker); opacity: 0; pointer-events: none;
    }
    .is-fresh .wm-card::after { animation: wm-flash 1.3s ease-out; }

    .wm-meta { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 8px; font-size: 12px; color: var(--muted); }
    .wm-meta-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wm-meta time { flex: none; }

    .wm-quote { margin: 0; font: 15px/1.65 var(--font-quote); white-space: pre-wrap; max-width: 62ch; }
    .wm-card[data-clamped="true"] .wm-quote {
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; line-clamp: 6; overflow: hidden;
    }
    .wm-mark {
      padding: 0 .15em;
      background: linear-gradient(transparent 56%, var(--marker) 56%, var(--marker) 93%, transparent 93%);
      -webkit-box-decoration-break: clone; box-decoration-break: clone;
    }
    .wm-expand { margin: 4px 0 0 -8px; min-height: 28px; font-size: 12px; }

    .wm-note { margin: 10px 0 0; font-size: 13px; color: var(--muted); white-space: pre-wrap; max-width: 62ch; }

    .wm-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
    .wm-tag {
      padding: 2px 9px; border: 0; border-radius: 999px;
      background: var(--accent-soft); color: var(--accent);
      font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
      transition: transform .18s var(--ease-out), filter .18s ease;
    }
    .wm-tag:hover { filter: brightness(.95); transform: translateY(-1px); }
    .wm-tag:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .wm-actions { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 8px; }
    .wm-actions-end { display: flex; gap: 2px; }
    [data-action="favorite"] svg { transition: fill .25s ease, stroke .25s ease; }
    [data-action="favorite"][aria-pressed="true"] { color: var(--stripe); }
    [data-action="favorite"][aria-pressed="true"] svg { fill: var(--stripe); }
    [data-action="delete"]:hover { color: #d93025; }

    .wm-edit { display: grid; gap: 10px; margin-top: 10px; }

    .wm-empty { display: grid; gap: 4px; padding: 28px 12px; text-align: center; color: var(--muted); }
    .wm-empty strong { color: var(--ink); font-size: 15px; }
    .wm-more { display: flex; justify-content: center; }
    .wm-more:empty { display: none; }

    /* --- Pie -------------------------------------------------------------- */
    .wm-footer { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); background: var(--surface); }

    /* --- Botón flotante: abre el panel (aparece una sola vez con un pequeño rebote) --- */
    .wm-launcher {
      position: fixed; right: 18px; bottom: 18px;
      width: 46px; height: 46px; padding: 0;
      display: grid; place-items: center;
      border: 0; border-radius: 50%;
      background: var(--accent); color: var(--accent-ink);
      box-shadow: 0 6px 20px rgba(15, 18, 30, .3);
      cursor: pointer; opacity: .6;
      animation: wm-launcher-in .6s var(--ease-spring) .5s backwards;
      transition: opacity .2s ease, transform .4s var(--ease-spring), visibility 0s;
    }
    .wm-launcher:hover, .wm-launcher:focus-visible { opacity: 1; transform: scale(1.08); }
    .wm-launcher:active { transform: scale(.94); }
    .wm-launcher:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .wm-launcher[data-hidden="true"] {
      opacity: 0; visibility: hidden; transform: scale(.6); pointer-events: none;
      transition: opacity .15s ease, transform .25s var(--ease-out), visibility 0s linear .25s;
    }

    /* --- Aviso (toast) ---------------------------------------------------- */
    .wm-toast {
      position: absolute; left: 14px; right: 14px; bottom: 64px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 12px 10px 14px; border-radius: 12px;
      background: var(--ink); color: var(--paper);
      box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
      opacity: 0; visibility: hidden; transform: translate3d(0, 12px, 0) scale(.98);
      transition: opacity .2s ease, transform .35s var(--ease-spring), visibility 0s linear .35s;
    }
    .wm-toast[data-show="true"] {
      opacity: 1; visibility: visible; transform: none;
      transition: opacity .2s ease, transform .35s var(--ease-spring), visibility 0s;
    }
    .wm-toast[data-tone="error"] { box-shadow: inset 4px 0 0 #ff6b5e, 0 10px 30px rgba(0, 0, 0, .3); }
    .wm-toast .wm-btn { min-height: 30px; color: inherit; background: transparent; border-color: rgba(127, 127, 127, .55); }
    .wm-toast .wm-btn:hover { background: rgba(127, 127, 127, .25); }

    /* --- Keyframes -------------------------------------------------------- */
    @keyframes wm-launcher-in { from { opacity: 0; transform: scale(.5); } }
    @keyframes wm-rise  { from { opacity: 0; transform: translate3d(0, 10px, 0); } }
    @keyframes wm-drop  { from { opacity: 0; transform: translate3d(0, -14px, 0) scale(.98); } }
    @keyframes wm-flash { 0% { opacity: .85; } 100% { opacity: 0; } }

    @media (max-width: 480px) {
      .wm-panel { top: 8px; right: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); }
      .wm-toolbar { flex-direction: column; align-items: stretch; }
    }

    /* Respeta "reducir movimiento": elimina animaciones y transiciones. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important; animation-delay: 0s !important;
        transition-duration: .01ms !important; transition-delay: 0s !important;
      }
    }
  `;

  /* ==========================================================================
   * 7. CONSTRUCCIÓN DE LA INTERFAZ
   * ======================================================================== */

  const LOGO = `
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#4448d8"/>
      <rect x="6" y="13.6" width="20" height="6.2" rx="3.1" fill="#ffd54a"/>
      <path d="M9 10h14M9 23h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <path d="M9 16.7h14" stroke="#15171e" stroke-width="2" stroke-linecap="round"/>
    </svg>`;

  function buildUI() {
    // El Shadow DOM aísla el CSS de la página y el nuestro.
    const host = h('div', { id: HOST_ID });
    host.style.cssText =
      'position:fixed;z-index:2147483647;top:0;right:0;' +
      'width:0;height:0;overflow:visible;';
    const shadow = host.attachShadow({ mode: 'open' });

    const panel = h('section', {
      class: 'wm-panel',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'wm-title'
    });
    panel.inert = true; // cerrado: fuera del orden de tabulación y del árbol a11y

    panel.innerHTML = `
      <header class="wm-header">
        <div class="wm-brand">
          ${LOGO}
          <div>
            <h2 class="wm-title" id="wm-title">Web Memory</h2>
            <p class="wm-subtitle">${esc(t.subtitle)}</p>
          </div>
        </div>
        <button type="button" class="wm-btn wm-btn--icon" data-action="close"
          aria-label="${esc(t.close)}" title="${esc(t.close)}">${svg('x')}</button>
      </header>

      <div class="wm-body" data-role="body">
        <div class="wm-search">
          ${svg('search')}
          <input type="search" class="wm-input" data-role="search"
            placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"
            autocomplete="off" spellcheck="false">
        </div>

        <div class="wm-toolbar">
          <div class="wm-seg" role="group" aria-label="${esc(t.filterGroup)}"
            data-role="seg" data-value="all">
            <button type="button" data-action="filter" data-value="all"
              aria-pressed="true">${esc(t.all)}</button>
            <button type="button" data-action="filter" data-value="favorites"
              aria-pressed="false">${esc(t.favorites)}</button>
          </div>
          <button type="button" class="wm-btn wm-btn--primary" data-action="capture">
            ${svg('bookmark')}${esc(t.save)}
          </button>
        </div>

        <div class="wm-collapse" data-role="collapse" data-open="false" inert>
          <div class="wm-collapse-inner">
            <form class="wm-capture" data-role="capture-form" novalidate>
              <figure class="wm-preview">
                <figcaption>${esc(t.selectionPreview)}</figcaption>
                <blockquote data-role="quote"></blockquote>
              </figure>
              <div class="wm-field">
                <label for="wm-note">${esc(t.note)}</label>
                <textarea id="wm-note" class="wm-input wm-textarea" data-role="note"
                  maxlength="${MAX_NOTE}" rows="3"></textarea>
              </div>
              <div class="wm-field">
                <label for="wm-tags">${esc(t.tags)}</label>
                <input id="wm-tags" class="wm-input" data-role="tags"
                  maxlength="1200" autocomplete="off">
              </div>
              <div class="wm-form-actions">
                <button type="button" class="wm-btn" data-action="cancel-capture">${esc(t.cancel)}</button>
                <button type="submit" class="wm-btn wm-btn--primary">${esc(t.saveButton)}</button>
              </div>
            </form>
          </div>
        </div>

        <p class="wm-count" data-role="count" aria-live="polite"></p>
        <ul class="wm-list" data-role="list"></ul>
        <div class="wm-more" data-role="more"></div>
      </div>

      <footer class="wm-footer">
        <button type="button" class="wm-btn" data-action="export">${svg('download')}${esc(t.export)}</button>
        <button type="button" class="wm-btn" data-action="import">${svg('upload')}${esc(t.import)}</button>
        <input type="file" accept=".json,application/json" data-role="file" hidden>
      </footer>

      <div class="wm-toast" data-role="toast" role="status" aria-live="polite"
        data-show="false" inert></div>
    `;

    const launcher = h('button', {
      class: 'wm-launcher',
      type: 'button',
      title: t.open,
      'aria-label': t.open,
      'data-hidden': 'false',
      innerHTML: svg('bookmark')
    });

    shadow.append(h('style', { textContent: STYLES }), panel, launcher);
    (document.documentElement || document.body).appendChild(host);

    const $ = selector => panel.querySelector(selector);
    return {
      host, shadow, panel, launcher,
      body: $('[data-role="body"]'),
      searchInput: $('[data-role="search"]'),
      seg: $('[data-role="seg"]'),
      collapse: $('[data-role="collapse"]'),
      captureForm: $('[data-role="capture-form"]'),
      quote: $('[data-role="quote"]'),
      noteInput: $('[data-role="note"]'),
      tagsInput: $('[data-role="tags"]'),
      count: $('[data-role="count"]'),
      list: $('[data-role="list"]'),
      more: $('[data-role="more"]'),
      toast: $('[data-role="toast"]'),
      fileInput: $('[data-role="file"]'),
      captureButton: $('[data-action="capture"]')
    };
  }

  // Evita doble inyección (p. ej. si el gestor recarga el script).
  if (document.getElementById(HOST_ID) || window.top !== window.self) return;

  const ui = buildUI();

  /* ==========================================================================
   * 8. RENDER
   * ======================================================================== */

  const isOpen = () => ui.panel.classList.contains('open');

  function iconButton(iconName, label, action, id, extra = {}) {
    return h('button', {
      class: 'wm-btn wm-btn--icon',
      type: 'button',
      title: label,
      'aria-label': label,
      dataset: { action, id },
      ...extra
    }, icon(iconName));
  }

  /** Formulario de edición inline (nota + etiquetas) para una tarjeta. */
  function buildEditor(item) {
    const noteId = `wm-edit-note-${item.id}`;
    const tagsId = `wm-edit-tags-${item.id}`;
    return h('form', { class: 'wm-edit', dataset: { role: 'edit-form', id: item.id }, noValidate: true },
      h('div', { class: 'wm-field' },
        h('label', { htmlFor: noteId, text: t.note }),
        h('textarea', {
          id: noteId, name: 'note', class: 'wm-input wm-textarea',
          maxLength: MAX_NOTE, rows: 3, value: item.note
        })),
      h('div', { class: 'wm-field' },
        h('label', { htmlFor: tagsId, text: t.tags }),
        h('input', {
          id: tagsId, name: 'tags', class: 'wm-input', maxLength: 1200,
          autocomplete: 'off', value: item.tags.join(', ')
        })),
      h('div', { class: 'wm-form-actions' },
        h('button', { class: 'wm-btn', type: 'button', text: t.cancel, dataset: { action: 'cancel-edit' } }),
        h('button', { class: 'wm-btn wm-btn--primary', type: 'submit', text: t.saveChanges })));
  }

  function buildCard(item, index, { entrance }) {
    const isLong = item.text.length > CLAMP_CHARS;
    const isEditing = state.editingId === item.id;
    const isFresh = state.freshId === item.id;

    const card = h('article', {
      class: 'wm-card' + (item.favorite ? ' is-favorite' : ''),
      dataset: { clamped: String(isLong) }
    });

    card.append(
      h('div', { class: 'wm-meta' },
        h('span', { class: 'wm-meta-title', title: item.url, text: item.title || hostnameOf(item.url) }),
        h('time', { dateTime: new Date(item.createdAt).toISOString(), text: dateFormat.format(item.createdAt) })),
      h('p', { class: 'wm-quote' }, h('span', { class: 'wm-mark', text: item.text }))
    );

    if (isLong) {
      card.append(h('button', {
        class: 'wm-btn wm-btn--text wm-expand', type: 'button',
        text: t.showMore, 'aria-expanded': 'false', dataset: { action: 'expand' }
      }));
    }

    if (isEditing) {
      card.append(buildEditor(item));
    } else {
      if (item.note) card.append(h('p', { class: 'wm-note', text: item.note }));

      if (item.tags.length) {
        card.append(h('ul', { class: 'wm-tags' }, item.tags.map(tag =>
          h('li', {}, h('button', {
            class: 'wm-tag', type: 'button', text: tag,
            title: fmt(t.filterByTag, { tag }), dataset: { action: 'tag', tag }
          })))));
      }

      const label = item.favorite ? t.unfavorite : t.favorite;
      card.append(h('div', { class: 'wm-actions' },
        h('button', { class: 'wm-btn wm-btn--text', type: 'button', dataset: { action: 'source', id: item.id } },
          icon('external'), t.source),
        h('div', { class: 'wm-actions-end' },
          iconButton('star', label, 'favorite', item.id, { 'aria-pressed': String(item.favorite) }),
          iconButton('pencil', t.edit, 'edit', item.id),
          iconButton('trash', t.delete, 'delete', item.id))));
    }

    const classes = ['wm-item'];
    if (isFresh) classes.push('is-fresh');
    else if (entrance && index < STAGGER_MAX) classes.push('is-entering');

    const li = h('li', { class: classes.join(' '), dataset: { id: item.id } },
      h('div', { class: 'wm-item-inner' }, card));
    li.style.setProperty('--i', index);
    return li;
  }

  function render() {
    const filtered = getFiltered();
    const visible = filtered.slice(0, state.visibleCount);
    const entrance = state.entrance;

    // Estado del filtro
    ui.seg.dataset.value = state.filter;
    for (const button of ui.seg.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.value === state.filter));
    }

    ui.count.textContent = state.memories.length
      ? fmt(t.count, { filtered: filtered.length, total: state.memories.length })
      : '';

    // Lista
    if (!visible.length) {
      const hasAny = state.memories.length > 0;
      ui.list.replaceChildren(h('li', { class: 'wm-empty' },
        h('strong', { text: hasAny ? t.noResults : t.empty }),
        hasAny ? null : h('span', { text: t.emptyHint })));
    } else {
      ui.list.replaceChildren(...visible.map((item, index) =>
        buildCard(item, index, { entrance })));
    }

    // "Mostrar más" (paginación para colecciones grandes)
    const remaining = filtered.length - visible.length;
    ui.more.replaceChildren(remaining > 0
      ? h('button', {
          class: 'wm-btn', type: 'button', dataset: { action: 'more' },
          text: fmt(t.loadMore, { n: Math.min(PAGE_SIZE, remaining) })
        })
      : '');

    state.entrance = false;
    state.freshId = null;
  }

  /* --- Aviso temporal (toast) con acción opcional --------------------------- */

  let toastTimer = 0;

  function hideToast() {
    clearTimeout(toastTimer);
    ui.toast.dataset.show = 'false';
    ui.toast.inert = true;
  }

  function toast(message, { tone = 'info', action = null, duration = TOAST_MS } = {}) {
    clearTimeout(toastTimer);
    ui.toast.replaceChildren(h('span', { text: message }));
    if (action) {
      ui.toast.append(h('button', {
        class: 'wm-btn', type: 'button', text: action.label,
        onclick: () => { hideToast(); action.run(); }
      }));
    }
    ui.toast.dataset.tone = tone;
    ui.toast.dataset.show = 'true';
    ui.toast.inert = false;
    toastTimer = setTimeout(hideToast, duration);
  }

  /* --- Animaciones auxiliares ----------------------------------------------- */

  /** Colapsa una tarjeta y resuelve la promesa al terminar (o de inmediato si el usuario prefiere reducir el movimiento). */
  function leave(item) {
    if (!item || prefersReducedMotion()) return Promise.resolve();
    return new Promise(resolve => {
      item.classList.add('is-leaving');
      const finish = () => resolve();
      item.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 450); // red de seguridad
    });
  }

  function pop(element) {
    if (!element || prefersReducedMotion() || !element.animate) return;
    element.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }
    );
  }

  /* ==========================================================================
   * 9. ACCIONES
   * ======================================================================== */

  /* --- Panel ---------------------------------------------------------------- */

  function openPanel({ capture = false, fromLauncher = false } = {}) {
    if (isOpen()) {
      if (capture) startCapture();
      return;
    }
    // Se guarda la selección ahora: al enfocar el panel la página puede perderla.
    state.snapshot = readSelection();
    state.lastFocused = document.activeElement;
    state.entrance = true;
    state.fromLauncher = fromLauncher;

    ui.panel.inert = false;
    ui.panel.classList.add('open');
    syncLauncher();
    render();

    if (capture) startCapture();
    else ui.searchInput.focus({ preventScroll: true });
  }

  function closePanel() {
    ui.panel.classList.remove('open');
    ui.panel.inert = true;
    setCaptureOpen(false);
    hideToast();
    state.editingId = null;
    state.snapshot = '';
    state.pendingText = '';

    syncLauncher();

    const previous = state.lastFocused;
    state.lastFocused = null;
    if (previous && previous.id !== HOST_ID && document.contains(previous)) {
      previous.focus({ preventScroll: true });
    } else if (state.fromLauncher && state.launcherVisible) {
      ui.launcher.focus({ preventScroll: true }); // vuelve al botón que lo abrió
    }
    state.fromLauncher = false;
  }

  /** Cierra la capa superior: edición → formulario de captura → panel. */
  function dismissTopLayer() {
    if (state.editingId) return cancelEdit();
    if (ui.collapse.dataset.open === 'true') return cancelCapture();
    closePanel();
  }

  /* --- Botón flotante --------------------------------------------------------- */

  /** Oculta el botón mientras el panel está abierto o si el usuario lo desactivó. */
  function syncLauncher() {
    const hidden = !state.launcherVisible || isOpen();
    ui.launcher.dataset.hidden = String(hidden);
    ui.launcher.inert = hidden;
  }

  function toggleLauncher() {
    state.launcherVisible = !state.launcherVisible;
    try {
      GM_setValue(LAUNCHER_KEY, state.launcherVisible);
    } catch (error) {
      console.error('[Web Memory] Storage error:', error);
    }
    syncLauncher();
  }

  /* --- Filtros y búsqueda ----------------------------------------------------- */

  function setFilter(value) {
    state.filter = value === 'favorites' ? 'favorites' : 'all';
    state.visibleCount = PAGE_SIZE;
    render();
  }

  function setQuery(value) {
    state.query = value;
    state.visibleCount = PAGE_SIZE;
    render();
  }

  /* --- Captura ---------------------------------------------------------------- */

  function setCaptureOpen(open) {
    ui.collapse.dataset.open = String(open);
    ui.collapse.inert = !open;
  }

  function startCapture() {
    const text = readSelection() || state.snapshot;
    if (!text) {
      toast(t.emptySelection, { tone: 'error', duration: 4500 });
      return;
    }
    state.pendingText = text;
    ui.quote.textContent = text;
    ui.noteInput.value = '';
    ui.tagsInput.value = '';
    setCaptureOpen(true);
    ui.noteInput.focus({ preventScroll: true });
  }

  function cancelCapture() {
    setCaptureOpen(false);
    state.pendingText = '';
    ui.captureButton.focus({ preventScroll: true });
  }

  function saveCapture() {
    const text = state.pendingText;
    if (!text) return toast(t.emptySelection, { tone: 'error' });
    if (isDuplicate(text, location.href)) return toast(t.duplicate, { tone: 'error' });
    if (state.memories.length >= MAX_ITEMS) {
      return toast(fmt(t.importLimit, { max: MAX_ITEMS }), { tone: 'error' });
    }

    const now = Date.now();
    const item = {
      id: makeId(),
      text: cleanText(text, MAX_TEXT),
      note: cleanText(ui.noteInput.value, MAX_NOTE),
      tags: cleanTags(ui.tagsInput.value),
      title: cleanText(document.title, MAX_TITLE),
      url: location.href,
      createdAt: now,
      updatedAt: now,
      favorite: false
    };

    state.memories.unshift(item);
    if (!persist()) {
      state.memories.shift();
      return;
    }

    // Se limpian los filtros para que la tarjeta nueva siempre sea visible.
    state.filter = 'all';
    state.query = '';
    ui.searchInput.value = '';
    state.visibleCount = PAGE_SIZE;
    state.freshId = item.id;
    state.pendingText = '';

    setCaptureOpen(false);
    render();
    ui.body.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    toast(t.saved);
  }

  /* --- Edición inline ----------------------------------------------------------- */

  function startEdit(id) {
    state.editingId = id;
    render();
    const textarea = ui.list.querySelector(`[data-id="${CSS.escape(id)}"] textarea`);
    if (textarea) textarea.focus({ preventScroll: true });
  }

  function cancelEdit() {
    const id = state.editingId;
    state.editingId = null;
    render();
    // Devuelve el foco al botón de edición de la misma tarjeta.
    const button = ui.list.querySelector(
      `[data-id="${CSS.escape(id)}"] [data-action="edit"]`);
    if (button) button.focus({ preventScroll: true });
  }

  function saveEdit(id, form) {
    const item = findMemory(id);
    if (!item) return cancelEdit();

    const previous = { note: item.note, tags: item.tags, updatedAt: item.updatedAt };
    item.note = cleanText(form.elements.note.value, MAX_NOTE);
    item.tags = cleanTags(form.elements.tags.value);
    item.updatedAt = Date.now();
    haystacks.delete(item); // invalida el índice de búsqueda

    if (!persist()) {
      Object.assign(item, previous);
      haystacks.delete(item);
      return;
    }

    state.editingId = null;
    render();
    toast(t.updated);
  }

  /* --- Favoritos, borrado y deshacer ---------------------------------------------- */

  async function toggleFavorite(id, button) {
    const item = findMemory(id);
    if (!item) return;

    const previousUpdatedAt = item.updatedAt;
    item.favorite = !item.favorite;
    item.updatedAt = Date.now();
    if (!persist()) {
      item.favorite = !item.favorite;
      item.updatedAt = previousUpdatedAt;
      return;
    }

    const li = button.closest('.wm-item');

    // En la vista "Favoritos", al quitarlo la tarjeta sale de la lista.
    if (state.filter === 'favorites' && !item.favorite) {
      await leave(li);
      render();
      return;
    }

    // Actualización in situ: sin re-render, para que la animación sea continua.
    button.setAttribute('aria-pressed', String(item.favorite));
    const label = item.favorite ? t.unfavorite : t.favorite;
    button.title = label;
    button.setAttribute('aria-label', label);
    li.querySelector('.wm-card').classList.toggle('is-favorite', item.favorite);
    if (item.favorite) pop(button.firstElementChild);
  }

  async function removeMemory(id, button) {
    const index = state.memories.findIndex(item => item.id === id);
    if (index === -1) return;

    await leave(button.closest('.wm-item'));

    const [item] = state.memories.splice(index, 1);
    if (!persist()) {
      state.memories.splice(index, 0, item);
      render();
      return;
    }

    render();
    toast(t.deleted, {
      duration: UNDO_MS,
      action: { label: t.undo, run: () => restoreMemory(item, index) }
    });
  }

  function restoreMemory(item, index) {
    state.memories.splice(Math.min(index, state.memories.length), 0, item);
    if (!persist()) {
      state.memories = state.memories.filter(entry => entry.id !== item.id);
      return;
    }
    state.freshId = item.id;
    render();
  }

  function openSource(id) {
    const item = findMemory(id);
    const url = item && parseHttpUrl(item.url);
    if (!url) return toast(t.invalidUrl, { tone: 'error' });
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }

  function toggleExpand(button) {
    const card = button.closest('.wm-card');
    const expanded = card.dataset.clamped === 'true';
    card.dataset.clamped = String(!expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? t.showLess : t.showMore;
  }

  /* --- Exportar / importar --------------------------------------------------------- */

  function downloadJSON() {
    const backup = {
      app: 'Web Memory',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      memories: state.memories
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)],
      { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = h('a', {
      href: url,
      download: `web-memory-${new Date().toISOString().slice(0, 10)}.json`
    });
    anchor.style.display = 'none';
    ui.shadow.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJSON(file) {
    if (!file || file.size > MAX_IMPORT_BYTES) {
      return toast(t.importError, { tone: 'error' });
    }

    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.memories) ? parsed.memories : null;
      if (!incoming) throw new Error('Missing memories array');

      const considered = incoming.slice(0, MAX_ITEMS);
      const seen = new Set(state.memories.map(dedupeKey));
      const additions = [];
      let validCount = 0;
      let limitReached = false;

      for (const raw of considered) {
        const item = sanitizeItem(raw);
        if (!item) continue;
        validCount++;

        const key = dedupeKey(item);
        if (seen.has(key)) continue;

        if (state.memories.length + additions.length >= MAX_ITEMS) {
          limitReached = true;
          break;
        }
        seen.add(key);
        additions.push(item);
      }

      if (!validCount) return toast(t.emptyFile, { tone: 'error' });

      const previous = state.memories;
      state.memories = [...additions, ...previous].sort(byNewest);
      if (!persist()) {
        state.memories = previous;
        return;
      }

      state.visibleCount = PAGE_SIZE;
      render();
      toast(
        limitReached
          ? fmt(t.importLimit, { max: MAX_ITEMS })
          : fmt(t.importDone, { added: additions.length, skipped: considered.length - additions.length }),
        { tone: limitReached ? 'error' : 'info' }
      );
    } catch (error) {
      console.error('[Web Memory] Import error:', error);
      toast(t.importError, { tone: 'error' });
    } finally {
      ui.fileInput.value = '';
    }
  }

  /* ==========================================================================
   * 10. EVENTOS Y ATAJOS
   * ======================================================================== */

  /** Mapa acción → manejador. Los botones declaran data-action="...". */
  const ACTIONS = {
    close: () => closePanel(),
    capture: () => startCapture(),
    'cancel-capture': () => cancelCapture(),
    filter: ({ value }) => setFilter(value),
    export: () => downloadJSON(),
    import: () => ui.fileInput.click(),
    source: ({ id }) => openSource(id),
    favorite: ({ id, target }) => toggleFavorite(id, target),
    edit: ({ id }) => startEdit(id),
    'cancel-edit': () => cancelEdit(),
    delete: ({ id, target }) => removeMemory(id, target),
    expand: ({ target }) => toggleExpand(target),
    more: () => { state.visibleCount += PAGE_SIZE; render(); },
    tag: ({ tag }) => {
      ui.searchInput.value = tag;
      setQuery(tag);
    }
  };

  // Delegación de clics: un solo listener para todo el panel.
  ui.panel.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const handler = ACTIONS[target.dataset.action];
    if (handler) handler({ ...target.dataset, target });
  });

  // Formularios (captura y edición inline).
  ui.panel.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form === ui.captureForm) saveCapture();
    else if (form.dataset.role === 'edit-form') saveEdit(form.dataset.id, form);
  });

  ui.searchInput.addEventListener('input',
    debounce(() => setQuery(ui.searchInput.value), SEARCH_DEBOUNCE_MS));

  ui.fileInput.addEventListener('change', () => {
    const file = ui.fileInput.files && ui.fileInput.files[0];
    if (file) importJSON(file);
  });

  // Botón flotante. Con mousedown evitamos que el clic deseleccione el texto de la página.
  ui.launcher.addEventListener('mousedown', event => event.preventDefault());
  ui.launcher.addEventListener('click', () => openPanel({ fromLauncher: true }));

  /** Atajos globales: Alt + Shift + M (abrir o cerrar) y Alt + Shift + S (guardar la selección). */
  function handleShortcut(event) {
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat) {
      return false;
    }
    if (event.code === 'KeyM') {
      event.preventDefault();
      if (isOpen()) closePanel(); else openPanel();
      return true;
    }
    if (event.code === 'KeyS') {
      event.preventDefault();
      openPanel({ capture: true });
      return true;
    }
    return false;
  }

  // Teclado dentro del panel: no se propaga a la página (evita atajos de la web).
  ui.panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (handleShortcut(event)) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      dismissTopLayer();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const form = event.target.closest && event.target.closest('form');
      if (form) {
        event.preventDefault();
        form.requestSubmit();
      }
    }
  });
  ui.panel.addEventListener('keyup', event => event.stopPropagation());
  ui.panel.addEventListener('keypress', event => event.stopPropagation());

  // Teclado fuera del panel. Se escucha en la fase de captura para que funcione
  // aunque la web intercepte los eventos. Se ignoran los que vienen del propio panel.
  document.addEventListener('keydown', event => {
    if (event.composedPath().includes(ui.host)) return;
    if (handleShortcut(event)) return;
    if (event.key === 'Escape' && isOpen()) closePanel();
  }, true);

  // Sincronización entre pestañas: si otra pestaña modifica los datos, se recargan.
  if (typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(STORAGE_KEY, (_name, _old, newValue, remote) => {
      if (!remote) return;
      state.memories = sanitizeList(newValue);
      if (isOpen()) render();
    });
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(t.open, () => openPanel());
    GM_registerMenuCommand(t.menuSave, () => openPanel({ capture: true }));
    GM_registerMenuCommand(t.launcherToggle, toggleLauncher);
  }

  /* ==========================================================================
   * 11. ARRANQUE
   * ======================================================================== */

  syncLauncher();
  console.info('[Web Memory] Ready. Alt + Shift + M: open. Alt + Shift + S: save selection.');
})();
