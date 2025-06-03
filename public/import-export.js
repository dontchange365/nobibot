// public/import-export.js

// Function to display messages (replaces alert())
function showMessage(message, type = 'success') {
    const msgBox = document.getElementById('messageBox');
    msgBox.textContent = message;
    msgBox.className = ''; // Reset classes
    msgBox.classList.add('show');
    msgBox.classList.add(type); // 'success' or 'error'

    setTimeout(() => {
        msgBox.classList.remove('show');
    }, 3000); // Hide after 3 seconds
}

// These modal functions are not needed for a standalone page,
// but keeping them in case you integrate this as a modal later.
// For now, they won't be called.
function openRuleModal() {
    // document.getElementById('ruleImportExportModal').classList.add('show');
    // document.body.style.overflow = 'hidden';
    console.log("openRuleModal called (not active in standalone page)");
}
function closeRuleModal() {
    // document.getElementById('ruleImportExportModal').classList.remove('show');
    // document.body.style.overflow = '';
    document.getElementById('fileUploadBox').style.display = 'none';
    document.getElementById('exportBox').style.display = 'none';
    console.log("closeRuleModal called (not active in standalone page)");
}


// Show import options
function showImportOptions() {
    document.getElementById('fileUploadBox').style.display = 'block';
    document.getElementById('exportBox').style.display = 'none';
}
function showExportOptions() {
    document.getElementById('exportBox').style.display = 'block';
    document.getElementById('fileUploadBox').style.display = 'none';
}

// Import rule logic
let importType = 'add'; // default
function setImportType(type) {
    importType = type;
    document.querySelectorAll('#importTypeBtns button').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('importBtn_' + type).classList.add('selected');
}

async function handleImportRules() {
    const fileInput = document.getElementById('ruleFileInput');
    if (!fileInput.files.length) {
        showMessage('Please choose a CSV file!', 'error');
        return;
    }
    const file = fileInput.files[0];

    // Create FormData object to send the file
    const formData = new FormData();
    formData.append('csvfile', file);
    formData.append('importMode', importType);

    // POST to /admin/import-rules with FormData
    fetch('/admin/import-rules', {
        method: 'POST',
        // Do NOT set 'Content-Type' header for FormData, browser sets it automatically
        body: formData
    })
    .then(res => {
        // Server might redirect or send HTML, so check response type
        if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
            // If it's HTML (e.g., a redirect or error page from getHtmlTemplate),
            // we'll just reload or handle it.
            // For a successful import, server redirects to /admin/reply-list.
            // For an error, server sends an HTML error page.
            return res.text().then(html => {
                // If the response is an HTML error page, display a message
                if (html.includes('Error loading reply for edit') || html.includes('Import failed')) {
                    showMessage('Import failed. Check server logs.', 'error');
                } else {
                    // Otherwise, assume success and reload or let the redirect happen
                    window.location.reload(); // Or window.location.href = '/admin/reply-list';
                }
            });
        } else if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            // This path is less likely if server redirects on success, but good for robust error handling
            return res.json().then(r => {
                if (r.success) {
                    showMessage('Import Success!', 'success');
                    window.location.reload();
                } else {
                    showMessage('Import failed: ' + (r.error || 'Unknown error'), 'error');
                }
            });
        } else {
            // Unexpected response type
            showMessage('Server response unexpected. Check server logs.', 'error');
        }
    })
    .catch(e => {
        console.error('Fetch error during import:', e);
        showMessage('Network error during import. See console for details.', 'error');
    });
}

// Export rule logic
function handleExportRules() {
    const exportName = document.getElementById('ruleExportName').value.trim() || 'nobita-rules';
    fetch('/admin/export-rules', {
        method: 'POST', // Server expects POST for export-rules
        headers: { 'Content-Type': 'application/json' }, // Send filename as JSON
        body: JSON.stringify({ filename: exportName })
    })
    .then(res => {
        // Check if the response is a file download
        const contentDisposition = res.headers.get('content-disposition');
        if (contentDisposition && contentDisposition.includes('attachment')) {
            return res.blob().then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                // Use filename from Content-Disposition header if available, otherwise fallback
                const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
                a.download = filenameMatch ? filenameMatch[1] : exportName.replace(/[^a-zA-Z0-9_-]/g,'') + '.csv';

                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showMessage('Export Success!', 'success');
            });
        } else {
            // If not a file download, it might be an error message from the server
            return res.text().then(text => {
                console.error('Export failed, server response:', text);
                showMessage('Export failed: ' + text, 'error');
            });
        }
    })
    .catch(e => {
        console.error('Fetch error during export:', e);
        showMessage('Network error during export. See console for details.', 'error');
    });
}