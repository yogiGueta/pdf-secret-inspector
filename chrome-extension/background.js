/**
 * Background Service Worker for PDF Secret Inspector
 *
 * Handles communication between content script and backend API.
 * Chrome extensions can't make direct API calls from content scripts
 * due to CORS, so we proxy through the background script.
 *
 * TODO: Add retry logic for failed API calls
 * FIXME: Error handling could be more robust
 */

const API_BASE_URL = 'http://localhost:3000/api';

// Efficient and reliable data URL (base64) to Blob conversion
function dataUrlToBlob(dataUrl) {
  try {
    const parts = dataUrl.split(',');
    const meta = parts[0] || '';
    const b64 = parts[1] || '';
    const mimeMatch = /data:(.*?);base64/.exec(meta);
    const mime = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (e) {
    console.error('PDF Secret Inspector: Failed to convert data URL to Blob', e);
    return new Blob([], { type: 'application/pdf' });
  }
}



// POST with timeout and small retry backoff
async function postWithRetry(url, formData, { retries = 2, timeoutMs = 10000 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: formData, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      try {
        const errData = await res.json();
        lastErr = new Error(errData?.message || `HTTP ${res.status}`);
      } catch (_) {
        lastErr = new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    attempt++;
  }
  throw lastErr || new Error('Request failed');
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'inspectPDF') {
    handlePDFInspection(request)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

/**
 * Handle PDF inspection request
 */
async function handlePDFInspection(request) {
  const { file, filename, platform } = request;

  console.log(`PDF Secret Inspector: Inspecting ${filename} from ${platform}`);

  try {
    // Convert base64 data URL to Blob
    const blob = dataUrlToBlob(file);

    // Create form data for API request
    const formData = new FormData();
    formData.append('pdf', blob, filename);

    // Send to backend API with timeout + retry
    const apiResponse = await postWithRetry(`${API_BASE_URL}/inspect-pdf`, formData, { retries: 2, timeoutMs: 10000 });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      throw new Error(errorData.message || 'API request failed');
    }

    const result = await apiResponse.json();

    // Log inspection result
    console.log('PDF Secret Inspector: Inspection result', result);

    // Store result in extension storage for popup
    await chrome.storage.local.set({
      lastInspection: {
        filename,
        platform,
        timestamp: new Date().toISOString(),
        ...result
      }
    });

    // Update extension statistics
    await updateStats(result.secretsFound);

    return result;

  } catch (error) {
    console.error('PDF Secret Inspector: API error', error);

    // Fallback: basic client-side detection
    console.log('PDF Secret Inspector: Falling back to basic detection');
    return performBasicDetection(filename);
  }
}

/**
 * Basic client-side detection as fallback
 * This is very limited but better than nothing if API is down
 */
function performBasicDetection(filename) {
  // This is a very basic fallback - just check filename patterns
  const suspiciousPatterns = [
    /secret/i,
    /password/i,
    /credential/i,
    /key/i,
    /token/i,
    /config/i
  ];

  const hasSuspiciousName = suspiciousPatterns.some(pattern =>
    pattern.test(filename)
  );

  return {
    filename,
    fileSize: 0,
    processingTime: 0,
    secretsFound: hasSuspiciousName ? 1 : 0,
    riskLevel: hasSuspiciousName ? 'MEDIUM' : 'NONE',
    secrets: hasSuspiciousName ? [{
      type: 'Suspicious Filename',
      description: 'Filename contains potentially sensitive keywords',
      confidence: 0.3,
      location: 0,
      riskLevel: 'MEDIUM',
      source: 'local'
    }] : [],
    metadata: {
      pages: 0,
      wordCount: 0,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('PDF Secret Inspector: Extension installed');

    // Set default settings
    chrome.storage.local.set({
      settings: {
        enabled: true,
        blockUploads: false,
        showNotifications: true
      }
    });
  }
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('PDF Secret Inspector: Extension started');
});

/**
 * Update extension statistics
 */
async function updateStats(secretsFound) {
  try {
    const result = await chrome.storage.local.get('stats');
    const stats = result.stats || {
      filesScanned: 0,
      secretsFound: 0
    };

    stats.filesScanned += 1;
    stats.secretsFound += secretsFound;

    await chrome.storage.local.set({ stats });

    console.log('PDF Secret Inspector: Stats updated', stats);

    // Also log to verify storage
    const verification = await chrome.storage.local.get('stats');
    console.log('PDF Secret Inspector: Stats verification', verification.stats);

  } catch (error) {
    console.error('PDF Secret Inspector: Error updating stats', error);
  }
}
