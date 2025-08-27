    
document.getElementById('regForm').addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        birthDate: document.getElementById('birthDate').value,
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      };

      // Basic validation
      if (!data.firstName || !data.lastName || !data.birthDate) {
        return alert('Please fill in all fields.');
      }

      try {
        const res = await fetch('http://localhost:5000/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const resp = await res.json();
        if (res.ok) {
          alert('Registration successful! Please log in.');
          window.location.href = 'index.html';
        } else {
          alert(resp.message || 'Registration failed.');
        }
      } catch {
        alert('Network error. Please try again.');
      }   });