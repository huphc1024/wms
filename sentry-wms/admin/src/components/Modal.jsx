import { useLocale } from '../i18n/locale.jsx';
import { translateTree } from '../i18n/translateTree.jsx';

export default function Modal({ title, onClose, children, footer, size }) {
  const { tx } = useLocale();
  const className = size ? `modal modal-${size}` : 'modal';
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={className} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tx(title)}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">{translateTree(children, tx)}</div>
        {footer && <div className="modal-footer">{translateTree(footer, tx)}</div>}
      </div>
    </div>
  );
}
