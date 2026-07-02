// Build JSON Graph payload
window.buildGraphPayload = function() {
    return {
        nodes: nodes.map(n => ({
            id: n.id,
            name: n.name,
            type: n.type,
            properties: n.properties
        })),
        edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            from: e.source, // Java compatibility
            to: e.target,   // Java compatibility
            condition: e.properties ? e.properties.expression : '', // Java DTO field
            isDefault: e.isDefault,
            properties: e.properties || {}
        }))
    };
};

window.updateJsonPreview = function() {
    const payload = buildGraphPayload();
    jsonPreview.textContent = JSON.stringify(payload, null, 2);
    
    // Also update BPMN preview
    if (typeof updateBpmnPreview === 'function') {
        updateBpmnPreview();
    }
};

// API: Validate Flow
window.validateWorkflow = async function() {
    if (!ensureAuthenticated()) return;

    const payload = buildGraphPayload();
    const summaryEl = document.getElementById('validation-summary');
    const errorsListEl = document.getElementById('validation-errors-list');
    
    summaryEl.className = 'validation-status status-info';
    summaryEl.innerHTML = '⚡ Đang thực hiện kiểm tra cấu hình quy trình tiếp thị tự động từ server...';
    errorsListEl.innerHTML = '';
    
    try {
        const response = await fetchApi('/api/v1/admin/campaigns/validate', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const resData = await parseJsonResponse(response);
        document.querySelector('[data-tab="tab-validation"]').click();
        
        if (response.ok && resData.code === 'SUCCESS' && resData.data && resData.data.valid) {
            summaryEl.className = 'validation-status status-success';
            summaryEl.innerHTML = '✅ <strong>Cấu hình hợp lệ!</strong> Sơ đồ hoàn toàn đáp ứng các tiêu chuẩn kỹ thuật & quy tắc vận hành. Có thể tiến hành Triển khai.';
        } else if (response.status === 401) {
            summaryEl.className = 'validation-status status-failed';
            summaryEl.innerHTML = '❌ <strong>Chưa đăng nhập hoặc hết phiên.</strong> Vui lòng đăng nhập tài khoản Admin/Staff.';
        } else {
            summaryEl.className = 'validation-status status-failed';
            const errors = resData.data ? resData.data.errors : [];
            summaryEl.innerHTML = `❌ <strong>Cấu hình không hợp lệ!</strong> Tìm thấy ${errors.length} lỗi cấu hình cần chỉnh sửa trước khi deploy.`;
            
            errors.forEach(err => {
                const card = document.createElement('div');
                card.className = 'error-card';
                card.innerHTML = `
                    <div class="error-card-header">
                        <span>Khối: ${err.nodeId || 'Hệ thống'}</span>
                        <span>LỖI BẮT BUỘC</span>
                    </div>
                    <div class="error-card-msg">${err.message}</div>
                `;
                errorsListEl.appendChild(card);
            });
        }
    } catch (error) {
        console.error(error);
        summaryEl.className = 'validation-status status-failed';
        summaryEl.innerHTML = `❌ <strong>Lỗi kết nối máy chủ:</strong> Không thể kết nối tới Backend API tại ${API_BASE_URL}.`;
    }
};

// API: Deploy Campaign
window.submitCampaign = async function() {
    if (!ensureAuthenticated()) return;

    const payload = buildGraphPayload();
    
    const name = document.getElementById('campaign-name').value.trim();
    const bpmnKey = document.getElementById('campaign-bpmn-key').value.trim();
    const totalBudget = Number(document.getElementById('campaign-budget').value);
    const startDate = new Date(document.getElementById('campaign-start').value).toISOString();
    const endDate = new Date(document.getElementById('campaign-end').value).toISOString();
    
    const body = {
        name: name,
        bpmnProcessDefinitionKey: bpmnKey,
        totalBudget: totalBudget,
        startDate: startDate,
        endDate: endDate,
        active: true,
        workflowJson: JSON.stringify(payload)
    };
    
    try {
        const response = await fetchApi('/api/v1/admin/campaigns', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        
        const resData = await parseJsonResponse(response);
        
        if (response.ok && resData.code === 'SUCCESS') {
            showToast('🚀 Triển khai & Kích hoạt chiến dịch thành công!', 'success');
            deployModal.classList.remove('active');
            document.querySelector('[data-tab="tab-campaigns"]').click();
        } else if (response.status === 401) {
            showToast('Chưa đăng nhập hoặc không có quyền Admin/Staff.', 'error');
        } else {
            showToast(resData.message || 'Triển khai thất bại. Hãy kiểm tra lại mã BPMN Key hoặc sơ đồ cấu hình.', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Lỗi kết nối: Không thể gửi yêu cầu triển khai lên máy chủ.', 'error');
    }
};

// API: Load Campaigns List
window.loadCampaigns = async function() {
    const bodyEl = document.getElementById('campaign-list-body');
    bodyEl.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải danh sách chiến dịch tiếp thị...</td></tr>';

    if (!getAccessToken()) {
        bodyEl.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Vui lòng đăng nhập Admin/Staff để xem danh sách chiến dịch.</td></tr>';
        return;
    }
    
    try {
        const response = await fetchApi('/api/v1/admin/campaigns');
        const resData = await parseJsonResponse(response);
        
        if (response.ok && resData.code === 'SUCCESS' && Array.isArray(resData.data)) {
            const list = resData.data;
            if (list.length === 0) {
                bodyEl.innerHTML = '<tr><td colspan="7" class="text-center">Chưa có chiến dịch nào được triển khai.</td></tr>';
                return;
            }
            
            bodyEl.innerHTML = list.map(c => {
                const startDateStr = new Date(c.startDate).toLocaleString();
                const endDateStr = new Date(c.endDate).toLocaleString();
                const budgetFormatted = Number(c.remainingBudget).toLocaleString() + ' / ' + Number(c.totalBudget).toLocaleString() + ' VNĐ';
                
                return `
                    <tr>
                        <td>${c.id}</td>
                        <td style="font-weight:600;">${c.name}</td>
                        <td><code>${c.bpmnProcessDefinitionKey}</code></td>
                        <td>${budgetFormatted}</td>
                        <td style="font-size:11px;">
                            <div>Bắt đầu: ${startDateStr}</div>
                            <div>Kết thúc: ${endDateStr}</div>
                        </td>
                        <td>
                            <span class="${c.active ? 'badge-active' : 'badge-suspended'}">
                                ${c.active ? 'KÍCH HOẠT' : 'TẠM NGỪNG'}
                            </span>
                        </td>
                        <td>
                            <div class="flex-gap">
                                <button class="btn btn-secondary btn-small" onclick="toggleCampaign(${c.id}, ${!c.active})">
                                    ${c.active ? 'Tạm ngưng' : 'Kích hoạt'}
                                </button>
                                <button class="btn btn-primary btn-small" onclick="openEvaluateModal('${c.bpmnProcessDefinitionKey}', '${c.name}')">
                                    ⚡ Test
                                </button>
                                <button class="btn btn-danger btn-small" onclick="deleteCampaign(${c.id})">
                                    Xóa
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else if (response.status === 401) {
            bodyEl.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.</td></tr>';
        } else {
            bodyEl.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Không thể tải dữ liệu danh sách chiến dịch.</td></tr>';
        }
    } catch (error) {
        console.error(error);
        bodyEl.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Lỗi kết nối Backend Server.</td></tr>';
    }
};

// API: Toggle Active status of campaign
window.toggleCampaign = async function(campaignId, active) {
    if (!ensureAuthenticated()) return;

    try {
        const response = await fetchApi(`/api/v1/admin/campaigns/${campaignId}/toggle-active?active=${active}`, {
            method: 'PUT'
        });
        const resData = await parseJsonResponse(response);
        
        if (response.ok && resData.code === 'SUCCESS') {
            showToast(`Đã ${active ? 'kích hoạt' : 'tạm ngưng'} chiến dịch tiếp thị thành công.`, 'success');
            loadCampaigns();
        } else {
            showToast(resData.message || 'Không thể thay đổi trạng thái.', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Lỗi kết nối.', 'error');
    }
};

// API: Delete Campaign
window.deleteCampaign = async function(campaignId) {
    if (!ensureAuthenticated()) return;
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn chiến dịch này? Điều này sẽ hủy bỏ và xóa tất cả instance đang chạy của Process Key này trên Camunda.')) return;
    
    try {
        const response = await fetchApi(`/api/v1/admin/campaigns/${campaignId}`, {
            method: 'DELETE'
        });
        const resData = await parseJsonResponse(response);
        
        if (response.ok && resData.code === 'SUCCESS') {
            showToast('Đã xóa chiến dịch thành công.', 'success');
            loadCampaigns();
        } else {
            showToast('Không thể thực hiện xóa chiến dịch.', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Lỗi kết nối.', 'error');
    }
};

// API: Open Simulation Test Modal
window.openEvaluateModal = function(processKey, name) {
    evaluateModal.classList.add('active');
    document.getElementById('eval-process-key').value = processKey;
    document.getElementById('eval-campaign-title').textContent = name;
    document.getElementById('eval-key-code').textContent = processKey;
    
    // Clear old result
    evalResultSection.classList.add('hidden');
    evalResultOutput.textContent = '';
};

// API: Evaluate campaign (public endpoint — không cần JWT)
window.runSimulation = async function() {
    const processKey = document.getElementById('eval-process-key').value;
    const userId = document.getElementById('eval-user-id').value.trim();
    const location = document.getElementById('eval-location').value.trim();
    const categories = document.getElementById('eval-categories').value.split(',').map(s => s.trim()).filter(Boolean);
    const products = document.getElementById('eval-products').value.split(',').map(s => s.trim()).filter(Boolean);
    
    let variables = {};
    if (userId) variables.userId = userId;
    if (location) variables.location = location;
    if (categories.length > 0) variables.categories = categories;
    if (products.length > 0) variables.products = products;
    
    try {
        const rawJsonText = document.getElementById('eval-raw-variables').value.trim();
        if (rawJsonText) {
            const rawJson = JSON.parse(rawJsonText);
            variables = { ...variables, ...rawJson };
        }
    } catch (e) {
        showToast('Định dạng JSON biến bổ sung không hợp lệ!', 'error');
        return;
    }
    
    const btnRun = document.getElementById('btn-run-eval');
    btnRun.disabled = true;
    btnRun.textContent = '⏳ Đang chạy thử...';
    
    try {
        const response = await fetchApi(`/api/v1/public/campaigns/evaluate?processKey=${processKey}`, {
            method: 'POST',
            body: JSON.stringify(variables)
        });
        
        const resData = await parseJsonResponse(response);
        evalResultSection.classList.remove('hidden');
        
        if (response.ok && resData.code === 'SUCCESS') {
            evalResultOutput.textContent = JSON.stringify(resData.data, null, 2);
            showToast('Quy trình chạy thử giả lập hoàn tất!', 'success');
        } else {
            evalResultOutput.textContent = `Lỗi hệ thống: ${resData.message || 'Thử nghiệm thất bại'}`;
            showToast('Chạy thử nghiệm chiến dịch thất bại.', 'error');
        }
    } catch (error) {
        console.error(error);
        evalResultSection.classList.remove('hidden');
        evalResultOutput.textContent = `Connection Error: Không kết nối được đến server tại ${API_BASE_URL}`;
        showToast('Lỗi kết nối Server.', 'error');
    } finally {
        btnRun.disabled = false;
        btnRun.textContent = 'Chạy Thử Nghiệm';
    }
};
