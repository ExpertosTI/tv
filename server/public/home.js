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

function showGoogleWaiting(message) {
  for (const id of ['google-signin', 'google-login', 'google-register']) {
    const slot = document.getElementById(id);
    if (!slot) continue;
    slot.textContent = '';
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = message;
    slot.appendChild(note);
  }
}

fetch('/api/auth/config').then((res) => res.json()).then((config) => {
  const slots = ['google-signin', 'google-login', 'google-register'].map((id) => document.getElementById(id)).filter(Boolean);
  if (!slots.length) return;
  if (!config.googleClientId) {
    showGoogleWaiting('Continuar con Google se activa cuando el servidor tiene el cliente OAuth.');
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onload = () => {
    google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: async (response) => {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const error = document.getElementById('login-error');
          if (error) error.textContent = data.error || 'No se pudo entrar con Google.';
          return;
        }
        location.href = '/panel';
      },
    });
    for (const slot of slots) {
      google.accounts.id.renderButton(slot, { theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', locale: 'es', width: 320 });
    }
  };
  document.head.appendChild(script);
});
