// =================================================================================
// MAIN APPLICATION SCRIPT FOR ECSTASY OS (Final Version)
// This file includes all fixes for API connection, model paths, and data handling.
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. CONFIGURATION & STATE ---
    const API_BASE_URL = 'http://127.0.0.1:8000';

    const AppState = {
        currentUser: null,
        token: null,
        companyProfile: null,
        projects: [],
        users: [],
        isCameraOn: false,
        isModelsLoaded: false,
        checkInTime: null,
        checkOutTime: null,
    };

    // --- 2. DOM ELEMENT SELECTORS ---
    const loginView = document.getElementById('login-view');
    const appShell = document.getElementById('app-shell');
    const mainContent = document.getElementById('main-content');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    
    // --- 3. API HELPER FUNCTIONS ---
    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('accessToken');
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

        if (!response.ok) {
            if (response.status === 401) {
                handleLogout();
            }
            const errorData = await response.json();
            throw new Error(errorData.detail || 'An API error occurred');
        }
        if (response.status === 204) {
            return null;
        }
        return response.json();
    }

    // --- 4. TEMPLATES ---
    const templates = {
        sidebar: (user) => `
            <div class="flex items-center mb-8"><h1 class="text-xl font-bold">Ecstasy OS</h1></div>
            <nav id="main-nav" class="flex-grow space-y-2"></nav>
            <div class="mt-auto">
                <div class="p-3 mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <p class="text-sm font-semibold">${user ? user.name : ''}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${user ? user.role : ''}</p>
                </div>
                <button id="toggle-dark-mode" class="flex items-center justify-center w-full px-4 py-2 mb-2 text-sm font-medium text-gray-600 bg-gray-200 rounded-lg dark:text-gray-300 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Toggle Theme</button>
                <button id="logout-button" class="flex items-center w-full px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600">Logout</button>
            </div>
        `,
        attendance: (user) => `
            <h2 class="text-3xl font-bold mb-6">Smart Attendance</h2>
            <div class="max-w-2xl mx-auto p-4 md:p-8 space-y-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                <div class="text-center">
                    <p class="text-lg font-medium">Welcome, ${user ? user.name : ''}</p>
                    <p class="text-gray-500">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <div class="flex justify-around p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <div class="text-center"><p class="text-sm text-gray-500">Check-in</p><p id="check-in-time" class="font-bold text-lg">--:--</p></div>
                    <div class="text-center"><p class="text-sm text-gray-500">Check-out</p><p id="check-out-time" class="font-bold text-lg">--:--</p></div>
                </div>
                <div class="relative w-full aspect-video bg-gray-900 rounded-lg overflow-hidden">
                    <video id="video-feed" autoplay muted playsinline class="w-full h-full object-cover"></video>
                    <div id="camera-off-overlay" class="absolute inset-0 flex flex-col items-center justify-center text-white"><p>Camera is off</p></div>
                </div>
                <div id="status-message" class="p-4 rounded-lg border-l-4 flex items-center"></div>
                <div class="flex flex-col sm:flex-row gap-4">
                    <button id="toggle-camera-btn" class="flex-1 flex items-center justify-center px-6 py-3 text-white bg-gray-500 rounded-lg hover:bg-gray-600 disabled:bg-gray-400">Turn On Camera</button>
                    <button id="check-in-btn" class="flex-1 flex items-center justify-center px-6 py-3 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-400">Check In</button>
                    <button id="check-out-btn" class="flex-1 flex items-center justify-center px-6 py-3 text-white bg-red-600 rounded-lg hover:bg-red-700 hidden">Check Out</button>
                </div>
                <p id="model-loading-status" class="text-xs text-center text-yellow-500">Loading AI models...</p>
            </div>
        `,
        company: (profile) => `
            <h2 class="text-3xl font-bold mb-6">Company Profile</h2>
            <div class="max-w-4xl mx-auto p-8 space-y-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                <div id="company-notification" class="p-3 mb-4 text-sm text-green-800 bg-green-100 dark:bg-green-900 dark:text-green-200 rounded-lg hidden"></div>
                <div><label class="block mb-1 text-sm font-medium">Company Name</label><input id="company-name-input" value="${profile.name}" class="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                <div><label class="block mb-1 text-sm font-medium">Address</label><input id="company-address-input" value="${profile.address}" class="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                <div><label class="block mb-2 text-sm font-medium">Company Geofence Location</label><div id="company-map" style="height: 300px; width: 100%; border-radius: 0.5rem;"></div></div>
                <button id="save-company-btn" class="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Changes</button>
            </div>
        `,
        projects: () => `
            <h2 class="text-3xl font-bold mb-6">Project Profiles</h2>
            <div class="max-w-6xl mx-auto">
                <div id="project-notification" class="p-3 mb-4 text-sm text-green-800 bg-green-100 dark:bg-green-900 dark:text-green-200 rounded-lg hidden"></div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="md:col-span-1 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                        <h3 class="font-semibold mb-4">Projects</h3>
                        <div id="projects-list" class="space-y-2"></div>
                        <button id="add-new-project-btn" class="w-full mt-4 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">Add New Project</button>
                    </div>
                    <div id="project-form-container" class="md:col-span-2 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                        <div class="flex items-center justify-center h-full text-gray-500">Select a project to edit or add a new one.</div>
                    </div>
                </div>
            </div>
        `,
        employees: () => `
            <h2 class="text-3xl font-bold mb-6">Employee Profiles</h2>
            <div class="max-w-7xl mx-auto">
                <div id="employee-notification" class="p-3 mb-4 text-sm text-green-800 bg-green-100 dark:bg-green-900 dark:text-green-200 rounded-lg hidden"></div>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-1 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col">
                        <h3 class="font-semibold mb-4">Employees</h3>
                        <div class="relative mb-4">
                            <input id="employee-search-input" type="text" placeholder="Search by name..." class="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                            <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                        <div id="employees-list" class="space-y-2 flex-grow"></div>
                        <div id="employee-pagination" class="mt-4 flex justify-between items-center"></div>
                    </div>
                    <div id="employee-form-container" class="lg:col-span-2 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                        <div class="flex items-center justify-center h-full text-gray-500">Select an employee to view or edit their profile.</div>
                    </div>
                </div>
            </div>
        `,
    };

    // --- 5. INITIALIZATION AND AUTHENTICATION ---
    
    async function init() {
        loginForm.addEventListener('submit', handleLogin);
        const token = localStorage.getItem('accessToken');

        loginView.classList.add('active');
        appShell.classList.remove('active');

        if (token) {
            try {
                const user = await apiFetch('/users/me/');
                AppState.currentUser = user;
                loginView.classList.remove('active');
                appShell.classList.add('active');
                await initializeAppShell();
            } catch (error) {
                console.error("Session restore failed:", error);
                localStorage.removeItem('accessToken');
            }
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const formData = new FormData();
        formData.append('username', document.getElementById('email-input').value);
        formData.append('password', document.getElementById('password-input').value);

        try {
            const data = await fetch(`${API_BASE_URL}/token`, {
                method: 'POST',
                body: formData
            }).then(res => {
                if (!res.ok) throw new Error('Login failed');
                return res.json();
            });

            localStorage.setItem('accessToken', data.access_token);
            
            const user = await apiFetch('/users/me/');
            AppState.currentUser = user;

            loginView.classList.remove('active');
            appShell.classList.add('active');
            await initializeAppShell();

        } catch (error) {
            console.error("Login Error:", error);
            loginError.textContent = 'Incorrect email or password.';
            loginError.classList.remove('hidden');
        }
    }
    
    function handleLogout() {
        localStorage.removeItem('accessToken');
        AppState.currentUser = null;
        if (AppState.isCameraOn) {
            const video = document.getElementById('video-feed');
            if(video && video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
            }
        }
        appShell.classList.remove('active');
        loginView.classList.add('active');
        mainContent.innerHTML = '';
    }

    async function initializeAppShell() {
        document.getElementById('sidebar-content').innerHTML = templates.sidebar(AppState.currentUser);
        setupNavigation();
        document.getElementById('logout-button').addEventListener('click', handleLogout);
        document.getElementById('toggle-dark-mode').addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
        });
        
        try {
            const [company, projects, users] = await Promise.all([
                apiFetch('/company/'),
                apiFetch('/projects/'),
                apiFetch('/users/')
            ]);
            AppState.companyProfile = company;
            AppState.projects = projects;
            AppState.users = users;
            
            switchToView('attendance');
        } catch (error) {
            console.error("Failed to load initial app data:", error);
            alert("Could not load application data. Please try again.");
        }
    }

    // --- 6. NAVIGATION ---
    
    function setupNavigation() {
        const navItems = [
            { view: 'attendance', label: 'Attendance', roles: ['Super Admin', 'Admin', 'HR', 'Employee'] },
            { view: 'employees', label: 'Employees', roles: ['Super Admin', 'Admin', 'HR'] },
            { view: 'projects', label: 'Projects', roles: ['Super Admin', 'Admin'] },
            { view: 'company', label: 'Company Profile', roles: ['Super Admin'] },
        ];

        const mainNav = document.getElementById('main-nav');
        const mobileNav = document.getElementById('mobile-nav');
        mainNav.innerHTML = '';
        mobileNav.innerHTML = '';

        navItems.forEach(item => {
            if (AppState.currentUser && item.roles.includes(AppState.currentUser.role)) {
                const button = document.createElement('button');
                button.className = 'nav-button flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700';
                button.dataset.view = item.view;
                button.textContent = item.label;
                mainNav.appendChild(button);

                const mobileButton = document.createElement('button');
                mobileButton.className = 'mobile-nav-button flex-1 text-gray-500 dark:text-gray-400 flex flex-col items-center';
                mobileButton.dataset.view = item.view;
                mobileButton.innerHTML = `<span>${item.label}</span>`;
                mobileNav.appendChild(mobileButton);
            }
        });

        document.querySelectorAll('.nav-button, .mobile-nav-button').forEach(btn => {
            btn.addEventListener('click', () => switchToView(btn.dataset.view));
        });
    }

    function switchToView(viewId) {
        document.querySelectorAll('.nav-button, .mobile-nav-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.view === viewId) {
                btn.classList.add('active');
            }
        });

        switch (viewId) {
            case 'attendance':
                mainContent.innerHTML = templates.attendance(AppState.currentUser);
                initializeAttendanceModule();
                break;
            case 'company':
                mainContent.innerHTML = templates.company(AppState.companyProfile);
                initializeCompanyModule();
                break;
            case 'projects':
                mainContent.innerHTML = templates.projects();
                initializeProjectsModule();
                break;
            case 'employees':
                mainContent.innerHTML = templates.employees();
                initializeEmployeesModule();
                break;
        }
    }

    // --- 7. MODULES (API Connected) ---

    function initializeCompanyModule() {
        const nameInput = document.getElementById('company-name-input');
        const addressInput = document.getElementById('company-address-input');
        const saveBtn = document.getElementById('save-company-btn');
        
        const map = L.map('company-map').setView(AppState.companyProfile.location, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        let marker = L.marker(AppState.companyProfile.location).addTo(map);
        
        map.on('click', (e) => marker.setLatLng(e.latlng));

        saveBtn.addEventListener('click', async () => {
            const updatedProfile = {
                name: nameInput.value,
                address: addressInput.value,
                location: marker.getLatLng()
            };
            try {
                const savedProfile = await apiFetch('/company/', {
                    method: 'PUT',
                    body: JSON.stringify(updatedProfile)
                });
                AppState.companyProfile = savedProfile;
                const notification = document.getElementById('company-notification');
                notification.textContent = 'Company profile updated successfully!';
                notification.classList.remove('hidden');
                setTimeout(() => notification.classList.add('hidden'), 3000);
            } catch (error) {
                alert(`Error saving company profile: ${error.message}`);
            }
        });
    }
    
    function initializeProjectsModule() {
        const projectsListContainer = document.getElementById('projects-list');
        const projectFormContainer = document.getElementById('project-form-container');
        const addNewProjectBtn = document.getElementById('add-new-project-btn');
        const notificationDiv = document.getElementById('project-notification');

        function renderProjectsList() {
            projectsListContainer.innerHTML = '';
            AppState.projects.forEach(p => {
                const button = document.createElement('button');
                button.className = 'w-full text-left p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700';
                button.textContent = p.name;
                button.dataset.projectId = p.id;
                button.addEventListener('click', () => {
                    document.querySelectorAll('#projects-list button').forEach(btn => btn.classList.remove('bg-blue-100', 'dark:bg-blue-900'));
                    button.classList.add('bg-blue-100', 'dark:bg-blue-900');
                    renderProjectForm(p.id);
                });
                projectsListContainer.appendChild(button);
            });
        }

        function renderProjectForm(projectId) {
            const project = projectId ? AppState.projects.find(p => p.id === projectId) : { id: null, name: '', location: AppState.companyProfile.location };
            
            projectFormContainer.innerHTML = `
                <h3 class="font-semibold text-lg">${project.id ? 'Edit Project' : 'New Project'}</h3>
                <div class="space-y-4 mt-4">
                    <div><label class="block mb-1 text-sm font-medium">Project Name</label><input id="project-name-input" value="${project.name}" class="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                    <div><label class="block mb-2 text-sm font-medium">Project Geofence Location</label><div id="project-map" style="height: 250px; width: 100%; border-radius: 0.5rem;"></div></div>
                    <button id="save-project-btn" class="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Project</button>
                </div>
            `;

            const map = L.map('project-map').setView(project.location, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            let marker = L.marker(project.location).addTo(map);
            map.on('click', (e) => marker.setLatLng(e.latlng));
            
            document.getElementById('save-project-btn').addEventListener('click', async () => {
                const newName = document.getElementById('project-name-input').value;
                const newLocation = marker.getLatLng();
                const projectIdToSave = project.id || `proj-${Date.now()}`;
                
                const projectData = {
                    id: projectIdToSave,
                    name: newName,
                    location: newLocation
                };

                try {
                    const savedProject = await apiFetch(`/projects/${projectIdToSave}`, {
                        method: 'PUT',
                        body: JSON.stringify(projectData)
                    });

                    const pIndex = AppState.projects.findIndex(p => p.id === projectIdToSave);
                    if (pIndex > -1) {
                        AppState.projects[pIndex] = savedProject;
                    } else {
                        AppState.projects.push(savedProject);
                    }
                    
                    notificationDiv.textContent = 'Project saved successfully!';
                    notificationDiv.classList.remove('hidden');
                    setTimeout(() => notificationDiv.classList.add('hidden'), 3000);

                    renderProjectsList();
                    projectFormContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Select a project to edit or add a new one.</div>';
                } catch (error) {
                    alert(`Error saving project: ${error.message}`);
                }
            });
        }

        addNewProjectBtn.addEventListener('click', () => renderProjectForm(null));
        renderProjectsList();
    }
    
    function initializeEmployeesModule() {
        const listContainer = document.getElementById('employees-list');
        const formContainer = document.getElementById('employee-form-container');
        const notificationDiv = document.getElementById('employee-notification');
        const searchInput = document.getElementById('employee-search-input');
        const paginationContainer = document.getElementById('employee-pagination');

        let currentPage = 1;
        const itemsPerPage = 8;
        let selectedUserId = null;

        function render() {
            const searchQuery = searchInput.value.toLowerCase();
            const filteredUsers = AppState.users.filter(user => user.name.toLowerCase().includes(searchQuery));

            const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const usersOnPage = filteredUsers.slice(startIndex, endIndex);

            listContainer.innerHTML = '';
            usersOnPage.forEach(user => {
                const button = document.createElement('button');
                button.className = `w-full text-left p-3 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${user.id === selectedUserId ? 'bg-blue-100 dark:bg-blue-900 border-blue-400' : 'bg-white dark:bg-gray-800'}`;
                button.dataset.userId = user.id;
                button.innerHTML = `<p class="font-semibold">${user.name}</p><p class="text-sm text-gray-500">${user.role}</p>`;
                button.addEventListener('click', () => {
                    selectedUserId = user.id;
                    render();
                    renderEmployeeForm(user.id);
                });
                listContainer.appendChild(button);
            });

            paginationContainer.innerHTML = '';
            if (totalPages > 1) {
                const prevButton = document.createElement('button');
                prevButton.textContent = 'Prev';
                prevButton.disabled = currentPage === 1;
                prevButton.className = 'px-3 py-1 rounded disabled:opacity-50';
                prevButton.addEventListener('click', () => { currentPage--; render(); });

                const pageInfo = document.createElement('span');
                pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
                pageInfo.className = 'text-sm';

                const nextButton = document.createElement('button');
                nextButton.textContent = 'Next';
                nextButton.disabled = currentPage === totalPages;
                nextButton.className = 'px-3 py-1 rounded disabled:opacity-50';
                nextButton.addEventListener('click', () => { currentPage++; render(); });
                
                paginationContainer.append(prevButton, pageInfo, nextButton);
            }
        }

        function renderEmployeeForm(userId) {
            const user = AppState.users.find(u => u.id === userId);
            if (!user) return;

            const userWorkWeek = user.work_week || [];
            const userAllowedLocations = user.allowed_locations || [];

            const workWeekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const allLocations = [{id: 'company', name: 'Company HQ'}, ...AppState.projects];

            formContainer.innerHTML = `
                <h3 class="font-semibold text-lg mb-4">Edit Employee: ${user.name}</h3>
                <form id="employee-form" class="space-y-6">
                    <div class="p-4 border rounded-lg dark:border-gray-600">
                        <h4 class="font-medium mb-4">Job Details</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label class="block text-sm mb-1">Full Name</label><input name="name" value="${user.name}" class="w-full input-field"></div>
                            <div><label class="block text-sm mb-1">Email</label><input name="email" type="email" value="${user.email}" class="w-full input-field" disabled></div>
                            <div><label class="block text-sm mb-1">Role</label>
                                <select name="role" class="w-full input-field">
                                    <option ${user.role === 'Employee' ? 'selected' : ''}>Employee</option>
                                    <option ${user.role === 'HR' ? 'selected' : ''}>HR</option>
                                    <option ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                                    <option ${user.role === 'Super Admin' ? 'selected' : ''}>Super Admin</option>
                                </select>
                            </div>
                            <div><label class="block text-sm mb-1">Hiring Date</label><input name="hiring_date" type="date" value="${user.hiring_date || ''}" class="w-full input-field"></div>
                            <div><label class="block text-sm mb-1">Probation End</label><input name="probation_end" type="date" value="${user.probation_end || ''}" class="w-full input-field"></div>
                        </div>
                    </div>
                    <div class="p-4 border dark:border-gray-600 rounded-lg">
                        <h4 class="font-medium mb-4">Work Schedule</h4>
                        <div class="mb-4"><label class="block mb-2 text-sm">Work Week</label>
                            <div class="flex flex-wrap gap-2">
                                ${workWeekDays.map(day => `<button type="button" data-day="${day}" class="work-day-btn px-3 py-1 text-sm rounded-full ${userWorkWeek.includes(day) ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600'}">${day}</button>`).join('')}
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><label class="block text-sm mb-1">Start Time</label><input name="work_start_time" type="time" value="${user.work_start_time || ''}" class="w-full input-field"></div>
                            <div><label class="block text-sm mb-1">End Time</label><input name="work_end_time" type="time" value="${user.work_end_time || ''}" class="w-full input-field"></div>
                        </div>
                    </div>
                    <div class="p-4 border dark:border-gray-600 rounded-lg">
                        <h4 class="font-medium mb-4">Permissions & Security</h4>
                        <div class="mb-4">
                            <h5 class="font-medium text-sm mb-2">Allowed Login Locations</h5>
                            <div class="space-y-2">
                                ${allLocations.map(loc => `
                                    <label class="flex items-center"><input type="checkbox" data-location="${loc.id}" class="location-checkbox h-4 w-4" ${userAllowedLocations.includes(loc.id) ? 'checked' : ''}><span class="ml-2">${loc.name}</span></label>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <button type="submit" class="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Changes</button>
                </form>
            `;
            
            document.getElementById('employee-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const updatedData = {};
                for (let [key, value] of formData.entries()) {
                    if (value) updatedData[key] = value;
                }
                
                updatedData.allowed_locations = Array.from(document.querySelectorAll('.location-checkbox:checked')).map(cb => cb.dataset.location);
                updatedData.work_week = Array.from(document.querySelectorAll('.work-day-btn.bg-blue-600')).map(btn => btn.dataset.day);

                try {
                    const savedUser = await apiFetch(`/users/${userId}`, {
                        method: 'PUT',
                        body: JSON.stringify(updatedData)
                    });
                    
                    const userIndex = AppState.users.findIndex(u => u.id === userId);
                    AppState.users[userIndex] = savedUser;
                    
                    notificationDiv.textContent = 'Employee profile saved successfully!';
                    notificationDiv.classList.remove('hidden');
                    setTimeout(() => notificationDiv.classList.add('hidden'), 3000);
                    
                    render();
                } catch (error) {
                    alert(`Error saving employee: ${error.message}`);
                }
            });

            document.querySelectorAll('.work-day-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    btn.classList.toggle('bg-blue-600');
                    btn.classList.toggle('text-white');
                    btn.classList.toggle('bg-gray-200');
                    btn.classList.toggle('dark:bg-gray-600');
                });
            });
        }

        searchInput.addEventListener('input', () => {
            currentPage = 1;
            selectedUserId = null;
            formContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Select an employee to view or edit their profile.</div>';
            render();
        });

        render();
    }

    function initializeAttendanceModule() {
        const video = document.getElementById('video-feed');
        const toggleCameraBtn = document.getElementById('toggle-camera-btn');
        const checkInBtn = document.getElementById('check-in-btn');
        const checkOutBtn = document.getElementById('check-out-btn');
        const modelStatus = document.getElementById('model-loading-status');

        const modelPath = '/public/models';

        Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
            faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
            faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
        ]).then(() => {
            AppState.isModelsLoaded = true;
            modelStatus.classList.add('hidden');
        }).catch(err => {
            console.error("Error loading models:", err);
            updateStatus('error', 'Could not load AI models. Check paths.');
        });

        toggleCameraBtn.addEventListener('click', () => {
            if (AppState.isCameraOn) stopCamera();
            else startCamera();
        });

        checkInBtn.addEventListener('click', handleCheckIn);
        checkOutBtn.addEventListener('click', handleCheckOut);

        function startCamera() {
            navigator.mediaDevices.getUserMedia({ video: {} })
                .then(stream => {
                    video.srcObject = stream;
                    AppState.isCameraOn = true;
                    toggleCameraBtn.textContent = 'Turn Off Camera';
                    document.getElementById('camera-off-overlay').classList.add('hidden');
                }).catch(err => updateStatus('error', 'Camera access denied. Please enable permissions.'));
        }

        function stopCamera() {
            if (video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
            }
            AppState.isCameraOn = false;
            toggleCameraBtn.textContent = 'Turn On Camera';
            document.getElementById('camera-off-overlay').classList.remove('hidden');
        }

        function handleCheckIn() {
            if (!AppState.isCameraOn || !AppState.isModelsLoaded) {
                updateStatus('error', 'Please turn on camera and wait for models.');
                return;
            }
            updateStatus('info', 'Processing...');

            navigator.geolocation.getCurrentPosition(async (position) => {
                console.log('User location:', position.coords);
                
                const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
                if (detections.length === 1) {
                    updateStatus('success', 'Check-in successful! Welcome.');
                    AppState.checkInTime = new Date();
                    document.getElementById('check-in-time').textContent = AppState.checkInTime.toLocaleTimeString();
                    checkInBtn.classList.add('hidden');
                    checkOutBtn.classList.remove('hidden');
                } else {
                    updateStatus('error', `Check-in failed: ${detections.length === 0 ? 'No face' : 'Multiple faces'} detected.`);
                }
                stopCamera();
            }, () => updateStatus('error', 'Could not get location. Please enable location services.'));
        }

        function handleCheckOut() {
            AppState.checkOutTime = new Date();
            document.getElementById('check-out-time').textContent = AppState.checkOutTime.toLocaleTimeString();
            updateStatus('success', 'Checked out successfully. Have a great day!');
            checkOutBtn.classList.add('hidden');
        }

        function updateStatus(type, message) {
            const statusDiv = document.getElementById('status-message');
            if (!statusDiv) return;
            statusDiv.textContent = message;
            statusDiv.className = 'p-4 rounded-lg border-l-4 flex items-center';
            if (type === 'success') statusDiv.classList.add('bg-green-100', 'dark:bg-green-900', 'border-green-500');
            else if (type === 'error') statusDiv.classList.add('bg-red-100', 'dark:bg-red-900', 'border-red-500');
            else statusDiv.classList.add('bg-blue-100', 'dark:bg-blue-900', 'border-blue-500');
        }
    }

    // --- 8. START THE APPLICATION ---
    init();
});