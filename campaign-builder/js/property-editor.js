// Clear Property panel
window.clearPropertyEditor = function() {
    propertyEditorContent.innerHTML = '<p class="no-selection-message">Chọn một khối trên sơ đồ để tiến hành cấu hình tham số bắt buộc.</p>';
};

// Property Editor in Vietnamese
window.renderPropertyEditor = function(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
        clearPropertyEditor();
        return;
    }
    
    const meta = NODE_TYPES[node.type];
    let fieldsHtml = `
        <div class="form-group">
            <label>Mã Khối định danh (ID)</label>
            <input type="text" value="${node.id}" disabled style="background-color:#e2e8f0; font-family:monospace;">
        </div>
        <div class="form-group">
            <label>Tên khối (Tên hiển thị)</label>
            <input type="text" id="prop-node-name" value="${node.name}">
        </div>
    `;
    
    // Start Node Trigger customization
    if (node.id === 'start') {
        fieldsHtml += `
            <div class="form-group">
                <label>Loại Sự Kiện Bắt Đầu (Trigger)</label>
                <select id="prop-trigger-type" onchange="changeTriggerType(this.value)">
                    <option value="Trigger_Event_NewUser" ${node.type === 'Trigger_Event_NewUser' ? 'selected' : ''}>👤 Đăng ký hội viên mới (New User)</option>
                    <option value="Trigger_Event_OrderSuccess" ${node.type === 'Trigger_Event_OrderSuccess' ? 'selected' : ''}>🛒 Mua hàng thành công (Order Success)</option>
                    <option value="Trigger_Event_ReviewProduct" ${node.type === 'Trigger_Event_ReviewProduct' ? 'selected' : ''}>⭐ Đánh giá sản phẩm (Review Product)</option>
                    <option value="Trigger_Timer_Schedule" ${node.type === 'Trigger_Timer_Schedule' ? 'selected' : ''}>⏰ Hẹn giờ định kỳ (Timer Schedule)</option>
                </select>
            </div>
        `;
    }
    
    // Customize form inputs by type
    switch (node.type) {
        case 'Trigger_Event_OrderSuccess':
            fieldsHtml += `
                <div class="form-group">
                    <label>Giá trị đơn hàng tối thiểu (VNĐ)</label>
                    <input type="number" id="prop-minOrderValue" value="${node.properties.minOrderValue || 0}">
                </div>
            `;
            break;
            
        case 'Trigger_Event_ReviewProduct':
            fieldsHtml += `
                <div class="form-group">
                    <label>Số sao đánh giá tối thiểu (1-5 sao)</label>
                    <input type="number" id="prop-minRating" min="1" max="5" value="${node.properties.minRating || 5}">
                </div>
            `;
            break;
            
        case 'Trigger_Timer_Schedule':
            fieldsHtml += `
                <div class="form-group">
                    <label>Biểu thức Cron định kỳ (Quartz format)</label>
                    <input type="text" id="prop-cronExpression" value="${node.properties.cronExpression || ''}">
                    <small>Ví dụ: <code>0 0 12 * * ?</code> (Chạy lúc 12:00 trưa hàng ngày)</small>
                </div>
                <div class="form-group">
                    <label>Ngày bắt đầu (Tùy chọn)</label>
                    <input type="text" id="prop-startDate" value="${node.properties.startDate || ''}" placeholder="Định dạng ISO 8601">
                </div>
                <div class="form-group">
                    <label>Ngày kết thúc (Tùy chọn)</label>
                    <input type="text" id="prop-endDate" value="${node.properties.endDate || ''}" placeholder="Định dạng ISO 8601">
                </div>
            `;
            break;
            
        case 'Condition_MemberRank':
            fieldsHtml += `
                <div class="form-group" style="background:#e8f4fd; padding:10px; border-radius:6px; border:1px solid #b3e5fc;">
                    <small style="color:#0277bd; font-weight:600; display:block;">ℹ️ Hạng thẻ được cấu hình chi tiết cho từng nhánh rẽ ở mục "Điều kiện rẽ nhánh (Edges)" bên dưới.</small>
                </div>
            `;
            break;
            
        case 'Condition_TotalSpending':
            fieldsHtml += `
                <div class="form-group" style="background:#e8f4fd; padding:10px; border-radius:6px; border:1px solid #b3e5fc;">
                    <small style="color:#0277bd; font-weight:600; display:block;">ℹ️ Giá trị số tiền chi tiêu được cấu hình chi tiết cho từng nhánh rẽ ở mục "Điều kiện rẽ nhánh (Edges)" bên dưới.</small>
                </div>
                <div class="form-group">
                    <label>Số ngày thống kê ngược (days)</label>
                    <input type="number" id="prop-daysLookback" value="${node.properties.daysLookback || 30}">
                </div>
            `;
            break;
            
        case 'Condition_Location':
            const provinces = Array.isArray(node.properties.targetProvinces) ? node.properties.targetProvinces.join(', ') : (node.properties.targetProvinces || '');
            fieldsHtml += `
                <div class="form-group">
                    <label>Danh sách Tỉnh/Thành áp dụng</label>
                    <input type="text" id="prop-targetProvinces" value="${provinces}">
                    <small>Ngăn cách bởi dấu phẩy. Ví dụ: Hanoi, Ho Chi Minh</small>
                </div>
            `;
            break;
            
        case 'Condition_ContainsCategory':
        case 'Condition_ContainsProduct':
            const targetIds = Array.isArray(node.properties.targetIds) ? node.properties.targetIds.join(', ') : (node.properties.targetIds || '');
            fieldsHtml += `
                <div class="form-group">
                    <label>Mã Danh mục hoặc mã Sản phẩm bắt buộc trong giỏ hàng</label>
                    <input type="text" id="prop-targetIds" value="${targetIds}">
                    <small>Ngăn cách bởi dấu phẩy. Ví dụ: 101, prod_a</small>
                </div>
            `;
            break;
            
        case 'Condition_AntiFraudScore':
            fieldsHtml += `
                <div class="form-group">
                    <label>Điểm rủi ro bảo mật tối đa cho phép (1-100)</label>
                    <input type="number" id="prop-maxRiskScore" min="1" max="100" value="${node.properties.maxRiskScore || 50}">
                    <small>Nếu điểm rủi ro lớn hơn mức này sẽ bị nghi ngờ gian lận và dừng quy trình.</small>
                </div>
            `;
            break;
            
        case 'Action_IssueVoucher_Percent':
            fieldsHtml += `
                <div class="form-group">
                    <label>Phần trăm giảm giá (%)</label>
                    <input type="number" id="prop-discountPercent" min="1" max="100" value="${node.properties.discountPercent || 10}">
                </div>
                <div class="form-group">
                    <label>Số tiền giảm giá tối đa (VNĐ)</label>
                    <input type="number" id="prop-maxDiscountAmount" value="${node.properties.maxDiscountAmount || 0}">
                </div>
                <div class="form-group">
                    <label>Số ngày hết hạn của voucher (ngày)</label>
                    <input type="number" id="prop-expireDays" value="${node.properties.expireDays || 7}">
                </div>
            `;
            break;
            
        case 'Action_IssueVoucher_Fixed':
            fieldsHtml += `
                <div class="form-group">
                    <label>Số tiền chiết khấu cố định (VNĐ)</label>
                    <input type="number" id="prop-discountAmount" value="${node.properties.discountAmount || 0}">
                </div>
                <div class="form-group">
                    <label>Giá trị đơn hàng tối thiểu để áp dụng voucher (VNĐ)</label>
                    <input type="number" id="prop-minOrderValue" value="${node.properties.minOrderValue || 0}">
                </div>
                <div class="form-group">
                    <label>Số ngày hết hạn của voucher (ngày)</label>
                    <input type="number" id="prop-expireDays" value="${node.properties.expireDays || 7}">
                </div>
            `;
            break;
            
        case 'Action_IssueVoucher_Freeship':
            fieldsHtml += `
                <div class="form-group">
                    <label>Mức giảm giá vận chuyển tối đa (VNĐ)</label>
                    <input type="number" id="prop-maxShippingDiscount" value="${node.properties.maxShippingDiscount || 0}">
                </div>
                <div class="form-group">
                    <label>Số ngày hết hạn của voucher (ngày)</label>
                    <input type="number" id="prop-expireDays" value="${node.properties.expireDays || 7}">
                </div>
            `;
            break;
            
        case 'Action_Upgrade_MemberRank':
            fieldsHtml += `
                <div class="form-group">
                    <label>Nâng lên hạng thẻ đích</label>
                    <select id="prop-targetTier">
                        <option value="SILVER" ${node.properties.targetTier === 'SILVER' ? 'selected' : ''}>SILVER</option>
                        <option value="GOLD" ${node.properties.targetTier === 'GOLD' ? 'selected' : ''}>GOLD</option>
                        <option value="VIP" ${node.properties.targetTier === 'VIP' ? 'selected' : ''}>VIP</option>
                    </select>
                </div>
            `;
            break;
            
        case 'Action_Loyalty_Point':
            fieldsHtml += `
                <div class="form-group">
                    <label>Cách tính điểm</label>
                    <select id="prop-calculationMode">
                        <option value="FIXED" ${(node.properties.calculationMode || 'FIXED') === 'FIXED' ? 'selected' : ''}>Cố định (FIXED)</option>
                        <option value="ORDER_SPEND" ${node.properties.calculationMode === 'ORDER_SPEND' ? 'selected' : ''}>Theo đơn hàng (ORDER_SPEND)</option>
                    </select>
                    <small>ORDER_SPEND: 10.000 VND = 1 điểm × hệ số hạng. pointAmount = điểm thưởng cộng thêm.</small>
                </div>
                <div class="form-group">
                    <label>Số điểm (FIXED) / Điểm thưởng thêm (ORDER_SPEND)</label>
                    <input type="number" id="prop-pointAmount" value="${node.properties.pointAmount ?? 100}">
                    <small>Số dương để cộng, số âm để trừ (chỉ FIXED). ORDER_SPEND có thể để 0.</small>
                </div>
            `;
            break;
            
        case 'Action_Send_Email':
        case 'Action_Send_SMS':
            fieldsHtml += `
                <div class="form-group">
                    <label>Mã Mẫu tin nhắn (Template ID)</label>
                    <input type="text" id="prop-templateId" value="${node.properties.templateId || ''}">
                </div>
                <div class="form-group">
                    <label>Nội dung soạn thảo thô (Raw content)</label>
                    <textarea id="prop-rawContent" rows="4">${node.properties.rawContent || ''}</textarea>
                </div>
            `;
            break;
    }
    
    // Branch/Gateway Edge Expressions Configuration
    if (meta.category === 'condition') {
        const outgoingEdges = edges.filter(e => e.source === nodeId);
        fieldsHtml += `
            <div style="margin-top:20px; border-top:1px dashed #cbd5e1; padding-top:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:0;">Điều kiện rẽ nhánh (Edges)</label>
                    <button class="btn btn-secondary btn-small" style="padding:2px 8px; font-size:10px; height:auto;" onclick="addBranch('${nodeId}')">
                        ➕ Thêm Nhánh
                    </button>
                </div>
                ${outgoingEdges.map((edge, edgeIndex) => {
                    const targetNode = nodes.find(n => n.id === edge.target);
                    const targetName = targetNode ? targetNode.name : edge.target;
                    if (edge.isDefault) {
                        return `
                            <div class="form-group" style="background:#fef7e0; padding:8px; border-radius:6px; border:1px solid #ffe0b2; margin-top:8px;">
                                <span style="font-size:11px; font-weight:700; color:#b06000;">NHÁNH MẶC ĐỊNH (Else): ➔ ${targetName}</span>
                                <small style="display:block; margin-top:2px;">Nhánh này tự động kích hoạt khi tất cả các điều kiện khác thất bại.</small>
                            </div>
                        `;
                    } else {
                        const parsed = parseExpression(node.type, edge.properties.expression);
                        let branchFieldsHtml = '';
                        
                        if (node.type === 'Condition_MemberRank') {
                            const currentRank = parsed.rank || (edgeIndex === 0 ? 'VIP' : edgeIndex === 1 ? 'GOLD' : 'SILVER');
                            branchFieldsHtml = `
                                <div class="form-group" style="margin-top:6px; margin-bottom:0;">
                                    <label style="font-size:10px;">Thành viên thuộc hạng</label>
                                    <select class="prop-edge-rank" data-edge-id="${edge.id}">
                                        <option value="MEMBER" ${currentRank === 'MEMBER' ? 'selected' : ''}>MEMBER</option>
                                        <option value="SILVER" ${currentRank === 'SILVER' ? 'selected' : ''}>SILVER</option>
                                        <option value="GOLD" ${currentRank === 'GOLD' ? 'selected' : ''}>GOLD</option>
                                        <option value="VIP" ${currentRank === 'VIP' ? 'selected' : ''}>VIP</option>
                                    </select>
                                </div>
                            `;
                        } else if (node.type === 'Condition_TotalSpending') {
                            const op = parsed.operator || '>=';
                            const amt = parsed.amount !== undefined ? parsed.amount : 5000000;
                            branchFieldsHtml = `
                                <div style="display:flex; gap:8px; margin-top:6px; margin-bottom:0;">
                                    <div class="form-group" style="flex:1; margin-bottom:0;">
                                        <label style="font-size:10px;">Phép toán</label>
                                        <select class="prop-edge-op" data-edge-id="${edge.id}">
                                            <option value=">=" ${op === '>=' ? 'selected' : ''}>&ge; (Lớn hơn hoặc bằng)</option>
                                            <option value=">" ${op === '>' ? 'selected' : ''}>&gt; (Lớn hơn)</option>
                                            <option value="<=" ${op === '<=' ? 'selected' : ''}>&le; (Nhỏ hơn hoặc bằng)</option>
                                            <option value="<" ${op === '<' ? 'selected' : ''}>&lt; (Nhỏ hơn)</option>
                                            <option value="==" ${op === '==' ? 'selected' : ''}>= (Bằng)</option>
                                        </select>
                                    </div>
                                    <div class="form-group" style="flex:1; margin-bottom:0;">
                                        <label style="font-size:10px;">Số tiền (VNĐ)</label>
                                        <input type="number" class="prop-edge-amt" data-edge-id="${edge.id}" value="${amt}">
                                    </div>
                                </div>
                            `;
                        } else if (node.type === 'Condition_AntiFraudScore') {
                            const op = parsed.operator || '<=';
                            const scr = parsed.score !== undefined ? parsed.score : 50;
                            branchFieldsHtml = `
                                <div style="display:flex; gap:8px; margin-top:6px; margin-bottom:0;">
                                    <div class="form-group" style="flex:1; margin-bottom:0;">
                                        <label style="font-size:10px;">Phép toán</label>
                                        <select class="prop-edge-op" data-edge-id="${edge.id}">
                                            <option value="<=" ${op === '<=' ? 'selected' : ''}>&le; (Nhỏ hơn hoặc bằng)</option>
                                            <option value="<" ${op === '<' ? 'selected' : ''}>&lt; (Nhỏ hơn)</option>
                                            <option value=">=" ${op === '>=' ? 'selected' : ''}>&ge; (Lớn hơn hoặc bằng)</option>
                                            <option value=">" ${op === '>' ? 'selected' : ''}>&gt; (Lớn hơn)</option>
                                            <option value="==" ${op === '==' ? 'selected' : ''}>= (Bằng)</option>
                                        </select>
                                    </div>
                                    <div class="form-group" style="flex:1; margin-bottom:0;">
                                        <label style="font-size:10px;">Điểm gian lận (1-100)</label>
                                        <input type="number" class="prop-edge-scr" data-edge-id="${edge.id}" value="${scr}" min="1" max="100">
                                    </div>
                                </div>
                            `;
                        } else {
                            const currentVal = parsed.value || parsed.raw || '';
                            branchFieldsHtml = `
                                <div class="form-group" style="margin-top:6px; margin-bottom:0;">
                                    <label style="font-size:10px;">Giá trị so khớp (Mã/Tỉnh thành)</label>
                                    <input type="text" class="prop-edge-val" data-edge-id="${edge.id}" value="${currentVal}" placeholder="Nhập giá trị">
                                </div>
                            `;
                        }
                        
                        return `
                            <div style="margin-top:10px; background:#f1f5f9; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:11px; font-weight:700; color:var(--text-primary);">NHÁNH ĐIỀU KIỆN: ➔ ${targetName}</span>
                                    <button style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:11px; font-weight:700;" onclick="deleteBranch('${edge.id}', '${nodeId}')">
                                        ❌ Xóa
                                    </button>
                                </div>
                                ${branchFieldsHtml}
                            </div>
                        `;
                    }
                }).join('')}
            </div>
        `;
    }
    
    // Action delete button (Don't allow delete for start / end nodes)
    let deleteBtnHtml = '';
    if (nodeId !== 'start' && nodeId !== 'end') {
        deleteBtnHtml = `
            <button class="btn btn-danger" style="width:100%; margin-top:8px;" onclick="deleteNode('${nodeId}')">
                🗑️ Xóa Khối Này
            </button>
        `;
    }
    
    fieldsHtml += `
        <button class="btn btn-primary" style="width:100%; margin-top:14px;" onclick="saveProperties('${nodeId}')">
            💾 Lưu Cấu Hình
        </button>
        ${deleteBtnHtml}
    `;
    
    propertyEditorContent.innerHTML = fieldsHtml;
};

