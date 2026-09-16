export const NEAR_EXPIRY_DAYS = 14;

export function getExpiryStatus(expiryDate, today = new Date()) {
  if (!expiryDate) return null;
  const target = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const daysRemaining = Math.round((target.getTime() - start.getTime()) / 86400000);
  if (daysRemaining < 0) {
    return {
      level: 'expired',
      daysRemaining,
      label: `QUÁ HẠN ${Math.abs(daysRemaining)} NGÀY`,
    };
  }
  if (daysRemaining <= NEAR_EXPIRY_DAYS) {
    return {
      level: 'near',
      daysRemaining,
      label: daysRemaining === 0 ? 'HẾT HẠN HÔM NAY' : `CÒN ${daysRemaining} NGÀY`,
    };
  }
  return { level: 'ok', daysRemaining, label: `CÒN ${daysRemaining} NGÀY` };
}

export function getMostUrgentExpiry(records = [], today = new Date()) {
  return records.reduce((urgent, record) => {
    const status = getExpiryStatus(record?.expiry_date, today);
    if (!status) return urgent;
    if (!urgent || status.daysRemaining < urgent.daysRemaining) return status;
    return urgent;
  }, null);
}
