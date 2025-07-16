const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';

document.getElementById('logout').onclick = () => {
  localStorage.clear();
  location.href = 'index.html';
};

// Show today's date
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

// 💡 Updated badge logic
function getStatusBadge(status) {
  if (status === 'passed') return `<span class="badge passed">🎉 Task Passed</span>`;
  if (status === 'completed') return `<span class="badge completed">✅ Completed</span>`;
  if (status === 'in_progress') return `<span class="badge in-progress">⏳ In Progress</span>`;
  return `<span class="badge not-started">🔒 Not Started</span>`;
}

// 📊 Stats + activity
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

// 🧠 Track user progress
let userProgress = {};

async function fetchUserProgress() {
  const res = await fetch('http://localhost:5000/api/user/progress', {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) return console.error('Failed to fetch progress');

  const data = await res.json();
  data.forEach(p => {
    userProgress[p.course_id] = p.status || 'not_started';
  });
}

// 📚 Show courses
async function fetchCourses() {
  const res = await fetch('http://localhost:5000/api/courses', {
    headers: { Authorization: 'Bearer ' + token }
  });

  let courses = await res.json();
  courses.sort((a, b) => a.id - b.id); // Ensure ordered

  const grid = document.getElementById('coursesGrid');
  grid.innerHTML = '';

  courses.forEach((course, index) => {
    const status = userProgress[course.id] || 'not_started';
    let isLocked = false;

    // 🔐 Lock unless previous course is PASSED
    if (index > 0) {
      const prevCourse = courses[index - 1];
      const prevStatus = userProgress[prevCourse.id] || 'not_started';
      if (prevStatus !== 'passed') {
        isLocked = true;
      }
    }

    const badge = getStatusBadge(status);
    const card = document.createElement('div');
    card.className = 'course-card';
    if (isLocked) card.classList.add('locked');

    const buttonHTML = isLocked
      ? `<button style="opacity: 0.5; cursor: not-allowed;">🔒 Locked</button>`
      : `<button onclick="go(${course.id})">View</button>`;

    card.innerHTML = `
      <img src="${course.ref_image}" alt="Course image" />
      <div class="content">
        <h3>${course.title}</h3>
        <p>${course.description}</p>
        ${badge}
        ${buttonHTML}
      </div>
    `;

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

async function initDashboard() {
  await fetchUserInfo();
  await fetchStats();
  await fetchUserProgress();
  await fetchCourses();
}

window.onload = initDashboard;
