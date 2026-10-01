document.getElementById('login-form').onsubmit = async event => {
  event.preventDefault();
  const button = document.getElementById('login-button');
  button.disabled = true;
  const message = document.getElementById('login-error');
  message.textContent = '';
  try {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('password').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.replace('/');
  } catch (error) { message.textContent = error.message || 'Confira sua conexão e tente novamente.'; }
  finally { button.disabled = false; }
};
