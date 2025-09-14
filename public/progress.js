const token = localStorage.getItem('token');
if (!token) location.href = 'index.html';

async function fetchCourses() {
    const res = await fetch('/api/user/progress_course', {
        headers: { Authorization: 'Bearer ' + token }
    });

    let courses = await res.json();

    if (!Array.isArray(courses)) {
        console.error('Expected array, got:', courses);
        return;
    }

    courses.sort((a, b) => a.id - b.id);


    const grid = document.getElementById('progress_coursesGrid');
    grid.innerHTML = '';

    courses.forEach(course => {
        const card = document.createElement('div');
        card.classList.add('course-card');

        //const badge = `<span class="badge">New</span>`;
        const buttonHTML = `<button onclick="go(${course.id})" >View</button>`;

        card.innerHTML = `
      <img src="${course.ref_image}" alt="Course image" />
      <div class="content">
        <h3>${course.title}</h3>
        <p>${course.description}</p>
        <span class="badge passed">🎉 Task Passed</span>
        ${buttonHTML}
      </div>
    `;
        grid.appendChild(card);
    });
}

function go(id) {
    window.location.href = `course.html?id=${id}`;
}

document.getElementById('logout').onclick = () => {
  localStorage.clear();
  location.href = 'landing.html';
};

document.addEventListener('DOMContentLoaded', fetchCourses);