// Change Trigger event type for start node
window.changeTriggerType = function(newType) {
    const startNode = nodes.find(n => n.id === 'start');
    if (startNode) {
        startNode.type = newType;
        startNode.name = 'Bắt đầu';
        startNode.properties = NODE_TYPES[newType].defaultProps ? JSON.parse(JSON.stringify(NODE_TYPES[newType].defaultProps)) : {};
        
        renderCanvas();
        renderPropertyEditor('start');
        updateJsonPreview();
    }
};

// Save properties input back to global graph state
window.saveProperties = function(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const nameInput = document.getElementById('prop-node-name');
    if (nameInput) {
        node.name = nameInput.value.trim();
    }
    
    // Save properties by type
    switch (node.type) {
        case 'Trigger_Event_OrderSuccess':
            node.properties.minOrderValue = Number(document.getElementById('prop-minOrderValue').value);
            break;
        case 'Trigger_Event_ReviewProduct':
            node.properties.minRating = Number(document.getElementById('prop-minRating').value);
            break;
        case 'Trigger_Timer_Schedule':
            node.properties.cronExpression = document.getElementById('prop-cronExpression').value.trim();
            node.properties.startDate = document.getElementById('prop-startDate').value.trim();
            node.properties.endDate = document.getElementById('prop-endDate').value.trim();
            break;
        case 'Condition_MemberRank':
            const activeRanks = [];
            const outgoing = edges.filter(e => e.source === nodeId && !e.isDefault);
            outgoing.forEach(edge => {
                const rankEl = document.querySelector(`.prop-edge-rank[data-edge-id="${edge.id}"]`);
                if (rankEl) activeRanks.push(rankEl.value);
            });
            node.properties.allowedRanks = activeRanks.length > 0 ? activeRanks : ['GOLD', 'VIP'];
            break;
        case 'Condition_TotalSpending':
            node.properties.daysLookback = Number(document.getElementById('prop-daysLookback').value);
            break;
        case 'Condition_Location':
            node.properties.targetProvinces = document.getElementById('prop-targetProvinces').value.split(',').map(s => s.trim()).filter(Boolean);
            break;
        case 'Condition_ContainsCategory':
        case 'Condition_ContainsProduct':
            node.properties.targetIds = document.getElementById('prop-targetIds').value.split(',').map(s => s.trim()).filter(Boolean);
            break;
        case 'Condition_AntiFraudScore':
            node.properties.maxRiskScore = Number(document.getElementById('prop-maxRiskScore').value);
            break;
        case 'Action_IssueVoucher_Percent':
            node.properties.discountPercent = Number(document.getElementById('prop-discountPercent').value);
            node.properties.maxDiscountAmount = Number(document.getElementById('prop-maxDiscountAmount').value);
            node.properties.expireDays = Number(document.getElementById('prop-expireDays').value);
            break;
        case 'Action_IssueVoucher_Fixed':
            node.properties.discountAmount = Number(document.getElementById('prop-discountAmount').value);
            node.properties.minOrderValue = Number(document.getElementById('prop-minOrderValue').value);
            node.properties.expireDays = Number(document.getElementById('prop-expireDays').value);
            break;
        case 'Action_IssueVoucher_Freeship':
            node.properties.maxShippingDiscount = Number(document.getElementById('prop-maxShippingDiscount').value);
            node.properties.expireDays = Number(document.getElementById('prop-expireDays').value);
            break;
        case 'Action_Upgrade_MemberRank':
            node.properties.targetTier = document.getElementById('prop-targetTier').value;
            break;
        case 'Action_Loyalty_Point':
            node.properties.calculationMode = document.getElementById('prop-calculationMode').value;
            node.properties.pointAmount = Number(document.getElementById('prop-pointAmount').value);
            break;
        case 'Action_Send_Email':
        case 'Action_Send_SMS':
            node.properties.templateId = document.getElementById('prop-templateId').value.trim();
            node.properties.rawContent = document.getElementById('prop-rawContent').value;
            break;
    }
    
    // Save expressions of outgoing edges (if condition node)
    if (NODE_TYPES[node.type].category === 'condition') {
        const outgoingEdges = edges.filter(e => e.source === nodeId);
        outgoingEdges.forEach(edge => {
            if (edge.isDefault) return;
            
            let expr = '';
            let props = {};
            if (node.type === 'Condition_MemberRank') {
                const selectEl = document.querySelector(`.prop-edge-rank[data-edge-id="${edge.id}"]`);
                if (selectEl) {
                    const rankVal = selectEl.value;
                    expr = `\${memberRank == '${rankVal}'}`;
                    props = {
                        expression: expr,
                        operator: 'IN',
                        value: rankVal
                    };
                }
            } else if (node.type === 'Condition_TotalSpending') {
                const opEl = document.querySelector(`.prop-edge-op[data-edge-id="${edge.id}"]`);
                const amtEl = document.querySelector(`.prop-edge-amt[data-edge-id="${edge.id}"]`);
                if (opEl && amtEl) {
                    const op = opEl.value;
                    const amt = Number(amtEl.value);
                    expr = `\${totalSpending ${op} ${amt}}`;
                    
                    let javaOp = 'GREATER_THAN';
                    if (op === '<=' || op === '<') javaOp = 'LESS_THAN';
                    else if (op === '==') javaOp = 'EQUAL';
                    
                    props = {
                        expression: expr,
                        operator: javaOp,
                        value: amt,
                        timeRange: 'LAST_30_DAYS'
                    };
                }
            } else if (node.type === 'Condition_AntiFraudScore') {
                const opEl = document.querySelector(`.prop-edge-op[data-edge-id="${edge.id}"]`);
                const scrEl = document.querySelector(`.prop-edge-scr[data-edge-id="${edge.id}"]`);
                if (opEl && scrEl) {
                    const op = opEl.value;
                    const scr = Number(scrEl.value);
                    expr = `\${antiFraudScore ${op} ${scr}}`;
                    
                    props = {
                        expression: expr,
                        operator: op,
                        value: scr
                    };
                }
            } else {
                const valEl = document.querySelector(`.prop-edge-val[data-edge-id="${edge.id}"]`);
                if (valEl) {
                    const rawVal = valEl.value.trim();
                    if (node.type === 'Condition_Location') {
                        expr = `\${targetProvince == '${rawVal}'}`;
                        props = {
                            expression: expr,
                            operator: 'EQUAL',
                            value: [rawVal]
                        };
                    } else if (node.type === 'Condition_ContainsCategory') {
                        expr = `\${containsCategory == '${rawVal}'}`;
                        props = {
                            expression: expr,
                            operator: 'EQUAL',
                            value: [rawVal]
                        };
                    } else if (node.type === 'Condition_ContainsProduct') {
                        expr = `\${containsProduct == '${rawVal}'}`;
                        props = {
                            expression: expr,
                            operator: 'EQUAL',
                            value: [rawVal]
                        };
                    } else {
                        expr = rawVal;
                        props = { expression: expr };
                    }
                }
            }
            
            edge.properties = props;
        });
    }
    
    renderCanvas();
    renderPropertyEditor(nodeId);
    updateJsonPreview();
    showToast('Đã cập nhật cấu hình thuộc tính.', 'success');
};
