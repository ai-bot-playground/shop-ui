import { useEffect, useState } from 'react';

const API = '/api';
const TERMINAL = ['CONFIRMED', 'REJECTED', 'CANCELLED'];
const USER_ID_KEY = 'shop-user-id';

const STATUS_LABEL = {
  PENDING: 'Przetwarzanie…',
  RESERVED: 'Zarezerwowano, płatność…',
  CONFIRMED: '✅ Zakup udany',
  REJECTED: '❌ Brak towaru',
  CANCELLED: '❌ Płatność nieudana',
  ERROR: '⚠️ Błąd zamówienia',
};

function getUserId() {
  return localStorage.getItem(USER_ID_KEY);
}

function setUserId(id) {
  localStorage.setItem(USER_ID_KEY, id);
}

function clearUserId() {
  localStorage.removeItem(USER_ID_KEY);
}

function authHeaders(extra = {}) {
  const userId = getUserId();
  const headers = { ...extra };
  if (userId) {
    headers['X-User-Id'] = userId;
  }
  return headers;
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [availability, setAvailability] = useState({});
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null); // product being purchased (button lock)
  const [order, setOrder] = useState(null); // { orderId, productId, status }
  const [userId, setUserIdState] = useState(getUserId());

  // A terminal order invalidates the displayed stock, including releases
  // after a rejected or cancelled purchase.
  const terminalOrderId = order && TERMINAL.includes(order.status)
    ? order.orderId
    : null;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setProducts([]);
    setError(null);
    fetch(`${API}/products?size=50`, { headers: authHeaders(), signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Product request failed');
        return r.json();
      })
      .then((d) => {
        if (active) setProducts(d.content ?? []);
      })
      .catch(() => {
        if (active) setError('Nie udało się pobrać produktów.');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [userId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const ids = [...new Set(products.map((p) => String(p.id)))];
    const headers = authHeaders();
    let next = 0;
    setAvailability(Object.fromEntries(ids.map((id) => [id, { status: 'loading' }])));

    async function loadAvailability() {
      while (active && next < ids.length) {
        const id = ids[next++];
        try {
          const response = await fetch(`${API}/inventory/${encodeURIComponent(id)}`, {
            headers,
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('Inventory request failed');
          const data = await response.json();
          if (!Number.isInteger(data.available) || data.available < 0) {
            throw new Error('Invalid availability');
          }
          if (active) {
            setAvailability((current) => ({
              ...current,
              [id]: { status: 'loaded', available: data.available },
            }));
          }
        } catch {
          if (active) {
            setAvailability((current) => ({
              ...current,
              [id]: { status: 'error' },
            }));
          }
        }
      }
    }

    for (let i = 0; i < Math.min(4, ids.length); i++) {
      loadAvailability();
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [products, terminalOrderId]);

  function login() {
    const id = crypto.randomUUID();
    setUserId(id);
    setUserIdState(id);
  }

  function logout() {
    clearUserId();
    setUserIdState(null);
  }

  async function buy(product) {
    if (busyId !== null) return; // guard against double submit
    setBusyId(product.id);
    setOrder({ productId: product.id, status: 'PENDING' });

    // one idempotency key per logical purchase; reused on retry
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await fetch(`${API}/orders`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify({ productId: String(product.id), quantity: 1 }),
      });
      if (!res.ok) throw new Error('Order request failed');
      const created = await res.json();
      const status = created.status ?? 'PENDING';
      setOrder({ orderId: created.orderId, productId: product.id, status });
      if (TERMINAL.includes(status)) {
        setBusyId(null);
      } else {
        pollStatus(created.orderId, product.id);
      }
    } catch {
      setOrder({ productId: product.id, status: 'ERROR' });
      setBusyId(null);
    }
  }

  function pollStatus(orderId, productId) {
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const r = await fetch(`${API}/orders/${orderId}`, { headers: authHeaders() });
        if (!r.ok) throw new Error('Order status request failed');
        const o = await r.json();
        setOrder({ orderId, productId, status: o.status });
        if (TERMINAL.includes(o.status)) {
          clearInterval(timer);
          setBusyId(null);
        }
      } catch {
        clearInterval(timer);
        setBusyId(null);
      } finally {
        polling = false;
      }
    }, 1000);
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>shop — flash sale</h1>
        {userId ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Zalogowany: {userId.slice(0, 8)}
            </span>
            <button onClick={logout}>Wyloguj</button>
          </div>
        ) : (
          <button onClick={login}>Zaloguj</button>
        )}
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!userId && (
        <p data-testid="login-hint" style={{ color: '#6b7280' }}>Zaloguj się, aby kupować.</p>
      )}

      {order && (
        <div style={{ padding: '0.75rem 1rem', margin: '1rem 0', background: '#f3f4f6', borderRadius: 8 }}>
          Zamówienie {order.orderId ? `#${order.orderId.slice(0, 8)}` : ''}:{' '}
          <strong>{STATUS_LABEL[order.status] ?? order.status}</strong>
        </div>
      )}

      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
        Dostępność jest orientacyjna i nie gwarantuje rezerwacji. Stan może zmienić się podczas zakupu.
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {products.map((p) => (
          <li
            key={p.id}
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 0', borderBottom: '1px solid #e5e7eb' }}
          >
            <span style={{ flex: 1 }}>
              <strong>{p.name}</strong>
              {p.description ? <em style={{ color: '#6b7280' }}> — {p.description}</em> : null}
              <span style={{ display: 'block', color: '#6b7280', fontSize: '0.85rem' }}>
                {availability[p.id]?.status === 'loaded'
                  ? availability[p.id].available > 0
                    ? `Dostępne: ${availability[p.id].available} szt.`
                    : 'Brak w magazynie'
                  : availability[p.id]?.status === 'error'
                    ? 'Nie udało się pobrać dostępności.'
                    : 'Ładowanie dostępności…'}
              </span>
            </span>
            <span style={{ width: 90, textAlign: 'right' }}>{p.price} zł</span>
            <button onClick={() => buy(p)} disabled={busyId !== null || !userId} title={!userId ? 'Zaloguj się, aby kupować' : ''}>
              {busyId === p.id ? 'Kupowanie…' : 'Kup'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
