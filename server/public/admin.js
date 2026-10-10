const main = document.getElementById('main');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

async function load() {
  const res = await fetch('/api/admin/tenants', { credentials: 'same-origin' });
  if (res.status === 401) return form();
  const rows = await res.json();
  main.innerHTML = `
    <p class="step-no">Operación</p>
    <h1>Negocios</h1>
    <table>
      <thead><tr><th>Negocio</th><th>Correo</th><th>Pantallas</th><th>Archivos</th><th>Última TV</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.owner_email)}</td><td>${esc(row.screens)}</td><td>${esc(row.files)}</td><td>${esc(row.last_seen || '—')}</td></tr>`).join('') || '<tr><td colspan="5">Aún no hay negocios.</td></tr>'}
      </tbody>
    </table>
    <p><button class="btn" type="button" id="out">Salir</button></p>`;
  document.getElementById('out').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    form();
  });
}

function form() {
  main.innerHTML = `
    <form class="card" id="admin-form">
      <h1>Administración</h1>
      <label>Clave<input type="password" name="password" required></label>
      <button class="btn primary" type="submit">Entrar</button>
      <p class="form-error" id="err" role="alert"></p>
    </form>`;
  document.getElementById('admin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      document.getElementById('err').textContent = data.error || 'No se pudo entrar.';
      return;
    }
    load();
  });
}

load();
