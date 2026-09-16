import { PATH_STYLES } from './layoutUtils.js';

export default function LayoutEditorToolbar({
  editMode,
  canEdit,
  activeTool,
  dirty,
  saving,
  saveWarnings,
  onToggleEdit,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDiscard,
  onSave,
  onAddPathPointHint,
}) {
  return (
    <div className="sim2-layout-toolbar">
      <div className="sim2-layout-toolbar-group">
        {canEdit ? (
          <button
            type="button"
            className={`btn btn-sm ${editMode ? 'btn-primary' : ''}`}
            onClick={onToggleEdit}
          >
            {editMode ? 'Xong chỉnh sửa' : 'Chỉnh sửa sơ đồ'}
          </button>
        ) : (
          <span className="sim2-layout-readonly">Chỉ xem · cần quyền warehouse-map-edit để sửa</span>
        )}
        {editMode && (
          <>
            <button type="button" className={`btn btn-sm ${activeTool === 'select' ? 'btn-primary' : ''}`} onClick={() => onToolChange('select')}>
              Chọn / kéo
            </button>
            <button type="button" className={`btn btn-sm ${activeTool === 'pan' ? 'btn-primary' : ''}`} onClick={() => onToolChange('pan')}>
              Di chuyển map
            </button>
            <button type="button" className={`btn btn-sm ${activeTool === 'add-zone' ? 'btn-primary' : ''}`} onClick={() => onToolChange('add-zone')}>
              + Khu (block)
            </button>
            <button type="button" className={`btn btn-sm ${activeTool === 'add-rack' ? 'btn-primary' : ''}`} onClick={() => onToolChange('add-rack')}>
              + Kệ
            </button>
            <button type="button" className={`btn btn-sm ${activeTool === 'forklift' ? 'btn-primary' : ''}`} onClick={() => onToolChange('forklift')}>
              {PATH_STYLES.FORKLIFT.label}
            </button>
            <button type="button" className={`btn btn-sm ${activeTool === 'pedestrian' ? 'btn-primary' : ''}`} onClick={() => onToolChange('pedestrian')}>
              {PATH_STYLES.PEDESTRIAN.label}
            </button>
          </>
        )}
      </div>
      {editMode && (
        <div className="sim2-layout-toolbar-group">
          <button type="button" className="btn btn-sm" onClick={onUndo} disabled={!canUndo}>Undo</button>
          <button type="button" className="btn btn-sm" onClick={onRedo} disabled={!canRedo}>Redo</button>
          <button type="button" className="btn btn-sm" onClick={onDiscard} disabled={!dirty}>Hủy thay đổi</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onSave} disabled={saving || !dirty}>
            {saving ? 'Đang lưu...' : 'Lưu sơ đồ'}
          </button>
        </div>
      )}
      {editMode && activeTool === 'select' && (
        <p className="sim2-layout-toolbar-hint">
          Chọn khu hoặc kệ — kéo thân để di chuyển, kéo góc/cạnh khung để đổi kích thước.
        </p>
      )}
      {editMode && activeTool !== 'select' && (
        <p className="sim2-layout-toolbar-hint">{onAddPathPointHint}</p>
      )}
      {saveWarnings?.length > 0 && (
        <div className="sim2-layout-warnings">
          {saveWarnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LayoutLegend() {
  return (
    <>
      <span className="sim2-legend-item"><span className="sim2-line blue" /> {PATH_STYLES.FORKLIFT.label}</span>
      <span className="sim2-legend-item"><span className="sim2-line green" /> {PATH_STYLES.PEDESTRIAN.label}</span>
    </>
  );
}
