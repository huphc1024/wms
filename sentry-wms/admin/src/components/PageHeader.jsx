import { useLocale } from '../i18n/locale.jsx';
import { translateTree } from '../i18n/translateTree.jsx';

export default function PageHeader({ title, children }) {
  const { tx } = useLocale();
  return (
    <div className="page-header">
      <h1>{tx(title)}</h1>
      <div className="page-header-actions">{translateTree(children, tx)}</div>
    </div>
  );
}
