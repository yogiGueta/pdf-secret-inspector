/**
 * Content Script for PDF Secret Inspector
 *
 * Monitors file uploads on AI platforms and intercepts PDF files.
 * Had to use MutationObserver because these sites are SPAs and
 * the file inputs are dynamically created.
 *
 * Note: This is a bit hacky but works across different AI platforms.
 * Each platform has slightly different DOM structures.
 */

console.log('PDF Secret Inspector: Content script loaded');

// Add a marker to indicate the content script is loaded
window.__pdfInspectorLoaded = true;

// Configuration for different platforms
const PLATFORM_CONFIG = {
  'chat.openai.com': {
    fileInputSelector: 'input[type="file"]',
    uploadButtonSelector: 'button[data-testid="send-button"]',
    name: 'ChatGPT'
  },
  'chatgpt.com': {
    fileInputSelector: 'input[type="file"]',
    uploadButtonSelector: 'button[data-testid="send-button"]',
    name: 'ChatGPT'
  },
  'claude.ai': {
    fileInputSelector: 'input[type="file"]',
    uploadButtonSelector: 'button[type="submit"]',
    name: 'Claude'
  },
  'bard.google.com': {
    fileInputSelector: 'input[type="file"]',
    uploadButtonSelector: 'button[jsname="M2UYVd"]',
    name: 'Bard'
  }
};

// Platform adapters for site-specific behavior (selectors, drop zones)
const PLATFORM_ADAPTERS = {
  'chat.openai.com': { name: 'ChatGPT', fileInputSelector: 'input[type="file"]', dropZoneSelector: 'body' },
  'chatgpt.com': { name: 'ChatGPT', fileInputSelector: 'input[type="file"]', dropZoneSelector: 'body' },
  'claude.ai': { name: 'Claude', fileInputSelector: 'input[type="file"]', dropZoneSelector: 'body' },
  'bard.google.com': { name: 'Bard', fileInputSelector: 'input[type="file"]', dropZoneSelector: 'body' }
};

// Select current platform adapter
const currentAdapter = PLATFORM_ADAPTERS[window.location.hostname];
if (!currentAdapter) {
  console.log('PDF Secret Inspector: Unsupported platform');
}

// Track processed files to avoid duplicate processing
const processedFiles = new Map();

/**
 * Main file monitoring function
 * Uses MutationObserver to watch for file input changes
 */
function initializeFileMonitoring() {
  if (!currentAdapter) return;
  console.log(`PDF Secret Inspector: Initializing file monitoring for ${currentAdapter.name}`);

  // Watch for file input changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // Check for new file inputs (but don't log every time)
        const fileInputs = document.querySelectorAll(currentAdapter.fileInputSelector);
        fileInputs.forEach(attachFileListener);
      }

      // Also watch for attribute changes that might indicate input replacement
      if (mutation.type === 'attributes' && mutation.target.matches && mutation.target.matches('input[type="file"]')) {
        attachFileListener(mutation.target);
      }
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['type', 'accept']
  });

  // Also check existing file inputs
  const existingInputs = document.querySelectorAll(currentAdapter.fileInputSelector);
  console.log(`PDF Secret Inspector: Found ${existingInputs.length} existing file inputs`);
  existingInputs.forEach(attachFileListener);

  // Periodically re-scan for new inputs (fallback) - but less frequently
  setInterval(() => {
    const allInputs = document.querySelectorAll(currentAdapter.fileInputSelector);
    allInputs.forEach((input) => {
      if (!input.dataset.pdfInspectorAttached) {
        console.log('PDF Secret Inspector: Found unattached file input, attaching listener');
        attachFileListener(input);
      }
    });
  }, 5000);

  // Attach drag-and-drop capture
  attachDragAndDrop(currentAdapter);
}

/**
 * Attach page-level drag-and-drop handlers to capture PDFs
 */
