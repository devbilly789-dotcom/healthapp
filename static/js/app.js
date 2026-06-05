// Tab & View switching
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const view = item.dataset.view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
    item.classList.add('active');
    const el = document.getElementById('view-' + view);
    el.classList.remove('hidden');
    el.classList.add('active');
    if (view === 'history') loadHistory();
  });
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// Image upload
function setupUpload(zoneId, inputId, previewId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) setPreview(e.dataTransfer.files[0], preview, zone);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) setPreview(input.files[0], preview, zone);
  });
}

function setPreview(file, previewEl, zoneEl) {
  const reader = new FileReader();
  reader.onload = e => {
    previewEl.innerHTML = `<img src="${e.target.result}" alt="Preview"><button class="remove-img" onclick="removeImage(this)">✕</button>`;
    previewEl.classList.remove('hidden');
    zoneEl.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function removeImage(btn) {
  const preview = btn.parentElement;
  const zone = preview.previousElementSibling;
  preview.classList.add('hidden');
  zone.classList.remove('hidden');
  preview.innerHTML = '';
  document.getElementById('imageInput').value = '';
  document.getElementById('imageInputBoth').value = '';
}

setupUpload('uploadZone', 'imageInput', 'imagePreview');
setupUpload('uploadZoneBoth', 'imageInputBoth', 'imagePreviewBoth');

// Analyze
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) return showError('Please enter your Anthropic API key in the sidebar.');

  const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
  let symptoms = '';
  let imageFile = null;

  if (activeTab === 'symptoms') {
    symptoms = document.getElementById('symptomsText').value.trim();
  } else if (activeTab === 'image') {
    imageFile = document.getElementById('imageInput').files[0];
  } else {
    symptoms = document.getElementById('symptomsTextBoth').value.trim();
    imageFile = document.getElementById('imageInputBoth').files[0];
  }

  if (!symptoms && !imageFile) return showError('Please enter symptoms or upload an image.');

  const fd = new FormData();
  if (symptoms) fd.append('symptoms', symptoms);
  if (imageFile) fd.append('image', imageFile);
  fd.append('api_key', apiKey);

  showLoading();
  document.getElementById('analyzeBtn').disabled = true;

  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      renderResult(data.result);
      loadStats();
    } else {
      showError(data.error || 'Analysis failed. Please try again.');
    }
  } catch (err) {
    showError('Network error. Please check your connection.');
  } finally {
    document.getElementById('analyzeBtn').disabled = false;
  }
});

function showLoading() {
  document.getElementById('resultsEmpty').classList.add('hidden');
  document.getElementById('resultsContent').classList.add('hidden');
  document.getElementById('resultsLoading').classList.remove('hidden');
}

function showError(msg) {
  document.getElementById('resultsLoading').classList.add('hidden');
  document.getElementById('resultsEmpty').classList.add('hidden');
  const content = document.getElementById('resultsContent');
  content.innerHTML = `<div class="error-banner">⚠️ ${msg}</div>`;
  content.classList.remove('hidden');
}

