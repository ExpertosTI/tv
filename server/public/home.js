async function send(form, url, errorId) {
  const error = document.getElementById(errorId);
  const button = form.querySelector('button');
  error.textContent = '';
  button.disabled = true;
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.');
    location.href = '/panel';
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
  }
}

document.getElementById('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  send(event.currentTarget, '/api/auth/login', 'login-error');
});

document.getElementById('register-form').addEventListener('submit', (event) => {
  event.preventDefault();
  send(event.currentTarget, '/api/auth/register', 'register-error');
});

fetch('/api/auth/me', { credentials: 'same-origin' }).then((res) => {
  if (res.ok) location.href = '/panel';
});
