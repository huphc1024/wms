import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useLocale } from '../i18n/locale.jsx';

const ATTRS = ['placeholder', 'title', 'aria-label'];

/**
 * Keep Vietnamese labels in `.content` by translating exact dictionary
 * phrases whenever React rewrites the DOM.
 */
export default function ContentTranslator({ rootSelector = '.content' }) {
  const { locale, tx } = useLocale();
  const location = useLocation();
  const busy = useRef(false);

  useEffect(() => {
    if (locale !== 'vi') return undefined;

    function translateNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const raw = node.nodeValue;
        if (!raw || !raw.trim()) return;
        const trimmed = raw.trim();
        const translated = tx(trimmed);
        if (translated !== trimmed) {
          node.nodeValue = raw.replace(trimmed, translated);
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      for (const attr of ATTRS) {
        if (!el.hasAttribute(attr)) continue;
        const v = el.getAttribute(attr);
        if (!v) continue;
        const tv = tx(v);
        if (tv !== v) el.setAttribute(attr, tv);
      }
      for (const child of [...el.childNodes]) {
        translateNode(child);
      }
    }

    function run() {
      if (busy.current) return;
      const root = document.querySelector(rootSelector);
      if (!root) return;
      busy.current = true;
      try {
        translateNode(root);
      } finally {
        // Allow React paint to finish before accepting more mutations
        requestAnimationFrame(() => {
          busy.current = false;
        });
      }
    }

    run();
    const root = document.querySelector(rootSelector);
    if (!root) return undefined;

    let scheduled = null;
    const obs = new MutationObserver(() => {
      if (busy.current) return;
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = null;
        run();
      });
    });
    obs.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });

    return () => {
      obs.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
    };
  }, [locale, tx, location.pathname, location.search, rootSelector]);

  return null;
}
