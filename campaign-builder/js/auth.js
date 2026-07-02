// Keycloak authentication for admin API calls

function getAccessToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setAccessToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    updateAuthUI();
}

function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const token = getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function parseJwtPayload(token) {
    try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
}

function getAuthDisplayName() {
    const token = getAccessToken();
    if (!token) return null;
    const payload = parseJwtPayload(token);
    if (!payload) return 'Admin';
    return payload.preferred_username || payload.email || payload.name || payload.sub || 'Admin';
}

function isTokenExpired(token) {
    const payload = parseJwtPayload(token);
    if (!payload || !payload.exp) return true;
    return Date.now() >= payload.exp * 1000;
}

function updateAuthUI() {
    const statusEl = document.getElementById('auth-status');
    const loginBtn = document.getElementById('btn-show-login');
    const logoutBtn = document.getElementById('btn-logout');
    if (!statusEl || !loginBtn || !logoutBtn) return;

    const token = getAccessToken();
    if (token && !isTokenExpired(token)) {
        statusEl.textContent = getAuthDisplayName();
        statusEl.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        if (token) setAccessToken(null);
        statusEl.classList.add('hidden');
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
    }
}

function openLoginModal() {
    document.getElementById('login-modal')?.classList.add('active');
}

function closeLoginModal() {
    document.getElementById('login-modal')?.classList.remove('active');
}

window.ensureAuthenticated = function() {
    const token = getAccessToken();
    if (!token || isTokenExpired(token)) {
        showToast('Vui lòng đăng nhập tài khoản Admin/Staff trước khi gọi API.', 'error');
        openLoginModal();
        return false;
    }
    return true;
};

window.loginWithCredentials = async function(username, password) {
    const body = new URLSearchParams({
        grant_type: 'password',
        client_id: KEYCLOAK_CLIENT_ID,
        username,
        password
    });

    const response = await fetch(KEYCLOAK_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Đăng nhập thất bại');
    }

    setAccessToken(data.access_token);
    return data;
};

window.logout = function() {
    setAccessToken(null);
    showToast('Đã đăng xuất.', 'info');
};

window.fetchApi = async function(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    const headers = getAuthHeaders({
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    });

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        setAccessToken(null);
        showToast('Phiên đăng nhập hết hạn hoặc không có quyền. Vui lòng đăng nhập lại (Admin/Staff).', 'error');
        openLoginModal();
    }

    return response;
};

window.parseJsonResponse = async function(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
};

window.setupAuth = function() {
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');

    document.getElementById('btn-show-login')?.addEventListener('click', openLoginModal);
    document.getElementById('btn-logout')?.addEventListener('click', logout);
    document.getElementById('close-login-modal')?.addEventListener('click', closeLoginModal);
    document.getElementById('btn-cancel-login')?.addEventListener('click', closeLoginModal);

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const submitBtn = document.getElementById('btn-login-submit');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng nhập...';

        try {
            await loginWithCredentials(username, password);
            showToast('Đăng nhập thành công!', 'success');
            closeLoginModal();
            if (typeof loadCampaigns === 'function') loadCampaigns();
        } catch (error) {
            showToast(error.message || 'Đăng nhập thất bại.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng Nhập';
        }
    });

    updateAuthUI();
};
