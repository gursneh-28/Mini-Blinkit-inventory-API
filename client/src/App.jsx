import { useEffect, useState } from 'react'
import './App.css'

async function api(path, options = {}) {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

  const res = await fetch(`${apiBaseUrl}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || 'Something went wrong')
  return data
}
export default function App() {
  const [products, setProducts] = useState([])
  const [qty, setQty] = useState({})
  const [reservations, setReservations] = useState([])
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ name: '', category: '', price: '', stock_qty: '' })

  const notify = (type, text) => setMsg({ type, text })

  const load = async () => {
    try {
      setProducts(await api('/products'))
    } catch (e) {
      notify('error', e.message)
    }
  }

  useEffect(() => { load() }, [])

  const addProduct = async (e) => {
    e.preventDefault()
    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category.trim(),
          price: Number(form.price),
          stock_qty: Number(form.stock_qty),
        }),
      })
      setForm({ name: '', category: '', price: '', stock_qty: '' })
      notify('success', 'Product added')
      load()
    } catch (e) {
      notify('error', e.message)
    }
  }

  const reserve = async (p) => {
    try {
      const data = await api('/reservations', {
        method: 'POST',
        body: JSON.stringify({ product_id: p.id, quantity: Number(qty[p.id] || 1) }),
      })
      const r = data.reservation ?? data
      setReservations((prev) => [{ ...r, product_name: p.name }, ...prev])
      notify('success', `Reserved ${r.quantity} x ${p.name} (reservation #${r.id})`)
      load()
    } catch (e) {
      notify('error', e.message)
    }
  }

  const act = async (r, action) => {
    try {
      const data = await api(`/reservations/${r.id}/${action}`, { method: 'POST' })
      const updated = data.reservation ?? data
      setReservations((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: updated.status } : x))
      )
      notify('success', `Reservation #${r.id} ${updated.status}`)
      load()
    } catch (e) {
      notify('error', e.message)
    }
  }

  return (
    <div className="app">
      <h1>Mini Blinkit Inventory</h1>

      {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

      <form className="card row" onSubmit={addProduct}>
        <input placeholder="Name" value={form.name} required
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Category" value={form.category} required
          onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input type="number" min="0" step="0.01" placeholder="Price" value={form.price} required
          onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <input type="number" min="0" placeholder="Stock" value={form.stock_qty} required
          onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
        <button type="submit">Add product</button>
      </form>

      <h2>Products</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Category</th><th>Price</th><th>Available</th><th>Reserve</th></tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.category}</td>
              <td>₹{p.price}</td>
              <td>{p.available_qty}</td>
              <td className="row">
                <input type="number" min="1" className="qty" value={qty[p.id] ?? 1}
                  onChange={(e) => setQty({ ...qty, [p.id]: e.target.value })} />
                <button onClick={() => reserve(p)}>Reserve</button>
              </td>
            </tr>
          ))}
          {products.length === 0 && <tr><td colSpan="5">No products yet</td></tr>}
        </tbody>
      </table>

      {reservations.length > 0 && (
        <>
          <h2>My reservations</h2>
          <table>
            <thead>
              <tr><th>ID</th><th>Product</th><th>Qty</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.product_name}</td>
                  <td>{r.quantity}</td>
                  <td>{r.status}</td>
                  <td className="row">
                    <button onClick={() => act(r, 'confirm')}>Confirm</button>
                    <button className="secondary" onClick={() => act(r, 'release')}>Release</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}