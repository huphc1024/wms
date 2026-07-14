import { Children, cloneElement, isValidElement } from 'react';

const ATTRS = ['placeholder', 'title', 'aria-label', 'ariaLabel', 'alt', 'label'];

/**
 * Deep-clone a React node tree, translating string leaves and common
 * string props via `tx`. Skips <option value> codes when children look
 * like status/API codes only if needed — we still translate option labels.
 */
export function translateTree(node, tx) {
  if (node == null || typeof node === 'boolean') return node;
  if (typeof node === 'string' || typeof node === 'number') {
    const s = String(node);
    // Keep pure numbers / empty / already-translated short tokens alone
    if (s.trim() === '' || /^[\d.,:%+\-/\s]+$/.test(s)) return node;
    return tx(s);
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) => translateTree(child, tx));
  }
  if (!isValidElement(node)) return node;

  // Don't rewrite SVG / script / style internals beyond text
  const type = node.type;
  if (type === 'script' || type === 'style') return node;

  const props = node.props || {};
  const next = {};
  let changed = false;

  for (const key of ATTRS) {
    if (typeof props[key] === 'string') {
      const translated = tx(props[key]);
      if (translated !== props[key]) {
        next[key] = translated;
        changed = true;
      }
    }
  }

  if (props.children !== undefined) {
    const kids = translateTree(props.children, tx);
    if (kids !== props.children) {
      next.children = kids;
      changed = true;
    }
  }

  return changed ? cloneElement(node, next) : node;
}
