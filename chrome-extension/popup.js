/**
 * Popup script for PDF Secret Inspector
 * 
 * Simple interface to show extension status and settings.
 * Keeps track of inspection history and allows users to configure behavior.
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loading...');
  
  try {
    // Test if chrome.storage is available
    if (!chrome || !chrome.storage) {
      throw new Error('Chrome storage API not available');
    }
    
    console.log('Chrome storage available, getting data...');
    
    // Get extension settings, stats, and last inspection
    const result = await chrome.storage.local.get(['settings', 'lastInspection', 'stats']);
    console.log('Storage result:', result);
    
    // Show status
    const settings = result.settings || { enabled: true };
    const statusElement = document.getElementById('status');
    statusElement.textContent = settings.enabled ? 'Active' : 'Disabled';
    
    // Show stats
    const stats = result.stats || { filesScanned: 0, secretsFound: 0 };
    console.log('Stats loaded:', stats);
    
    document.getElementById('filesScanned').textContent = stats.filesScanned;
    document.getElementById('secretsFound').textContent = stats.secretsFound;
    
    // Show last inspection if available
    const lastInspection = result.lastInspection;
    const lastInspectionDiv = document.getElementById('lastInspection');
    
    if (lastInspection) {
      document.getElementById('lastFilename').textContent = lastInspection.filename || '-';
      document.getElementById('lastPlatform').textContent = lastInspection.platform || '-';
      document.getElementById('lastSecretsCount').textContent = lastInspection.secretsFound || 0;
      
      // Update risk level with color
      const riskElement = document.getElementById('lastRiskLevel');
      const riskLevel = lastInspection.riskLevel || 'NONE';
      riskElement.textContent = riskLevel;
      riskElement.className = `risk-${riskLevel.toLowerCase()}`;
      
      // Format timestamp
      if (lastInspection.timestamp) {
        const date = new Date(lastInspection.timestamp);
        document.getElementById('lastTimestamp').textContent = date.toLocaleString();
      }
      
      lastInspectionDiv.style.display = 'block';
    } else {
      lastInspectionDiv.style.display = 'none';
    }
    
    console.log('Popup loaded successfully');
    
  } catch (error) {
    console.error('Popup error details:', error);
    document.getElementById('status').textContent = 'Error';
  }
});