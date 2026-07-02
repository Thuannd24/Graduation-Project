// DOM Elements caching
var flowCanvas = document.getElementById('flow-canvas');
var connectionsSvg = document.getElementById('connections-svg');
var propertyEditorContent = document.getElementById('property-editor-content');
var btnValidate = document.getElementById('btn-validate');
var btnShowDeploy = document.getElementById('btn-show-deploy');
var btnReset = document.getElementById('btn-reset');
var jsonPreview = document.getElementById('json-preview');
var toastEl = document.getElementById('toast');

// Modals
var deployModal = document.getElementById('deploy-modal');
var closeDeployModal = document.getElementById('close-deploy-modal');
var btnCancelDeploy = document.getElementById('btn-cancel-deploy');
var deployForm = document.getElementById('deploy-form');

var evaluateModal = document.getElementById('evaluate-modal');
var closeEvaluateModal = document.getElementById('close-evaluate-modal');
var btnCancelEval = document.getElementById('btn-cancel-eval');
var evaluateForm = document.getElementById('evaluate-form');
var evalResultSection = document.getElementById('eval-result-section');
var evalResultOutput = document.getElementById('eval-result-output');

// Tab navigation
var tabButtons = document.querySelectorAll('.tab-btn');
var tabContents = document.querySelectorAll('.tab-content');

// Toast Helper
window.showToast = function(message, type = 'info') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`;
    setTimeout(() => {
        toastEl.className = 'toast';
    }, 3500);
};

// Setup tabs
window.setupTabs = function() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetTab = btn.getAttribute('data-tab');
            document.getElementById(targetTab).classList.add('active');
            
            if (targetTab === 'tab-campaigns') {
                loadCampaigns();
            }
        });
    });
};

// Setup modals
window.setupModals = function() {
    btnShowDeploy.addEventListener('click', () => {
        deployModal.classList.add('active');
        const now = new Date();
        const future = new Date();
        future.setDate(now.getDate() + 30);
        
        document.getElementById('campaign-start').value = now.toISOString().slice(0, 16);
        document.getElementById('campaign-end').value = future.toISOString().slice(0, 16);
    });
    
    closeDeployModal.addEventListener('click', () => deployModal.classList.remove('active'));
    btnCancelDeploy.addEventListener('click', () => deployModal.classList.remove('active'));
    deployForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitCampaign();
    });

    closeEvaluateModal.addEventListener('click', () => evaluateModal.classList.remove('active'));
    btnCancelEval.addEventListener('click', () => evaluateModal.classList.remove('active'));
    evaluateForm.addEventListener('submit', (e) => {
        e.preventDefault();
        runSimulation();
    });
};

// Copy JSON
window.copyJsonToClipboard = function() {
    navigator.clipboard.writeText(jsonPreview.textContent)
        .then(() => showToast('Đã sao chép đồ thị JSON vào bộ nhớ đệm.', 'success'))
        .catch(() => showToast('Không thể sao chép.', 'error'));
};
