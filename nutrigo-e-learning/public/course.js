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

let userProgress = {};
let taskShown = false;

async function fetchUserProgress() {
  const res = await fetch('http://localhost:5000/api/user/progress', {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) return console.error('❌ Failed to fetch progress');
  const data = await res.json();

  data.forEach(p => {
    userProgress[p.course_id] = p.status || 'not_started';
  });
}

async function fetchCourse() {
  const res = await fetch(`http://localhost:5000/api/courses/${courseId}`, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) return alert('Failed to load course.');
  const course = await res.json();

  // Title
  document.getElementById('courseTitle').textContent = course.title;

  // Render blocks
  const contentDiv = document.getElementById('courseContent');
  contentDiv.innerHTML = '';
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

  // Check if task is passed
  const taskRes = await fetch(`http://localhost:5000/api/user/task/${courseId}/status`, {
    headers: { Authorization: 'Bearer ' + token }
  });

  const taskData = await taskRes.json();
  if (!taskData.passed) {
    document.getElementById('successTask').style.display = 'none';
    document.getElementById('unsuccessTask').style.display = 'none';
  }

  // Show task section if course is completed
  if (userProgress[courseId] === 'completed') {
    document.getElementById('taskSection').style.display = 'block';
    document.getElementById('completeBtn').style.display= 'none';
    document.getElementById('unsuccessTask').style.display = 'none';
    taskShown = true;
  } else if (userProgress[courseId] === 'passed'){
    document.getElementById('completeBtn').style.display= 'none';
    document.getElementById('unsuccessTask').style.display = 'none';
  }
}

// 🔄 Mark as in_progress on load
(async () => {
  await fetchUserProgress();

  await fetch(`/api/user/course/${courseId}/start`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token }
  });

  await fetchCourse();
})();

// ✅ Handle course completion
document.getElementById('completeBtn').addEventListener('click', async () => {
  const res = await fetch(`http://localhost:5000/api/user/course/${courseId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ completed: true })
  });

  if (res.ok) {
    alert('Marked as completed! You may now proceed to the task.');

    // ✅ Refetch progress and show task section
    await fetchUserProgress();
    if (userProgress[courseId] === 'completed') {
      document.getElementById('taskSection').style.display = 'block';
      document.getElementById('completeBtn').style.display = 'none';
      document.getElementById('unsuccessTask').style.display = 'none';
      taskShown = true;
    }
  } else {
    const data = await res.json();
    alert(data.message || 'Something went wrong.');
  }
});


// 🖼 Handle task image submission
document.getElementById('taskForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = new FormData();
  const imageFile = document.getElementById('mealImage').files[0];
  if (!imageFile) return alert('Please select an image.');

  form.append('mealImage', imageFile);

  const res = await fetch(`http://localhost:5000/api/user/task/${courseId}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  });

  // const data = await res.json();
  // if (res.ok) {
  //   alert('Image uploaded! Comparing...');
  //   // Optional: refresh page or fetchCourse() to update button visibility
  //   location.reload();
  //   document.getElementById('taskSection').style.display = 'none';
  // } else {
  //   alert(data.message || 'Failed to upload image');
  // }

const data = await res.json();
if (res.ok) {
  alert(`${data.message} Similarity: ${data.similarity}%`);
  if (data.passed) {
    // optionally auto-redirect to the next course page or refresh dashboard
    setTimeout(() => location.href = '/dashboard.html', 1200);
  } else {
  const unsuccessDiv = document.getElementById('unsuccessTask');
  const imgs = unsuccessDiv.getElementsByTagName('img');
  
  // first image is the "Try again" banner — skip it
  imgs[1].src = data.refImageUrl;   // reference image
  imgs[2].src = data.imageUrl;      // uploaded image

  //document.getElementById('similarityScore').innerText = `Similarity: ${data.similarity}%`
  
  unsuccessDiv.style.display = 'block';
  }
}
});
