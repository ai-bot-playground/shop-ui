import { useEffect, useState } from 'react';

const API = '/api';
const TERMINAL = ['CONFIRMED', 'REJECTED', 'CANCELLED'];

const STATUS_LABEL = {
  PENDING: 'Przetwarzanie…',
  RESERVED: 'Zarezerwowano, płatność…',
  CONFIRMED: '✅ Zakup udany',
  REJECTED: '❌ Brak towaru',
  CANCELLED: '❌ Płatność nieudana',
  ERROR: '⚠️ Błąd zamówienia',
};

export default function App() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null); // product being purchased (button lock)
  const [order, setOrder] = useState(null); // { orderId, productId, status }
  const [user, setUser] = useState(null); // { username } or null
  const [loginName, setLoginName] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  async function loadProducts() {
    try {
      const r = await fetch(`${API}/products?size=50`, { credentials: 'include' });
      const d = await r.json();
      setProducts(d.content ?? []);
      setError(null);
    } catch {
      setError('Nie udało się pobrać produktów.');
    }
  }

  async function checkSession() {
    try {
      const r = await fetch(`${API}/session`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        if (d.username) setUser({ username: d.username });
      }
    } catch {
      // ignore — not logged in
    }
  }

  useEffect(() => {
    checkSession().then(() => loadProducts());
  }, []);

  async function login(e) {
    e.preventDefault();
    const username = loginName.trim();
    if (!username || loginBusy) return;
    setLoginBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error('Login failed');
      const d = await res.json();
      setUser({ username: d.username ?? username });
      setLoginName('');
      await loadProducts();
    } catch {
      setError('Nie udało się zalogować.');
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch(`${API}/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setUser(null);
    await loadProducts();
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
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        credentials: 'include',
        body: JSON.stringify({ productId: String(product.id), quantity: 1 }),
      });
      const created = await res.json();
      setOrder({ orderId: created.orderId, productId: product.id, status: created.status ?? 'PENDING' });
      pollStatus(created.orderId, product.id);
    } catch {
      setOrder({ productId: product.id, status: 'ERROR' });
      setBusyId(null);
    }
  }

  function pollStatus(orderId, productId) {
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`${API}/orders/${orderId}`, { credentials: 'include' });
        const o = await r.json();
        setOrder({ orderId, productId, status: o.status });
        if (TERMINAL.includes(o.status)) {
          clearInterval(timer);
          setBusyId(null);
        }
      } catch {
        clearInterval(timer);
        setBusyId(null);
      }
    }, 1000);
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
      <h1>shop — flash sale</h1>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        {user ? (
          <>
            <span style={{ color: '#374151' }}>
              Zalogowany: <strong>{user.username}</strong>
            </span>
            <button onClick={logout} style={{ marginLeft: '0.5rem' }}>
              Wyloguj
            </button>
          </>
        ) : (
          <form onSubmit={login} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Nazwa użytkownika"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              disabled={loginBusy}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 4, border: '1px solid #d1d5db' }}
            />
            <button type="submit" disabled={loginBusy || !loginName.trim()}>
              {loginBusy ? 'Logowanie…' : 'Zaloguj'}
            </button>
          </form>
        )}
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {order && (
        <div style={{ padding: '0.75rem 1rem', margin: '1rem 0', background: '#f3f4f6', borderRadius: 8 }}>
          Zamówienie {order.orderId ? `#${order.orderId.slice(0, 8)}` : ''}:{' '}
          <strong>{STATUS_LABEL[order.status] ?? order.status}</strong>
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {products.map((p) => (
          <li
            key={p.id}
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 0', borderBottom: '1px solid #e5e7eb' }}
          >
            <span style={{ flex: 1 }}>
              <strong>{p.name}</strong>
              {p.description ? <em style={{ color: '#6b7280' }}> — {p.description}</em> : null}
            </span>
            <span style={{ width: 90, textAlign: 'right' }}>{p.price} zł</span>
            <button onClick={() => buy(p)} disabled={busyId !== null}>
              {busyId === p.id ? 'Kupowanie…' : 'Kup'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
