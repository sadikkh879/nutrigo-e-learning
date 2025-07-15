const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';

const params = new URLSearchParams(window.location.search);
const courseId = params.get('id');

function convertToEmbed(url) {
  if (url.includes('watch?v=')) {
    return url.replace('watch?v=', 'embed/');
  } else if (url.includes('youtu.be/')) {
    return url.replace('youtu.be/', 'youtube.com/embed/');
  }
  return url;
}

async function fetchCourse() {
  const res = await fetch(`http://localhost:5000/api/courses/${courseId}`, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) return alert('Failed to load course.');
  const course = await res.json();

  // Set title
  document.getElementById('courseTitle').textContent = course.title;

  // Clear content container
  const contentDiv = document.getElementById('courseContent');
  contentDiv.innerHTML = '';

  // Render blocks
  course.blocks.forEach(block => {
    let el;

    if (block.type === 'text') {
      el = document.createElement('p');
      el.textContent = block.content;
    } else if (block.type === 'image') {
      el = document.createElement('img');
      el.src = block.content;
      el.alt = '';
      el.style.maxWidth = '100%';
      el.style.margin = '1rem 0';
      el.style.borderRadius = '6px';
    } else if (block.type === 'video') {
      el = document.createElement('iframe');
      el.width = "100%";
      el.height = "400";
      el.frameBorder = 0;
      el.allowFullscreen = true;
      el.src = convertToEmbed(block.content);
      el.style.margin = '1rem 0';
    }

    contentDiv.appendChild(el);
  });
}


document.getElementById('completeBtn').addEventListener('click', async () => {
  const res = await fetch(`http://localhost:5000/api/courses/${courseId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ completed: true })
  });

  if (res.ok) {
    alert('Marked as completed! You may now proceed to the task.');
  } else {
    alert('Something went wrong.');
  }
});

fetchCourse();
