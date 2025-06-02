// public/import-export.js
function openRuleModal() {
  document.getElementById('ruleImportExportModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeRuleModal() {
  document.getElementById('ruleImportExportModal').classList.remove('show');
  document.body.style.overflow = '';
  document.getElementById('fileUploadBox').style.display = 'none';
  document.getElementById('exportBox').style.display = 'none';
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
  if (!fileInput.files.length) return alert('Please choose a JSON file!');
  const file = fileInput.files[0];
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { alert('Invalid JSON!'); return; }
  // POST to /admin/import-rules with importType
  fetch('/admin/import-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: data, mode: importType })
  })
  .then(res => res.json())
  .then(r => {
    if (r.success) { alert('Import Success!'); window.location.reload(); }
    else alert('Import failed: ' + (r.error || 'Unknown error'));
  });
}

// Export rule logic
function handleExportRules() {
  const exportName = document.getElementById('ruleExportName').value.trim() || 'nobita-rules';
  fetch('/admin/export-rules')
    .then(res => res.json())
    .then(data => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportName.replace(/[^a-zA-Z0-9_-]/g,'') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      closeRuleModal();
    });
}