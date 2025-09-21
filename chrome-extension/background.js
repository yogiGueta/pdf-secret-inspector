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
    // Convert base64 to blob
    const response = await fetch(file);
    const blob = await response.blob();
    
    // Create form data for API request
    const formData = new FormData();
    formData.append('pdf', blob, filename);
    
    // Send to backend API
    const apiResponse = await fetch(`${API_BASE_URL}/inspect-pdf`, {
      method: 'POST',
      body: formData
    });
    
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