function attachDragAndDrop(adapter) {
  try {
    const zone = document.querySelector(adapter.dropZoneSelector) || document.body;
    if (!zone || zone.dataset.pdfInspectorDndAttached) return;
    zone.dataset.pdfInspectorDndAttached = 'true';

    zone.addEventListener('dragover', (e) => {
      try { e.preventDefault(); } catch (_) {}
    }, { passive: false });

    zone.addEventListener('drop', async (e) => {
      try { e.preventDefault(); } catch (_) {}
      const files = Array.from(e.dataTransfer?.files || []);
      for (const file of files) {
        if (file && file.type === 'application/pdf') {
          await handlePDFUpload(file, null);
        }
      }
    });
  } catch (err) {
    console.warn('PDF Secret Inspector: Failed to attach drag-and-drop', err);
  }
}


/**
 * Attach event listener to file input
 */
function attachFileListener(fileInput) {
  // Avoid duplicate listeners
  if (fileInput.dataset.pdfInspectorAttached) {
    return;
  }

  fileInput.dataset.pdfInspectorAttached = 'true';



  fileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (file.type === 'application/pdf') {
        await handlePDFUpload(file, event.target);
      }
    }
  });
}

/**
 * Handle PDF file upload
 */
async function handlePDFUpload(file, inputElement) {
  // Create a unique key for this upload attempt (include timestamp to allow re-uploads)
  const fileKey = `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;

  // Only prevent duplicate processing within a short time window (reduced from 2 seconds to 1)
  const recentKey = `${file.name}-${file.size}-${file.lastModified}`;
  const now = Date.now();

  // Check if we processed this exact file very recently (within 1 second)
  if (processedFiles.has(recentKey)) {
    const lastProcessed = processedFiles.get(recentKey);
    if (now - lastProcessed < 1000) {
      console.log(`PDF Secret Inspector: Skipping duplicate processing of ${file.name}`);
      return;
    }
  }

  // Mark as being processed
  processedFiles.set(recentKey, now);

  console.log(`PDF Secret Inspector: Processing ${file.name}`);



  // Show processing indicator
  showProcessingIndicator(true);

  try {
    // Send file to background script for inspection
    const result = await chrome.runtime.sendMessage({
      action: 'inspectPDF',
      file: await fileToBase64(file),
      filename: file.name,
      platform: currentAdapter.name
    });

    if (result.success) {
      handleInspectionResult(result.data, file, inputElement);
    } else {
      console.error('PDF Secret Inspector: Inspection failed', result.error);
      showNotification('Failed to inspect PDF', 'error');
    }
  } catch (error) {
    console.error('PDF Secret Inspector: Error processing file', error);
    showNotification('Error processing PDF', 'error');
  } finally {
    showProcessingIndicator(false);

    // Clean up the processed file marker after a shorter delay (2 seconds instead of 5)
    setTimeout(() => {
      processedFiles.delete(recentKey);
    }, 2000);
  }
}

/**
 * Handle inspection results
 */
function handleInspectionResult(result, file, inputElement) {
  const { secretsFound, riskLevel, secrets } = result;

  if (secretsFound > 0) {
    // Non-blocking alert as per assignment: notify but do not block or clear input
    const message = `⚠️ ${secretsFound} potential secret(s) detected in ${file.name} (Risk: ${riskLevel})`;
    showNotification(message, 'warning');
  }

  // Log the result
  console.log('PDF Secret Inspector: Inspection complete', result);

  if (secretsFound === 0) {
    showNotification('PDF is clean - no secrets detected', 'success');
  }
}

/**
 * Convert file to base64 for transmission
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Show processing indicator
 */
function showProcessingIndicator(show) {
  let indicator = document.getElementById('pdf-inspector-indicator');

  if (show && !indicator) {
    indicator = document.createElement('div');
    indicator.id = 'pdf-inspector-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;
    indicator.textContent = '🔍 Inspecting PDF...';
    document.body.appendChild(indicator);
  } else if (!show && indicator) {
    indicator.remove();
  }
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
  const colors = {
    success: '#28a745',
    warning: '#ffc107',
    error: '#dc3545',
    info: '#007bff'
  };

  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type]};
    color: white;
    padding: 12px 16px;
    border-radius: 5px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFileMonitoring);
} else {
  initializeFileMonitoring();
}

// Also initialize after a short delay to catch dynamically loaded content
setTimeout(initializeFileMonitoring, 2000);
