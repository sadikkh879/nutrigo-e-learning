const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';

document.getElementById('logout').onclick = () => {
  localStorage.clear();
  location.href = 'index.html';
};


// personalized greeting & date
document.getElementById('currentDate').textContent = new Date().toLocaleDateString();
async function fetchUserInfo() {
  const res = await fetch('/api/user/me', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (res.ok) {
    const { firstName } = await res.json();
    document.getElementById('username').textContent = firstName;
  }
}

// fetch meals stats + activity
async function fetchStats() {
  const res = await fetch('/api/user/stats', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (res.ok) {
    const stats = await res.json();
    document.getElementById('mealsLogged').textContent = stats.totalMeals;
    document.getElementById('healthyCount').textContent = stats.healthyMeals;
    document.getElementById('goalsMet').textContent = stats.goalsMet;
    const logEl = document.getElementById('activityLog');
    stats.recentMeals.forEach(m => {
      const li = document.createElement('li');
      li.textContent = `You logged a meal for "${m.courseTitle}" on ${new Date(m.timestamp).toLocaleDateString()}`;
      logEl.appendChild(li);
    });
  }
}

// fetch courses and show cards
async function fetchCourses() {
  const res = await fetch('/api/courses', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) return alert('Failed to load courses.');
  const courses = await res.json();
  const grid = document.getElementById('coursesGrid');
  grid.innerHTML = '';

  courses.forEach(course => {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.innerHTML = `
      <img src="${course.ref_image || 'placeholder.jpg'}" alt="Course image">
      <div class="content">
        <h3>${course.title}</h3>
        <p>${course.description || ''}</p>
        <button onclick="go('${course.id}')">View</button>
      </div>`;
    grid.appendChild(card);
  });
}

function go(id) {
  window.location.href = `course.html?id=${id}`;
}

const tips = [
  'Drink a glass of water before each meal.',
  'Add a colorful veggie to your lunch plate.',
  'Try a new healthy recipe this week. Do not go for junk food!',
  'Choose whole grain snacks like popcorn or nuts.'
];
document.getElementById('dailyTip').textContent =
  tips[new Date().getDay() % tips.length];


window.onload = () => {
  fetchUserInfo();
  fetchStats();
  fetchCourses();
}
