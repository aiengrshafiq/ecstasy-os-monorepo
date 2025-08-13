// =================================================================================
// MAIN APPLICATION SCRIPT FOR ECSTASY OS (Final Version with All QA Fixes)
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. CONFIGURATION & STATE ---
    const API_BASE_URL = 'http://127.0.0.1:8000'; // For local testing
    // const API_BASE_URL = 'https://ecstasyos-hrms-api.azurewebsites.net'; // For production

    const AppState = {
        currentUser: null,
        token: null,
        companyProfile: null,
        projects: [],
        users: [],
        isCameraOn: false,
        checkInTime: null,
        checkOutTime: null,
    };

    // --- 2. DOM ELEMENT SELECTORS ---
    const loginView = document.getElementById('login-view');
    const appShell = document.getElementById('app-shell');
    const mainContent = document.getElementById('main-content');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    
    // --- 3. UTILITY FUNCTIONS ---
    function showToast(message, type = 'info') {
        const toastContainer = document.createElement('div');
        toastContainer.className = 'fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white text-sm z-50 animate-fade-in-down';
        
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500'
        };
        toastContainer.classList.add(colors[type]);
        toastContainer.textContent = message;

        document.body.appendChild(toastContainer);

        setTimeout(() => {
            toastContainer.classList.add('animate-fade-out-up');
            toastContainer.addEventListener('animationend', () => {
                toastContainer.remove();
            });
        }, 3000);
    }
    
    function setLoadingState(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            if (!button.dataset.originalContent) {
                button.dataset.originalContent = button.innerHTML;
            }
            button.disabled = true;
            button.classList.add('h-[52px]'); // Fix for button resizing
            button.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
            `;
        } else {
            if (button.dataset.originalContent) {
                button.innerHTML = button.dataset.originalContent;
                delete button.dataset.originalContent;
            }
            button.classList.remove('h-[52px]');
            button.disabled = false;
        }
    }

    // --- 4. API HELPER FUNCTIONS ---
    async function apiFetch(endpoint, options = {}) {
        const token = localStorage.getItem('accessToken');
        const headers = {
            ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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

    // --- 5. TEMPLATES ---
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
        dashboard: (user) => {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
            const isAdmin = ['Admin', 'Super Admin', 'HR'].includes(user.role);

            return `
                <h2 class="text-3xl font-bold mb-2">${greeting}, ${user.name.split(' ')[0]}!</h2>
                <p class="text-gray-500 dark:text-gray-400 mb-8">Here's your overview for today.</p>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col justify-center items-center text-center">
                        <h3 class="font-semibold mb-4">Quick Actions</h3>
                        <button id="dashboard-check-in-btn" class="w-full px-6 py-3 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors mb-3">Check In</button>
                        <p class="text-xs text-gray-400">Click here to quickly mark your attendance.</p>
                    </div>
                    <div class="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col justify-center items-center text-center">
                        <h3 id="dashboard-time" class="text-4xl font-bold"></h3>
                        <p id="dashboard-date" class="text-gray-500"></p>
                    </div>
                    ${isAdmin ? `
                    <div class="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col justify-center items-center text-center">
                        <h3 class="font-semibold mb-2">Team Status</h3>
                        <p class="text-5xl font-bold">0</p>
                        <p class="text-gray-500">Employees Checked In</p>
                    </div>
                    ` : ''}
                    <div class="md:col-span-2 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                        <h3 class="font-semibold mb-4">Company Announcements</h3>
                        <div class="text-center text-gray-400 py-8"><p>No new announcements.</p></div>
                    </div>
                </div>
            `;
        },
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
                <div id="status-message" class="p-4 rounded-lg border-l-4 flex items-center hidden"></div>
                <div class="flex flex-col sm:flex-row gap-4">
                    <button id="toggle-camera-btn" class="flex-1 flex items-center justify-center px-6 py-3 text-white bg-gray-500 rounded-lg hover:bg-gray-600">Turn On Camera</button>
                    <button id="check-in-btn" class="flex-1 flex items-center justify-center px-6 py-3 text-white bg-green-600 rounded-lg hover:bg-green-700">Check In</button>
                    <button id="check-out-btn" class="flex-1 flex items-center justify-center px-6 py-3 text-white bg-red-600 rounded-lg hover:bg-red-700 hidden">Check Out</button>
                </div>
            </div>
        `,
        attendanceReport: () => `
            <h2 class="text-3xl font-bold mb-6">Attendance Report</h2>
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                <div class="flex flex-wrap gap-4 items-end mb-6">
                    <div><label for="start-date-filter" class="block text-sm mb-1">Start Date</label><input type="date" id="start-date-filter" class="input-field"></div>
                    <div><label for="end-date-filter" class="block text-sm mb-1">End Date</label><input type="date" id="end-date-filter" class="input-field"></div>
                    <button id="generate-report-btn" class="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center">Generate Report</button>
                    <button id="export-csv-btn" class="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 flex items-center justify-center">Export to CSV</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check In</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check Out</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Work Hours</th>
                            </tr>
                        </thead>
                        <tbody id="report-table-body" class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"></tbody>
                    </table>
                </div>
            </div>
        `,
        company: (profile) => `
            <h2 class="text-3xl font-bold mb-6">Company Profile</h2>
            <div class="max-w-4xl mx-auto p-8 space-y-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                <div><label class="block mb-1 text-sm font-medium">Company Name</label><input id="company-name-input" value="${profile.name}" class="input-field"></div>
                <div><label class="block mb-1 text-sm font-medium">Address</label><input id="company-address-input" value="${profile.address}" class="input-field"></div>
                <div><label class="block mb-2 text-sm font-medium">Company Geofence Location</label><div id="company-map" style="height: 300px; width: 100%; border-radius: 0.5rem;"></div></div>
                <button id="save-company-btn" class="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center">Save Changes</button>
            </div>
        `,
        projects: () => `
            <h2 class="text-3xl font-bold mb-6">Project Profiles</h2>
            <div class="max-w-6xl mx-auto">
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
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-1 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-semibold">Employees</h3>
                            <button id="add-new-employee-btn" class="px-3 py-1 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">+ New</button>
                        </div>
                        <div class="relative mb-4">
                            <input id="employee-search-input" type="text" placeholder="Search by name..." class="input-field w-full pl-10 pr-4 py-2 border rounded-lg">
                            <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                        <div id="employees-list" class="space-y-2 flex-grow overflow-y-auto"></div>
                        <div id="employee-pagination" class="mt-4 flex justify-between items-center"></div>
                    </div>
                    <div id="employee-form-container" class="lg:col-span-2 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                        <div class="flex items-center justify-center h-full text-gray-500">Select an employee to view or edit their profile.</div>
                    </div>
                </div>
            </div>
        `,
        employeeForm: (user, canEditPayroll) => {
            const isNewUser = !user.id;
            const userWorkWeek = user.work_week || [];
            const userAllowedLocations = user.allowed_locations || [];
            const workWeekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const allLocations = [{id: 'company', name: 'Company HQ'}, ...AppState.projects];

            return `
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-semibold text-lg">${isNewUser ? 'Create New Employee' : `Edit Employee: ${user.name}`}</h3>
                    ${!isNewUser ? `<button id="view-history-btn" class="text-sm text-blue-500 hover:underline">View History</button>` : ''}
                </div>
                <form id="employee-form" class="space-y-6">
                    <div class="p-4 border rounded-lg dark:border-gray-600">
                        <h4 class="font-medium mb-4">Job Details</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label class="block text-sm mb-1">Full Name</label><input name="name" value="${user.name || ''}" class="input-field" required></div>
                            <div><label class="block text-sm mb-1">Email</label><input name="email" type="email" value="${user.email || ''}" class="input-field" ${!isNewUser ? 'disabled' : ''} required></div>
                            ${isNewUser ? `<div><label class="block text-sm mb-1">Password</label><input name="password" type="password" class="input-field" required></div>` : ''}
                            <div><label class="block text-sm mb-1">Role</label>
                                <select name="role" class="input-field">
                                    <option ${user.role === 'Employee' ? 'selected' : ''}>Employee</option>
                                    <option ${user.role === 'HR' ? 'selected' : ''}>HR</option>
                                    <option ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                                    <option ${user.role === 'Super Admin' ? 'selected' : ''}>Super Admin</option>
                                </select>
                            </div>
                            <div><label class="block text-sm mb-1">Hiring Date</label><input name="hiring_date" type="date" value="${user.hiring_date || ''}" class="input-field"></div>
                            <div><label class="block text-sm mb-1">Probation End</label><input name="probation_end" type="date" value="${user.probation_end || ''}" class="input-field"></div>
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
                            <div><label class="block text-sm mb-1">Start Time</label><input name="work_start_time" type="time" value="${user.work_start_time || ''}" class="input-field"></div>
                            <div><label class="block text-sm mb-1">End Time</label><input name="work_end_time" type="time" value="${user.work_end_time || ''}" class="input-field"></div>
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
                        ${!isNewUser ? `
                        <div>
                            <h5 class="font-medium text-sm mb-2">Facial Recognition</h5>
                            <button id="register-face-btn" type="button" class="px-4 py-2 text-sm text-white ${user.has_face_descriptor ? 'bg-green-600' : 'bg-gray-600'} rounded-lg hover:opacity-80 flex items-center justify-center">
                                ${user.has_face_descriptor ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M20 6 9 17l-5-5"></path></svg> Face Registered' : 'Register Face'}
                            </button>
                        </div>` : ''}
                    </div>

                    ${canEditPayroll && !isNewUser ? `
                    <div id="salary-banking-section" class="space-y-6">
                        <div class="p-4 border rounded-lg dark:border-gray-600">
                            <h4 class="font-medium mb-4">Salary Information</h4>
                            <div id="salary-form-content" class="text-center text-gray-500">Loading...</div>
                        </div>
                        <div class="p-4 border rounded-lg dark:border-gray-600">
                            <h4 class="font-medium mb-4">Bank Details</h4>
                            <div id="bank-form-content" class="text-center text-gray-500">Loading...</div>
                        </div>
                    </div>
                    ` : ''}
                    
                    <button type="submit" class="btn btn-primary">${isNewUser ? 'Create Employee' : 'Save Changes'}</button>
                </form>
            `;
        },
        faceRegistrationModal: (user) => `
            <div id="face-modal-backdrop" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
                <div id="face-modal" class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-full max-w-lg text-center">
                    <h3 class="font-semibold text-lg mb-2">Register Face for ${user.name}</h3>
                    <p id="modal-instructions" class="text-sm text-gray-500 mb-4 h-5">Position the employee's face in the frame.</p>
                    <div class="relative w-full aspect-video bg-gray-900 rounded-lg overflow-hidden mb-4">
                        <video id="modal-video-feed" autoplay muted playsinline class="w-full h-full object-cover"></video>
                    </div>
                    <div class="flex gap-4">
                        <button id="modal-cancel-btn" class="w-full py-2 rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300">Cancel</button>
                        <button id="modal-capture-btn" class="w-full py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center">Capture & Register</button>
                    </div>
                </div>
            </div>
        `,
        auditLogModal: (user, logs) => `
            <div id="audit-modal-backdrop" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
                <div id="audit-modal" class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-full max-w-2xl">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-semibold text-lg">Change History for ${user.name}</h3>
                        <button id="audit-modal-close-btn" class="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
                    </div>
                    <div class="max-h-96 overflow-y-auto pr-2">
                        ${logs.length === 0 ? '<p class="text-gray-500">No history found for this user.</p>' : ''}
                        <ul class="space-y-4">
                            ${logs.map(log => `
                                <li class="border-b dark:border-gray-700 pb-2">
                                    <p class="font-semibold text-sm">${log.action.replace('_', ' ')}</p>
                                    <p class="text-xs text-gray-500">by ${log.actor_email} on ${new Date(log.timestamp).toLocaleString()}</p>
                                    <p class="text-sm mt-1">${log.details}</p>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `,
        leave: (user) => {
            const isAdmin = ['Admin', 'Super Admin', 'HR'].includes(user.role);
            return `
                <h2 class="text-3xl font-bold mb-6">Leave Management</h2>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="lg:col-span-2">
                        ${isAdmin ? `
                            <div id="admin-leave-view">
                                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                                    <h3 class="font-semibold mb-4">Pending Requests</h3>
                                    <div id="pending-requests-list" class="space-y-4"></div>
                                </div>
                                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mt-6">
                                    <h3 class="font-semibold mb-4">Resolved Requests</h3>
                                    <div id="resolved-requests-list" class="space-y-4"></div>
                                </div>
                            </div>
                        ` : `
                            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                                <h3 class="font-semibold mb-4">Request Time Off</h3>
                                <form id="leave-request-form" class="space-y-4">
                                    <div>
                                        <label class="block text-sm mb-1">Leave Type</label>
                                        <select name="leave_type" class="input-field" required>
                                            <option>Annual</option>
                                            <option>Sick</option>
                                            <option>Unpaid</option>
                                            <option>Other</option>
                                        </select>
                                    </div>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label class="block text-sm mb-1">Start Date</label><input name="start_date" type="date" class="input-field" required></div>
                                        <div><label class="block text-sm mb-1">End Date</label><input name="end_date" type="date" class="input-field" required></div>
                                    </div>
                                    <div><label class="block text-sm mb-1">Reason</label><textarea name="reason" rows="3" class="input-field" required></textarea></div>
                                    <button type="submit" class="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center">Submit Request</button>
                                </form>
                            </div>
                        `}
                    </div>
                    <div class="lg:col-span-1">
                        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                            <h3 class="font-semibold mb-4">My Leave History</h3>
                            <div id="my-leave-history" class="space-y-3"></div>
                        </div>
                    </div>
                </div>
            `;
        },
        workflows: () => `
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-3xl font-bold">Workflows</h2>
                <div>
                    <button id="manage-templates-btn" class="px-4 py-2 text-sm text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800">Manage Templates</button>
                    <button id="start-workflow-btn" class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 ml-2">Start New Workflow</button>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                <h3 class="font-semibold mb-4">Active Workflows</h3>
                <div id="workflow-instances-list" class="space-y-4"></div>
            </div>
        `,
        payroll: (user) => {
            const isAdmin = ['Super Admin', 'HR'].includes(user.role);
            return `
                <h2 class="text-3xl font-bold mb-6">Payroll</h2>
                ${isAdmin ? `
                    <!-- Admin View -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div class="lg:col-span-1">
                            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                                <h3 class="font-semibold mb-4">Run New Payroll</h3>
                                <form id="run-payroll-form" class="space-y-4">
                                    <div>
                                        <label class="block text-sm mb-1">Select Month & Year</label>
                                        <input type="month" name="period" class="input-field" required>
                                    </div>
                                    <button type="submit" class="w-full px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center">Run Payroll</button>
                                </form>
                            </div>
                        </div>
                        <div class="lg:col-span-2">
                             <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                                <h3 class="font-semibold mb-4">Payroll History</h3>
                                <div id="payroll-history-list"></div>
                            </div>
                        </div>
                    </div>
                ` : `
                    <!-- Employee View -->
                    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                        <h3 class="font-semibold mb-4">My Payslips</h3>
                        <div id="my-payslips-list" class="space-y-3"></div>
                    </div>
                `}
            `;
        }
    };

    // --- 6. INITIALIZATION AND AUTHENTICATION ---
    
    async function init() {
        loginForm.addEventListener('submit', handleLogin);
        const token = localStorage.getItem('accessToken');

        if (token) {
            try {
                const user = await apiFetch('/users/me/');
                AppState.currentUser = user;
                loginView.classList.add('hidden');
                appShell.classList.remove('hidden');
                await initializeAppShell();
            } catch (error) {
                console.error("Session restore failed:", error);
                localStorage.removeItem('accessToken');
                loginView.classList.remove('hidden');
                appShell.classList.add('hidden');
            }
        } else {
            loginView.classList.remove('hidden');
            appShell.classList.add('hidden');
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const loginButton = e.target.querySelector('button[type="submit"]');
        setLoadingState(loginButton, true);
        
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

            loginView.classList.add('hidden');
            appShell.classList.remove('hidden');
            await initializeAppShell();

        } catch (error) {
            console.error("Login Error:", error);
            loginError.textContent = 'Incorrect email or password.';
            loginError.classList.remove('hidden');
        } finally {
            setLoadingState(loginButton, false);
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
        appShell.classList.add('hidden');
        loginView.classList.remove('hidden');
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
            
            switchToView('dashboard');
        } catch (error) {
            console.error("Failed to load initial app data:", error);
            showToast("Could not load application data. Please try again.", "error");
        }
    }

    // --- 7. NAVIGATION ---
    
    function setupNavigation() {
        const navItems = [
            { view: 'dashboard', label: 'Dashboard', roles: ['Super Admin', 'Admin', 'HR', 'Employee'] },
            { view: 'workflows', label: 'Workflows', roles: ['Super Admin', 'Admin', 'HR'] },
            { view: 'leave', label: 'Leave', roles: ['Super Admin', 'Admin', 'HR', 'Employee'] },
            { view: 'attendance', label: 'Attendance', roles: ['Super Admin', 'Admin', 'HR', 'Employee'] },
            { view: 'attendance_report', label: 'Attendance Report', roles: ['Super Admin', 'Admin', 'HR'] },
            { view: 'employees', label: 'Employees', roles: ['Super Admin', 'Admin', 'HR'] },
            { view: 'payroll', label: 'Payroll', roles: ['Super Admin', 'HR', 'Employee'] },
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
            case 'dashboard':
                mainContent.innerHTML = templates.dashboard(AppState.currentUser);
                initializeDashboardModule();
                break;
            case 'attendance':
                mainContent.innerHTML = templates.attendance(AppState.currentUser);
                initializeAttendanceModule();
                break;
            case 'attendance_report':
                mainContent.innerHTML = templates.attendanceReport();
                initializeAttendanceReportModule();
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
            case 'leave':
                mainContent.innerHTML = templates.leave(AppState.currentUser);
                initializeLeaveModule();
                break;
            case 'workflows':
                mainContent.innerHTML = templates.workflows();
                initializeWorkflowModule();
                break;
            case 'payroll':
                mainContent.innerHTML = templates.payroll(AppState.currentUser);
                initializePayrollModule();
                break;
        }
    }

    // --- 8. MODULES ---

    function initializeDashboardModule() {
        const timeEl = document.getElementById('dashboard-time');
        const dateEl = document.getElementById('dashboard-date');
        
        function updateTime() {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        updateTime();
        setInterval(updateTime, 1000 * 30);

        document.getElementById('dashboard-check-in-btn').addEventListener('click', () => {
            switchToView('attendance');
        });
    }

    function initializeCompanyModule() {
        const nameInput = document.getElementById('company-name-input');
        const addressInput = document.getElementById('company-address-input');
        const saveBtn = document.getElementById('save-company-btn');
        
        const map = L.map('company-map').setView(AppState.companyProfile.location, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        let marker = L.marker(AppState.companyProfile.location).addTo(map);
        
        map.on('click', (e) => marker.setLatLng(e.latlng));

        saveBtn.addEventListener('click', async () => {
            setLoadingState(saveBtn, true);
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
                showToast('Company profile updated!', 'success');
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                setLoadingState(saveBtn, false);
            }
        });
    }
    
    function initializeProjectsModule() {
        const projectsListContainer = document.getElementById('projects-list');
        const projectFormContainer = document.getElementById('project-form-container');
        const addNewProjectBtn = document.getElementById('add-new-project-btn');

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
            const project = projectId ? AppState.projects.find(p => p.id === projectId) : { id: null, name: '', status: 'Active', location: AppState.companyProfile.location };
            
            projectFormContainer.innerHTML = `
                <h3 class="font-semibold text-lg">${project.id ? 'Edit Project' : 'New Project'}</h3>
                <form id="project-form" class="space-y-4 mt-4">
                    <div><label class="block mb-1 text-sm font-medium">Project Name</label><input name="name" value="${project.name}" class="input-field" required></div>
                    <div><label class="block mb-1 text-sm font-medium">Status</label>
                        <select name="status" class="input-field">
                            <option ${project.status === 'Active' ? 'selected' : ''}>Active</option>
                            <option ${project.status === 'Completed' ? 'selected' : ''}>Completed</option>
                            <option ${project.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                    <div><label class="block mb-2 text-sm font-medium">Project Geofence Location</label><div id="project-map" style="height: 250px; width: 100%; border-radius: 0.5rem;"></div></div>
                    <button type="submit" class="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center">Save Project</button>
                </form>
            `;

            const map = L.map('project-map').setView(project.location, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            let marker = L.marker(project.location).addTo(map);
            map.on('click', (e) => marker.setLatLng(e.latlng));
            
            const projectForm = document.getElementById('project-form');
            projectForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitButton = e.target.querySelector('button[type="submit"]');
                setLoadingState(submitButton, true);

                const formData = new FormData(e.target);
                const projectIdToSave = project.id || `proj-${Date.now()}`;
                
                const projectData = {
                    id: projectIdToSave,
                    name: formData.get('name'),
                    status: formData.get('status'),
                    location: marker.getLatLng()
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
                    
                    showToast('Project saved successfully!', 'success');
                    renderProjectsList();
                    projectFormContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Select a project to edit or add a new one.</div>';
                } catch (error) {
                    showToast(`Error: ${error.message}`, 'error');
                } finally {
                    setLoadingState(submitButton, false);
                }
            });
        }

        addNewProjectBtn.addEventListener('click', () => renderProjectForm(null));
        renderProjectsList();
    }
    
    function initializeEmployeesModule() {
        const listContainer = document.getElementById('employees-list');
        const formContainer = document.getElementById('employee-form-container');
        const searchInput = document.getElementById('employee-search-input');
        const paginationContainer = document.getElementById('employee-pagination');
        const addNewEmployeeBtn = document.getElementById('add-new-employee-btn');

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
            const user = userId ? AppState.users.find(u => u.id === userId) : { id: null };
            if (!user) return;
            const canEditPayroll = ['Super Admin', 'HR'].includes(AppState.currentUser.role);

            formContainer.innerHTML = templates.employeeForm(user, canEditPayroll);
            
            if (!user.id) {
                // It's a new user, no extra actions needed
            } else {
                document.getElementById('register-face-btn')?.addEventListener('click', () => {
                    initializeFaceRegistrationModal(user);
                });
                document.getElementById('view-history-btn')?.addEventListener('click', () => {
                    initializeAuditLogModal(user);
                });
                if (canEditPayroll) {
                    loadSalaryDetails(user.id);
                    loadBankDetails(user.id);
                }
            }
            
            const employeeForm = document.getElementById('employee-form');
            employeeForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitButton = e.target.querySelector('button[type="submit"]');
                setLoadingState(submitButton, true);

                const formData = new FormData(e.target);
                const updatedData = {};
                for (let [key, value] of formData.entries()) {
                    if (value) updatedData[key] = value;
                }
                
                updatedData.allowed_locations = Array.from(document.querySelectorAll('.location-checkbox:checked')).map(cb => cb.dataset.location);
                updatedData.work_week = Array.from(document.querySelectorAll('.work-day-btn.bg-blue-600')).map(btn => btn.dataset.day);

                try {
                    if (!user.id) {
                        const newUser = await apiFetch(`/users/`, {
                            method: 'POST',
                            body: JSON.stringify(updatedData)
                        });
                        AppState.users.push(newUser);
                        showToast('Employee created successfully!', 'success');
                    } else {
                        const savedUser = await apiFetch(`/users/${userId}`, {
                            method: 'PUT',
                            body: JSON.stringify(updatedData)
                        });
                        const userIndex = AppState.users.findIndex(u => u.id === userId);
                        AppState.users[userIndex] = savedUser;
                        showToast('Employee profile saved successfully!', 'success');
                    }
                    
                    render();
                    formContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Select an employee to view or edit their profile.</div>';
                } catch (error) {
                    showToast(`Error: ${error.message}`, 'error');
                } finally {
                    setLoadingState(submitButton, false);
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

        async function loadSalaryDetails(userId) {
            const container = document.getElementById('salary-form-content');
            try {
                const salary = await apiFetch(`/salaries/${userId}`);
                container.innerHTML = `
                    <form id="salary-form" class="space-y-4 text-left">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label class="block text-sm mb-1">Gross Salary</label><input name="gross_salary" type="number" step="0.01" value="${salary.gross_salary || ''}" class="input-field" required></div>
                            <div><label class="block text-sm mb-1">Pay Frequency</label>
                                <select name="pay_frequency" class="input-field">
                                    <option ${salary.pay_frequency === 'Monthly' ? 'selected' : ''}>Monthly</option>
                                    <option ${salary.pay_frequency === 'Weekly' ? 'selected' : ''}>Weekly</option>
                                </select>
                            </div>
                        </div>
                        <div><label class="block text-sm mb-1">Effective Date</label><input name="effective_date" type="date" value="${salary.effective_date || ''}" class="input-field" required></div>
                        <button type="submit" class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Salary</button>
                    </form>
                `;
                document.getElementById('salary-form').addEventListener('submit', (e) => handleSalarySubmit(e, userId));
            } catch (error) {
                container.innerHTML = `
                    <p class="text-gray-500 text-sm mb-2">No salary information found.</p>
                    <button id="add-salary-btn" type="button" class="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">Add Salary Info</button>
                `;
                document.getElementById('add-salary-btn').addEventListener('click', () => {
                    container.innerHTML = `
                        <form id="salary-form" class="space-y-4 text-left">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label class="block text-sm mb-1">Gross Salary</label><input name="gross_salary" type="number" step="0.01" class="input-field" required></div>
                                <div><label class="block text-sm mb-1">Pay Frequency</label><select name="pay_frequency" class="input-field"><option>Monthly</option><option>Weekly</option></select></div>
                            </div>
                            <div><label class="block text-sm mb-1">Effective Date</label><input name="effective_date" type="date" class="input-field" required></div>
                            <button type="submit" class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Salary</button>
                        </form>
                    `;
                    document.getElementById('salary-form').addEventListener('submit', (e) => handleSalarySubmit(e, userId));
                });
            }
        }

        async function handleSalarySubmit(e, userId) {
            e.preventDefault();
            const form = e.target;
            const submitButton = form.querySelector('button[type="submit"]');
            setLoadingState(submitButton, true);
            const formData = new FormData(form);
            const salaryData = { user_id: userId, ...Object.fromEntries(formData.entries()) };
            try {
                await apiFetch('/salaries/', { method: 'POST', body: JSON.stringify(salaryData) });
                showToast('Salary details saved successfully!', 'success');
                loadSalaryDetails(userId);
            } catch (error) {
                showToast(`Error saving salary: ${error.message}`, 'error');
            } finally {
                setLoadingState(submitButton, false);
            }
        }

        async function loadBankDetails(userId) {
            const container = document.getElementById('bank-form-content');
            try {
                const details = await apiFetch(`/bank-details/${userId}`);
                container.innerHTML = `
                    <form id="bank-form" class="space-y-4 text-left">
                        <div><label class="block text-sm mb-1">Bank Name</label><input name="bank_name" value="${details.bank_name || ''}" class="input-field" required></div>
                        <div><label class="block text-sm mb-1">Account Number</label><input name="account_number" value="${details.account_number || ''}" class="input-field" required></div>
                        <div><label class="block text-sm mb-1">IBAN</label><input name="iban" value="${details.iban || ''}" class="input-field" required></div>
                        <button type="submit" class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Bank Details</button>
                    </form>
                `;
                document.getElementById('bank-form').addEventListener('submit', (e) => handleBankDetailsSubmit(e, userId));
            } catch (error) {
                container.innerHTML = `
                    <p class="text-gray-500 text-sm mb-2">No bank details found.</p>
                    <button id="add-bank-btn" type="button" class="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">Add Bank Details</button>
                `;
                document.getElementById('add-bank-btn').addEventListener('click', () => {
                    container.innerHTML = `
                         <form id="bank-form" class="space-y-4 text-left">
                            <div><label class="block text-sm mb-1">Bank Name</label><input name="bank_name" class="input-field" required></div>
                            <div><label class="block text-sm mb-1">Account Number</label><input name="account_number" class="input-field" required></div>
                            <div><label class="block text-sm mb-1">IBAN</label><input name="iban" class="input-field" required></div>
                            <button type="submit" class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Bank Details</button>
                        </form>
                    `;
                    document.getElementById('bank-form').addEventListener('submit', (e) => handleBankDetailsSubmit(e, userId));
                });
            }
        }
        
        async function handleBankDetailsSubmit(e, userId) {
            e.preventDefault();
            const form = e.target;
            const submitButton = form.querySelector('button[type="submit"]');
            setLoadingState(submitButton, true);
            const formData = new FormData(form);
            const bankData = { user_id: userId, ...Object.fromEntries(formData.entries()) };
            try {
                await apiFetch('/bank-details/', { method: 'POST', body: JSON.stringify(bankData) });
                showToast('Bank details saved successfully!', 'success');
                loadBankDetails(userId);
            } catch (error) {
                showToast(`Error saving bank details: ${error.message}`, 'error');
            } finally {
                setLoadingState(submitButton, false);
            }
        }

        searchInput.addEventListener('input', () => {
            currentPage = 1;
            selectedUserId = null;
            formContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">Select an employee to view or edit their profile.</div>';
            render();
        });
        
        addNewEmployeeBtn.addEventListener('click', () => {
            selectedUserId = null;
            render();
            renderEmployeeForm(null);
        });

        render();
    }

    function initializeAttendanceModule() {
        const video = document.getElementById('video-feed');
        const toggleCameraBtn = document.getElementById('toggle-camera-btn');
        const checkInBtn = document.getElementById('check-in-btn');
        const checkOutBtn = document.getElementById('check-out-btn');

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
            if (!AppState.isCameraOn) {
                updateStatus('error', 'Please turn on the camera first.');
                return;
            }
            updateStatus('info', 'Getting your location...');
            setLoadingState(checkInBtn, true);

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    updateStatus('info', 'Location acquired. Verifying face...');
                    const { latitude, longitude } = position.coords;
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);

                    canvas.toBlob(async (blob) => {
                        const formData = new FormData();
                        formData.append('file', blob, 'checkin_face.jpg');
                        formData.append('latitude', latitude);
                        formData.append('longitude', longitude);

                        try {
                            const result = await apiFetch('/attendance/check-in', {
                                method: 'POST',
                                body: formData,
                            });

                            updateStatus('success', `Check-in successful!`);
                            AppState.checkInTime = new Date(result.check_in_time);
                            document.getElementById('check-in-time').textContent = AppState.checkInTime.toLocaleTimeString();
                            checkInBtn.classList.add('hidden');
                            checkOutBtn.classList.remove('hidden');

                        } catch (error) {
                            updateStatus('error', `Check-in failed: ${error.message}`);
                        } finally {
                            stopCamera();
                            setLoadingState(checkInBtn, false);
                        }
                    }, 'image/jpeg');
                },
                (error) => {
                    updateStatus('error', 'Could not get location. Please enable location services.');
                    setLoadingState(checkInBtn, false);
                }
            );
        }

        function handleCheckOut() {
            setLoadingState(checkOutBtn, true);
            apiFetch('/attendance/check-out', { method: 'POST' })
                .then(result => {
                    updateStatus('success', 'Checked out successfully. Have a great day!');
                    AppState.checkOutTime = new Date(result.check_out_time);
                    document.getElementById('check-out-time').textContent = AppState.checkOutTime.toLocaleTimeString();
                    checkOutBtn.classList.add('hidden');
                })
                .catch(error => {
                    updateStatus('error', `Check-out failed: ${error.message}`);
                })
                .finally(() => {
                    setLoadingState(checkOutBtn, false);
                });
        }

        function updateStatus(type, message) {
            const statusDiv = document.getElementById('status-message');
            if (!statusDiv) return;
            statusDiv.textContent = message;
            statusDiv.className = 'p-4 rounded-lg border-l-4 flex items-center'; // Reset classes
            if (type === 'success') statusDiv.classList.add('bg-green-100', 'dark:bg-green-900', 'border-green-500', 'text-green-800', 'dark:text-green-200');
            else if (type === 'error') statusDiv.classList.add('bg-red-100', 'dark:bg-red-900', 'border-red-500', 'text-red-800', 'dark:text-red-200');
            else statusDiv.classList.add('bg-blue-100', 'dark:bg-blue-900', 'border-blue-500', 'text-blue-800', 'dark:text-blue-200');
        }
    }
    
    function initializeFaceRegistrationModal(user) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = templates.faceRegistrationModal(user);
        document.body.appendChild(modalContainer);

        const video = document.getElementById('modal-video-feed');
        const instructions = document.getElementById('modal-instructions');
        const captureBtn = document.getElementById('modal-capture-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const backdrop = document.getElementById('face-modal-backdrop');

        let videoStream = null;

        function closeModal() {
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }
            modalContainer.remove();
        }

        navigator.mediaDevices.getUserMedia({ video: {} })
            .then(stream => {
                videoStream = stream;
                video.srcObject = stream;
            })
            .catch(err => {
                showToast('Camera access denied. Please enable permissions.', 'error');
                closeModal();
            });

        captureBtn.addEventListener('click', async () => {
            setLoadingState(captureBtn, true);
            instructions.textContent = 'Uploading and processing...';

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            canvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('file', blob, 'face.jpg');

                try {
                    const updatedUser = await apiFetch(`/users/${user.id}/register-face`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    const userIndex = AppState.users.findIndex(u => u.id === user.id);
                    AppState.users[userIndex] = updatedUser;

                    showToast('Face registered successfully!', 'success');
                    closeModal();
                    
                    const userButton = document.querySelector(`#employees-list button[data-user-id='${user.id}']`);
                    if (userButton) userButton.click();

                } catch (error) {
                    showToast(`Registration failed: ${error.message}`, 'error');
                    instructions.textContent = 'Capture failed. Please try again.';
                } finally {
                    setLoadingState(captureBtn, false);
                }

            }, 'image/jpeg');
        });

        cancelBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal();
            }
        });
    }

    async function initializeAuditLogModal(user) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = templates.auditLogModal(user, [{
            action: "LOADING",
            details: "Fetching history...",
            actor_email: "System",
            timestamp: new Date().toISOString()
        }]);
        document.body.appendChild(modalContainer);

        function closeModal() {
            modalContainer.remove();
        }
        
        document.getElementById('audit-modal-close-btn').addEventListener('click', closeModal);
        document.getElementById('audit-modal-backdrop').addEventListener('click', (e) => {
            if (e.target.id === 'audit-modal-backdrop') closeModal();
        });

        try {
            const logs = await apiFetch(`/audit-logs/USER/${user.id}`);
            modalContainer.innerHTML = templates.auditLogModal(user, logs);
            document.getElementById('audit-modal-close-btn').addEventListener('click', closeModal);
            document.getElementById('audit-modal-backdrop').addEventListener('click', (e) => {
                if (e.target.id === 'audit-modal-backdrop') closeModal();
            });
        } catch (error) {
            showToast(`Error fetching history: ${error.message}`, 'error');
            closeModal();
        }
    }

    async function initializeLeaveModule() {
        const isAdmin = ['Admin', 'Super Admin', 'HR'].includes(AppState.currentUser.role);

        if (isAdmin) {
            const pendingList = document.getElementById('pending-requests-list');
            const resolvedList = document.getElementById('resolved-requests-list');
            
            async function renderAdminLists() {
                try {
                    const allRequests = await apiFetch('/leave-requests/');
                    const pending = allRequests.filter(r => r.status === 'Pending');
                    const resolved = allRequests.filter(r => r.status !== 'Pending');

                    pendingList.innerHTML = pending.length ? pending.map(renderAdminRequestCard).join('') : '<p class="text-gray-500">No pending requests.</p>';
                    resolvedList.innerHTML = resolved.length ? resolved.map(renderAdminRequestCard).join('') : '<p class="text-gray-500">No resolved requests.</p>';
                    
                    document.querySelectorAll('.approve-leave-btn, .deny-leave-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const requestId = e.target.dataset.id;
                            const status = e.target.dataset.status;
                            setLoadingState(e.target, true);
                            try {
                                await apiFetch(`/leave-requests/${requestId}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ status: status })
                                });
                                showToast(`Request has been ${status.toLowerCase()}.`, 'success');
                                renderAdminLists();
                            } catch (error) {
                                showToast(`Error: ${error.message}`, 'error');
                                setLoadingState(e.target, false);
                            }
                        });
                    });

                } catch (error) {
                    showToast(`Failed to load leave requests: ${error.message}`, 'error');
                }
            }
            
            function renderAdminRequestCard(req) {
                return `
                    <div class="p-4 border rounded-lg dark:border-gray-700">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-semibold">${req.owner_name}</p>
                                <p class="text-sm">${req.leave_type} Leave: ${req.start_date} to ${req.end_date}</p>
                                <p class="text-sm text-gray-500 mt-1">${req.reason}</p>
                            </div>
                            ${req.status === 'Pending' ? `
                            <div class="flex gap-2">
                                <button data-id="${req.id}" data-status="Approved" class="approve-leave-btn px-3 py-1 text-xs text-white bg-green-500 rounded-full hover:bg-green-600">Approve</button>
                                <button data-id="${req.id}" data-status="Denied" class="deny-leave-btn px-3 py-1 text-xs text-white bg-red-500 rounded-full hover:bg-red-600">Deny</button>
                            </div>
                            ` : `<span class="text-sm font-bold ${req.status === 'Approved' ? 'text-green-500' : 'text-red-500'}">${req.status}</span>`}
                        </div>
                    </div>
                `;
            }
            
            renderAdminLists();

        } else {
            const form = document.getElementById('leave-request-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitButton = e.target.querySelector('button[type="submit"]');
                setLoadingState(submitButton, true);

                const formData = new FormData(e.target);
                const requestData = Object.fromEntries(formData.entries());

                try {
                    await apiFetch('/leave-requests/', {
                        method: 'POST',
                        body: JSON.stringify(requestData)
                    });
                    showToast('Leave request submitted successfully!', 'success');
                    form.reset();
                    renderMyHistory();
                } catch (error) {
                    showToast(`Error: ${error.message}`, 'error');
                } finally {
                    setLoadingState(submitButton, false);
                }
            });
        }
        
        const historyContainer = document.getElementById('my-leave-history');
        async function renderMyHistory() {
            try {
                const myRequests = await apiFetch('/leave-requests/me');
                if (myRequests.length === 0) {
                    historyContainer.innerHTML = '<p class="text-gray-500 text-sm">You have not submitted any leave requests.</p>';
                    return;
                }
                historyContainer.innerHTML = myRequests.map(req => {
                    const statusColors = {
                        Pending: 'bg-yellow-500',
                        Approved: 'bg-green-500',
                        Denied: 'bg-red-500'
                    };
                    return `
                        <div>
                            <div class="flex justify-between items-center">
                                <p class="font-semibold text-sm">${req.leave_type} Leave</p>
                                <span class="text-xs text-white px-2 py-0.5 rounded-full ${statusColors[req.status]}">${req.status}</span>
                            </div>
                            <p class="text-xs text-gray-500">${req.start_date} to ${req.end_date}</p>
                        </div>
                    `;
                }).join('<hr class="my-3 dark:border-gray-700">');
            } catch (error) {
                 historyContainer.innerHTML = '<p class="text-red-500 text-sm">Could not load history.</p>';
            }
        }
        renderMyHistory();
    }

    function initializeAttendanceReportModule() {
        const generateBtn = document.getElementById('generate-report-btn');
        const exportBtn = document.getElementById('export-csv-btn');
        const tableBody = document.getElementById('report-table-body');
        let reportData = [];

        const endDateInput = document.getElementById('end-date-filter');
        const startDateInput = document.getElementById('start-date-filter');
        const today = new Date().toISOString().split('T')[0];
        endDateInput.value = today;
        const lastMonth = new Date();
        lastMonth.setDate(lastMonth.getDate() - 30);
        startDateInput.value = lastMonth.toISOString().split('T')[0];

        async function generateReport() {
            setLoadingState(generateBtn, true);
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            
            if (!startDate || !endDate) {
                showToast('Please select both a start and end date.', 'error');
                setLoadingState(generateBtn, false);
                return;
            }

            try {
                const data = await apiFetch(`/attendance/report?start_date=${startDate}&end_date=${endDate}`);
                reportData = data;
                
                if (data.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No records found for this date range.</td></tr>`;
                    return;
                }

                tableBody.innerHTML = data.map(record => {
                    const checkIn = new Date(record.check_in_time);
                    const checkOut = record.check_out_time ? new Date(record.check_out_time) : null;
                    let workHours = 'N/A';
                    if (checkOut) {
                        const diffMs = checkOut - checkIn;
                        const hours = Math.floor(diffMs / 3600000);
                        const minutes = Math.floor((diffMs % 3600000) / 60000);
                        workHours = `${hours}h ${minutes}m`;
                    }

                    return `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap">${record.date}</td>
                            <td class="px-6 py-4 whitespace-nowrap">${record.user_name}</td>
                            <td class="px-6 py-4 whitespace-nowrap">${checkIn.toLocaleTimeString()}</td>
                            <td class="px-6 py-4 whitespace-nowrap">${checkOut ? checkOut.toLocaleTimeString() : 'Not checked out'}</td>
                            <td class="px-6 py-4 whitespace-nowrap">${workHours}</td>
                        </tr>
                    `;
                }).join('');

            } catch (error) {
                showToast(`Failed to generate report: ${error.message}`, 'error');
                tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Error loading data.</td></tr>`;
            } finally {
                setLoadingState(generateBtn, false);
            }
        }
        
        function exportToCSV() {
            if (reportData.length === 0) {
                showToast('No data to export. Please generate a report first.', 'info');
                return;
            }
            
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Date,Employee,Check In,Check Out,Work Hours\r\n";

            reportData.forEach(record => {
                const checkIn = new Date(record.check_in_time);
                const checkOut = record.check_out_time ? new Date(record.check_out_time) : null;
                let workHours = 'N/A';
                if (checkOut) {
                    const diffMs = checkOut - checkIn;
                    const hours = Math.floor(diffMs / 3600000);
                    const minutes = Math.floor((diffMs % 3600000) / 60000);
                    workHours = `${hours}h ${minutes}m`;
                }
                
                const row = [
                    record.date,
                    record.user_name,
                    checkIn.toLocaleTimeString(),
                    checkOut ? checkOut.toLocaleTimeString() : '',
                    workHours
                ].join(',');
                csvContent += row + "\r\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "attendance_report.csv");
            document.body.appendChild(link);
            link.click();
            link.remove();
        }

        generateBtn.addEventListener('click', generateReport);
        exportBtn.addEventListener('click', exportToCSV);
        
        generateReport();
    }
    
    async function initializeWorkflowModule() {
        const instancesList = document.getElementById('workflow-instances-list');
        
        document.getElementById('manage-templates-btn').addEventListener('click', () => {
            showToast('Managing templates is not yet implemented.', 'info');
        });
        document.getElementById('start-workflow-btn').addEventListener('click', () => {
            showToast('Starting a new workflow is not yet implemented.', 'info');
        });

        async function renderInstances() {
            try {
                const instances = await apiFetch('/workflow-instances/');
                if (instances.length === 0) {
                    instancesList.innerHTML = '<p class="text-gray-500">No active workflows.</p>';
                    return;
                }
                instancesList.innerHTML = instances.map(instance => {
                    const completedTasks = instance.tasks.filter(t => t.status === 'Completed').length;
                    const totalTasks = instance.tasks.length;
                    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                    return `
                        <div class="p-4 border rounded-lg dark:border-gray-700">
                            <div class="flex justify-between items-center">
                                <div>
                                    <p class="font-semibold">${instance.template_name} for ${instance.user_name}</p>
                                    <p class="text-sm text-gray-500">${instance.status} - ${completedTasks} of ${totalTasks} tasks complete</p>
                                </div>
                                <button class="text-sm text-blue-500 hover:underline">View Details</button>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            } catch (error) {
                showToast(`Error loading workflows: ${error.message}`, 'error');
            }
        }

        renderInstances();
    }
    
    async function initializePayrollModule() {
        const isAdmin = ['Super Admin', 'HR'].includes(AppState.currentUser.role);
        
        if (isAdmin) {
            const runPayrollForm = document.getElementById('run-payroll-form');
            const historyList = document.getElementById('payroll-history-list');

            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const year = lastMonth.getFullYear();
            const month = (lastMonth.getMonth() + 1).toString().padStart(2, '0');
            runPayrollForm.querySelector('input[name="period"]').value = `${year}-${month}`;

            runPayrollForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitButton = e.target.querySelector('button[type="submit"]');
                setLoadingState(submitButton, true);
                
                const period = e.target.querySelector('input[name="period"]').value;
                const [year, month] = period.split('-');

                try {
                    const payslips = await apiFetch(`/payroll/run/${year}/${month}`, { method: 'POST' });
                    showToast(`Successfully ran payroll for ${month}/${year} for ${payslips.length} employees.`, 'success');
                    renderPayrollHistory();
                } catch (error) {
                    showToast(`Error running payroll: ${error.message}`, 'error');
                } finally {
                    setLoadingState(submitButton, false);
                }
            });

            async function renderPayrollHistory() {
                historyList.innerHTML = '<p class="text-gray-500">Loading history...</p>';
                const period = runPayrollForm.querySelector('input[name="period"]').value;
                const [year, month] = period.split('-');
                try {
                    const payslips = await apiFetch(`/payslips/${year}/${month}`);
                    if (payslips.length > 0) {
                         historyList.innerHTML = `
                            <div class="p-4 border rounded-lg dark:border-gray-700">
                                <p class="font-semibold">Payroll for ${month}/${year}</p>
                                <p class="text-sm text-gray-500">${payslips.length} payslips generated.</p>
                                <button class="text-sm text-blue-500 hover:underline mt-2">View Details</button>
                            </div>
                         `;
                    } else {
                        historyList.innerHTML = '<p class="text-gray-500">No payroll history found for this period.</p>';
                    }
                } catch (error) {
                     historyList.innerHTML = '<p class="text-red-500">Could not load payroll history.</p>';
                }
            }
            renderPayrollHistory();

        } else {
            // Employee View
            const payslipList = document.getElementById('my-payslips-list');
            async function renderMyPayslips() {
                try {
                    const payslips = await apiFetch('/payslips/me');
                    if (payslips.length === 0) {
                        payslipList.innerHTML = '<p class="text-gray-500">No payslips available.</p>';
                        return;
                    }
                    payslipList.innerHTML = payslips.map(p => `
                        <div class="p-3 border rounded-lg dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <p class="font-semibold">Payslip for ${p.pay_period_start} to ${p.pay_period_end}</p>
                                <p class="text-sm text-gray-500">Net Salary: ${p.net_salary.toFixed(2)}</p>
                            </div>
                            <button class="text-sm text-blue-500 hover:underline">Download</button>
                        </div>
                    `).join('');
                } catch (error) {
                    payslipList.innerHTML = '<p class="text-red-500">Could not load payslips.</p>';
                }
            }
            renderMyPayslips();
        }
    }

    // --- 9. START THE APPLICATION ---
    init();
});
