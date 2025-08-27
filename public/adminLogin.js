document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const res = await fetch('http://localhost:5000/api/auth/adminlogin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (res.ok) {
    alert('Login successful!');
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', data.role);
    // Redirect to dashboard or next page
    window.location.href = 'admin.html';
  } else {
    alert(data.message || 'Login failed!');
  }
});
