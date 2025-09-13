const regForm = document.getElementById('regForm');
const registerBtn = regForm.querySelector('.btn');
const btnText = registerBtn.querySelector('.btn-text');
const spinner = registerBtn.querySelector('.spinner');

regForm.addEventListener('submit', async e => {
  e.preventDefault();

  const data = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    birthDate: document.getElementById('birthDate').value,
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value
  };

  if (!data.firstName || !data.lastName || !data.birthDate) {
    return alert('Please fill in all fields.');
  }

  btnText.textContent = 'Registering...';
  spinner.style.display = 'inline-block';
  registerBtn.disabled = true;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const resp = await res.json();

    if (res.ok) {
      alert('Registration successful! A verification email has been sent. Please verify and log in.');
      window.location.href = 'index.html';
    } else {
      alert(resp.message || 'Registration failed.');
    }
  } catch {
    alert('Network error. Please try again.');
  } finally {
    btnText.textContent = 'Register';
    spinner.style.display = 'none';
    registerBtn.disabled = false;
  }
});
