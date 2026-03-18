// Popup script
(function () {
  'use strict';

  let extractedData = null;
  let accessToken = null;

  // DOM elements
  const loginSection = document.getElementById('login-section');
  const connectedSection = document.getElementById('connected-section');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const extractBtn = document.getElementById('extract-btn');
  const saveBtn = document.getElementById('save-btn');
  const loginError = document.getElementById('login-error');
  const userName = document.getElementById('user-name');
  const contentPreview = document.getElementById('content-preview');
  const platformBadge = document.getElementById('platform-badge');
  const previewTitle = document.getElementById('preview-title');
  const previewContent = document.getElementById('preview-content');
  const previewAuthor = document.getElementById('preview-author');
  const saveStatus = document.getElementById('save-status');
  const saveSuccess = document.getElementById('save-success');

  const platformNames = {
    facebook: 'Facebook',
    threads: 'Threads',
    youtube: 'YouTube',
    instagram: 'Instagram',
    dcard: 'Dcard',
    twitter: 'X / Twitter',
    unknown: '其他',
  };

  // Initialize
  async function init() {
    const stored = await chrome.storage.local.get(['apiUrl', 'accessToken', 'refreshToken', 'userName']);
    if (stored.accessToken) {
      accessToken = stored.accessToken;
      showConnected(stored.userName || '已連線');
      // Auto-extract on open
      autoExtract();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginSection.style.display = 'block';
    connectedSection.style.display = 'none';
  }

  function showConnected(name) {
    loginSection.style.display = 'none';
    connectedSection.style.display = 'block';
    userName.textContent = name;
  }

  // Login
  loginBtn.addEventListener('click', async () => {
    const apiUrl = document.getElementById('api-url').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showError('請輸入 Email 和密碼');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = '連線中...';
    loginError.style.display = 'none';

    try {
      const res = await fetch(`${apiUrl}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || '登入失敗');
      }

      const data = await res.json();
      accessToken = data.accessToken;

      await chrome.storage.local.set({
        apiUrl,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userName: data.user?.displayName || email,
      });

      showConnected(data.user?.displayName || email);
      autoExtract();
    } catch (err) {
      showError(err.message);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = '連線登入';
    }
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userName']);
    accessToken = null;
    showLogin();
  });

  // Extract content from current tab
  extractBtn.addEventListener('click', () => doExtract());

  async function autoExtract() {
    // Small delay to ensure content script is loaded
    setTimeout(doExtract, 300);
  }

  async function doExtract() {
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span>⏳</span> 擷取中...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('無法取得目前頁面');

      const results = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
      extractedData = results;

      // Show preview
      platformBadge.textContent = platformNames[results.platform] || results.platform;
      previewTitle.textContent = results.title || '（無標題）';
      previewContent.textContent = results.content?.slice(0, 200) || '（無法擷取內容）';
      previewAuthor.textContent = results.author ? `by ${results.author}` : '';
      contentPreview.style.display = 'block';
      saveBtn.style.display = 'flex';
      saveSuccess.style.display = 'none';
    } catch (err) {
      // Content script might not be loaded on this page
      previewTitle.textContent = '此頁面不支援擷取';
      previewContent.textContent = '請在 Facebook、YouTube、Threads、Dcard、Instagram 或 X 上使用';
      contentPreview.style.display = 'block';
    } finally {
      extractBtn.disabled = false;
      extractBtn.innerHTML = '<span>🔍</span> 擷取此頁內容';
    }
  }

  // Save with AI summary
  saveBtn.addEventListener('click', async () => {
    if (!extractedData || !accessToken) return;

    saveBtn.disabled = true;
    saveStatus.style.display = 'flex';
    saveSuccess.style.display = 'none';

    try {
      const stored = await chrome.storage.local.get(['apiUrl']);
      const apiUrl = stored.apiUrl || 'http://localhost:4000/api';

      const res = await fetch(`${apiUrl}/v1/clips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          platform: extractedData.platform,
          url: extractedData.url,
          title: extractedData.title,
          rawContent: extractedData.content,
          author: extractedData.author,
          imageUrl: extractedData.imageUrl,
        }),
      });

      if (res.status === 401) {
        // Token expired - try refresh
        await refreshAndRetry(stored.apiUrl);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || '收藏失敗');
      }

      saveStatus.style.display = 'none';
      saveSuccess.style.display = 'block';

      // Show toast on the page
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'showToast', message: '✨ 已收藏到 Creator Platform！' });
      }
    } catch (err) {
      saveStatus.style.display = 'none';
      showError(err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function refreshAndRetry(apiUrl) {
    const stored = await chrome.storage.local.get(['refreshToken']);
    if (!stored.refreshToken) {
      showLogin();
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      });

      if (!res.ok) { showLogin(); return; }

      const data = await res.json();
      accessToken = data.accessToken;
      await chrome.storage.local.set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      // Retry save
      saveBtn.click();
    } catch {
      showLogin();
    }
  }

  function showError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
  }

  // Listen for toast display request from popup
  if (typeof chrome.runtime?.onMessage !== 'undefined') {
    // This runs in popup context, toast message handled by content script
  }

  init();
})();