function renderResult(r) {
  document.getElementById('resultsLoading').classList.add('hidden');

  const urgencyClass = `urgency-${r.urgency}`;
  const urgencyEmoji = { emergency: '🚨', high: '⚠️', medium: '⚡', low: '✅' }[r.urgency] || '✅';
  const confClass = `conf-${r.confidence}`;

  let medicinesHTML = (r.medicines || []).map(m => `
    <div class="medicine-item">
      <div class="medicine-icon">💊</div>
      <div>
        <div class="medicine-name">${m.name}${m.who_listed ? '<span class="who-badge">WHO EML</span>' : ''}</div>
        <div class="medicine-dosage">${m.dosage}</div>
        <div class="medicine-purpose">${m.purpose}</div>
      </div>
    </div>`).join('');

  const diet = r.diet_advice || {};
  const eatHTML = (diet.eat || []).map(f => `<li>${f}</li>`).join('');
  const avoidHTML = (diet.avoid || []).map(f => `<li>${f}</li>`).join('');
  const lifestyleHTML = (r.lifestyle || []).map(l => `<li>${l}</li>`).join('');
  const symptagsHTML = (r.matched_symptoms || []).map(s => `<span class="symptom-tag">${s}</span>`).join('');

  const html = `
    <div class="result-header">
      <div class="result-condition">
        <h2>${r.condition}</h2>
        <span class="result-icd">ICD-11: ${r.icd11_code}</span>
      </div>
      <span class="confidence-badge ${confClass}">${r.confidence} confidence</span>
    </div>

    ${r.urgency_message ? `
    <div class="urgency-banner ${urgencyClass}">
      <span>${urgencyEmoji}</span>
      <div><strong>${r.urgency.toUpperCase()}:</strong> ${r.urgency_message}</div>
    </div>` : ''}

    <div class="result-section">
      <h3>Matched Symptoms</h3>
      <div class="symptoms-tags">${symptagsHTML}</div>
    </div>

    <div class="result-section">
      <h3>About This Condition</h3>
      <p class="description-text">${r.description}</p>
    </div>

    <div class="result-section">
      <h3>WHO Essential Medicines</h3>
      ${medicinesHTML || '<p style="font-size:13px;color:#9aa3ae">No medicines listed for this condition.</p>'}
    </div>

    <div class="result-section">
      <h3>Diet Guidance</h3>
      <div class="diet-cols">
        <div class="diet-col diet-eat"><div class="diet-col-title">✓ Eat More</div><ul class="diet-list">${eatHTML}</ul></div>
        <div class="diet-col diet-avoid"><div class="diet-col-title">✗ Avoid</div><ul class="diet-list">${avoidHTML}</ul></div>
      </div>
      ${diet.hydration ? `<div class="hydration-note">💧 ${diet.hydration}</div>` : ''}
    </div>

    ${lifestyleHTML ? `
    <div class="result-section">
      <h3>Lifestyle Advice</h3>
      <ul class="lifestyle-list">${lifestyleHTML}</ul>
    </div>` : ''}

    ${r.see_doctor ? `
    <div class="doctor-advice">
      <span>🏥</span>
      <div><strong>See a Doctor:</strong> ${r.doctor_reason}</div>
    </div>` : ''}
  `;

  const content = document.getElementById('resultsContent');
  content.innerHTML = html;
  content.classList.remove('hidden');
}

// History
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<p style="color:#9aa3ae;font-size:14px">Loading history...</p>';
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (!data.length) { list.innerHTML = '<p style="color:#9aa3ae;font-size:14px">No consultations yet.</p>'; return; }
    list.innerHTML = data.map(item => `
      <div class="history-item" onclick="viewConsultation(${item.id})">
        <div class="history-urgency urg-${item.urgency}"></div>
        <div>
          <div class="history-condition">${item.condition_name || 'Unknown'}</div>
          <div class="history-date">${new Date(item.created_at).toLocaleString()}</div>
        </div>
        ${item.has_image ? '<span class="history-img-badge">📷 Image</span>' : ''}
        <span class="history-icd">${item.icd11_code || ''}</span>
      </div>`).join('');
  } catch { list.innerHTML = '<p style="color:#d63031;font-size:14px">Failed to load history.</p>'; }
}

async function viewConsultation(id) {
  const res = await fetch(`/api/history/${id}`);
  const data = await res.json();
  if (data.result_json) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
    document.querySelector('[data-view="diagnose"]').classList.add('active');
    document.getElementById('view-diagnose').classList.remove('hidden');
    document.getElementById('view-diagnose').classList.add('active');
    renderResult(data.result_json);
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    document.getElementById('statTotal').textContent = data.total;
    document.getElementById('statEmergency').textContent = data.emergency;
  } catch {}
}

loadStats();
