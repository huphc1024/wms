import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../i18n/locale.jsx';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('../api.js', () => ({
  api: {
    get: (...args) => getMock(...args),
    post: (...args) => postMock(...args),
  },
}));
vi.mock('../warehouse.jsx', () => ({
  useWarehouse: () => ({
    warehouseId: 1,
    warehouse: { warehouse_id: 1, warehouse_code: 'WH-01' },
  }),
}));

import Expiry from '../pages/Expiry.jsx';

const ok = (body) => Promise.resolve({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

function renderPage() {
  return render(
    <LocaleProvider>
      <Expiry />
    </LocaleProvider>,
  );
}

describe('Expiry dashboard', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    getMock.mockImplementation((path) => (
      path.startsWith('/expiry/near')
        ? ok({ near_expiry: [{
          pallet_id: 11, pallet_code: 'PLT-11', sku: 'SKU-A',
          bin_id: 3, quantity: 2, expiry_date: '2026-07-30',
        }] })
        : ok({ expired: [{
          pallet_id: 12, pallet_code: 'PLT-12', sku: 'SKU-B',
          bin_id: 4, quantity: 1, expiry_date: '2026-07-20',
        }] })
    ));
    postMock.mockImplementation(() => ok({ message: 'Đã cập nhật' }));
  });

  it('renders KPI counts and expiry states', async () => {
    const view = renderPage();
    await view.findByText('PLT-11');
    expect(view.getByText('PLT-12')).toBeInTheDocument();
    expect(view.getByText('Sắp hết hạn (14 ngày)')).toBeInTheDocument();
    expect(view.getByText('Đã quá hạn')).toBeInTheDocument();
  });

  it('confirms and disposes selected pallets in bulk', async () => {
    const view = renderPage();
    await view.findByText('PLT-12');
    fireEvent.click(view.getByRole('checkbox', { name: 'Chọn PLT-12' }));
    fireEvent.click(view.getByRole('button', { name: 'Tiêu hủy đã chọn' }));
    expect(view.getByText('Xác nhận tiêu hủy')).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/expiry/dispose', { pallet_ids: [12] });
    });
  });

  it('extends selected pallets with one bulk request', async () => {
    const view = renderPage();
    await view.findByText('PLT-11');
    fireEvent.click(view.getByRole('checkbox', { name: 'Chọn PLT-11' }));
    fireEvent.change(view.getByLabelText('Ngày hết hạn mới'), {
      target: { value: '2026-12-31' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Gia hạn đã chọn' }));
    fireEvent.click(view.getByRole('button', { name: 'Gia hạn' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/expiry/extend', {
        pallet_ids: [11],
        expiry_date: '2026-12-31',
      });
    });
  });
});
