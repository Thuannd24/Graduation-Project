// Render Canvas view
window.renderCanvas = function() {
    // 1. Remove old midpoint connectors
    document.querySelectorAll('.midpoint-connector').forEach(el => el.remove());
    
    // 2. Clear canvas node container, leaving only SVG
    const nodesContainer = flowCanvas.querySelectorAll('.canvas-node-wrapper, .flow-row');
    nodesContainer.forEach(el => el.remove());
    
    // 3. Compute layout coordinates
    const layout = computeLayout();
    const nodeLevels = layout.levels;
    const nodeColumns = layout.columns;
    
    const colsList = Object.values(nodeColumns);
    const minCol = Math.min(...colsList, -1);
    const maxCol = Math.max(...colsList, 1);
    
    // Group nodes by level
    const maxLevel = Math.max(...Object.values(nodeLevels), 0);
    const rows = Array.from({ length: maxLevel + 1 }, () => []);
    
    nodes.forEach(node => {
        const lvl = nodeLevels[node.id];
        rows[lvl].push(node);
    });
    
    // 4. Render Row elements
    rows.forEach((rowNodes, lvlIndex) => {
        if (rowNodes.length === 0) return;
        
        const rowEl = document.createElement('div');
        rowEl.className = 'flow-row';
        rowEl.setAttribute('data-level', lvlIndex);
        
        // Loop through columns in this row to build vertical columns
        for (let col = minCol; col <= maxCol; col++) {
            const slotEl = document.createElement('div');
            slotEl.className = 'grid-slot';
            
            const node = rowNodes.find(n => nodeColumns[n.id] === col);
            if (node) {
                const meta = NODE_TYPES[node.type];
                const nodeWrapper = document.createElement('div');
                nodeWrapper.className = 'canvas-node-wrapper';
                nodeWrapper.setAttribute('id', `node-wrap-${node.id}`);
                
                // Name label at the top
                const labelEl = document.createElement('div');
                labelEl.className = 'node-label-top';
                labelEl.textContent = node.name;
                nodeWrapper.appendChild(labelEl);
                
                // Shape wrapper
                const shapeEl = document.createElement('div');
                const isSelected = node.id === selectedNodeId;
                
                if (node.id === 'start') {
                    shapeEl.className = `shape-start ${isSelected ? 'selected' : ''}`;
                    shapeEl.innerHTML = `<span class="icon">${meta.icon}</span>`;
                    
                    // Hỗ trợ thả sự kiện kích hoạt vào nút Bắt đầu để đổi loại Trigger
                    shapeEl.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        shapeEl.classList.add('drag-over');
                    });
                    shapeEl.addEventListener('dragleave', () => {
                        shapeEl.classList.remove('drag-over');
                    });
                    shapeEl.addEventListener('drop', (e) => {
                        e.preventDefault();
                        shapeEl.classList.remove('drag-over');
                        const type = e.dataTransfer.getData('text/plain');
                        const targetMeta = NODE_TYPES[type];
                        if (targetMeta && targetMeta.category === 'trigger') {
                            changeTriggerType(type);
                            showToast(`Đã thay đổi sự kiện kích hoạt thành: ${targetMeta.name}`, 'success');
                        } else {
                            showToast('Chỉ có thể thả sự kiện kích hoạt (Trigger) vào nút Bắt đầu.', 'error');
                        }
                    });
                } else if (node.id === 'end') {
                    shapeEl.className = `shape-end ${isSelected ? 'selected' : ''}`;
                    shapeEl.innerHTML = `<span class="icon">${meta.icon}</span>`;
                } else if (meta.category === 'condition') {
                    shapeEl.className = `shape-condition-container ${isSelected ? 'selected' : ''}`;
                    // Enhanced diamond with anchor points
                    shapeEl.innerHTML = `
                        <div class="shape-condition-diamond"></div>
                        <div class="shape-condition-content">${meta.icon}</div>
                        <div class="condition-anchor condition-anchor-top"></div>
                        <div class="condition-anchor condition-anchor-left"></div>
                        <div class="condition-anchor condition-anchor-right"></div>
                        <div class="condition-anchor condition-anchor-bottom"></div>
                    `;
                } else {
                    shapeEl.className = `shape-action ${isSelected ? 'selected' : ''}`;
                    shapeEl.innerHTML = `
                        <span class="node-type-badge">${meta.name}</span>
                        <span class="node-title-text">${node.name}</span>
                    `;
                }
                
                shapeEl.onclick = (e) => {
                    e.stopPropagation();
                    selectedNodeId = node.id;
                    renderCanvas();
                    renderPropertyEditor(node.id);
                };
                
                nodeWrapper.appendChild(shapeEl);
                slotEl.appendChild(nodeWrapper);
            }
            
            rowEl.appendChild(slotEl);
        }
        
        flowCanvas.appendChild(rowEl);
    });
    
    // 5. Draw SVG arrows & overlay + connectors (delayed by 50ms to allow DOM paint)
    setTimeout(() => {
        drawSVGLines();
    }, 50);
};

// Cấu hình sự kiện Kéo thả từ Sidebar
window.setupDragAndDrop = function() {
    const cards = document.querySelectorAll('.toolbox-card');
    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.getAttribute('data-type'));
            e.dataTransfer.effectAllowed = 'copy';
            card.classList.add('dragging');
            connectionsSvg.style.pointerEvents = 'auto';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.midpoint-connector').forEach(el => el.classList.remove('drag-over'));
            document.querySelectorAll('.shape-start').forEach(el => el.classList.remove('drag-over'));
            connectionsSvg.style.pointerEvents = 'none';
        });
    });
};

// Open Floating Dropdown to select Node type to insert
window.openInsertPopover = function(edgeId, x, y) {
    closeInsertPopover();
    
    activeInsertEdgeId = edgeId;
    
    const popover = document.createElement('div');
    popover.className = 'insert-popover';
    popover.style.left = `${x - 145}px`; // Centered on x
    popover.style.top = `${y + 15}px`;
    
    // Sort node types into groups for selection
    const conditionsHtml = Object.entries(NODE_TYPES)
        .filter(([_, meta]) => meta.category === 'condition')
        .map(([type, meta]) => `<button class="insert-btn-item" onclick="insertNode('${type}')">${meta.icon} ${meta.name}</button>`)
        .join('');
        
    const actionsHtml = Object.entries(NODE_TYPES)
        .filter(([_, meta]) => meta.category === 'action')
        .map(([type, meta]) => `<button class="insert-btn-item" onclick="insertNode('${type}')">${meta.icon} ${meta.name}</button>`)
        .join('');
        
    popover.innerHTML = `
        <div class="insert-popover-header">
            <h4>Chèn Khối Mới Vào Sơ Đồ</h4>
            <button class="btn-close" onclick="closeInsertPopover()" style="font-size:16px;">&times;</button>
        </div>
        <div class="insert-group">
            <h5>Điều Kiện Rẽ Nhánh</h5>
            ${conditionsHtml}
        </div>
        <div class="insert-group" style="margin-top: 14px;">
            <h5>Hành Động Nhận Thưởng</h5>
            ${actionsHtml}
        </div>
    `;
    
    flowCanvas.appendChild(popover);
    activePopoverEl = popover;
};

// Insert a node inside the active edge connection path
window.insertNode = function(type) {
    if (!activeInsertEdgeId) return;
    
    const meta = NODE_TYPES[type];
    if (!meta) return;
    
    const edgeIndex = edges.findIndex(e => e.id === activeInsertEdgeId);
    if (edgeIndex === -1) return;
    
    const targetEdge = edges[edgeIndex];
    const sourceNodeId = targetEdge.source;
    const targetNodeId = targetEdge.target;
    
    const id = `${type.replace(/^[A-Za-z_]+_/, '').toLowerCase()}_${nodeCounter++}`;
    const name = `${meta.name}`;
    const properties = meta.defaultProps ? JSON.parse(JSON.stringify(meta.defaultProps)) : {};
    
    nodes.push({ id, name, type, properties });
    
    edges.splice(edgeIndex, 1);
    
    if (meta.category === 'condition') {
        // Create incoming edge to condition
        edges.push({
            id: `edge_${sourceNodeId}_to_${id}`,
            source: sourceNodeId,
            target: id,
            isDefault: targetEdge.isDefault,
            properties: targetEdge.properties ? JSON.parse(JSON.stringify(targetEdge.properties)) : {}
        });
        
        // Create default branch (Else)
        edges.push({
            id: `edge_${id}_to_${targetNodeId}_default`,
            source: id,
            target: targetNodeId,
            isDefault: true,
            properties: {}
        });
        
        // Create first condition branch with unique default expression
        let defaultExpr = '';
        if (type === 'Condition_MemberRank') defaultExpr = '${memberRank == "VIP"}';
        else if (type === 'Condition_TotalSpending') defaultExpr = '${totalSpending >= 5000000}';
        else if (type === 'Condition_AntiFraudScore') defaultExpr = '${antiFraudScore <= 50}';
        else if (type === 'Condition_Location') defaultExpr = '${targetProvince == "Hanoi"}';
        
        edges.push({
            id: `edge_${id}_to_${targetNodeId}_branch_${nodeCounter++}`,
            source: id,
            target: targetNodeId,
            isDefault: false,
            properties: { expression: defaultExpr }
        });
    } else {
        // For action nodes: simple chain
        edges.push({
            id: `edge_${sourceNodeId}_to_${id}`,
            source: sourceNodeId,
            target: id,
            isDefault: targetEdge.isDefault,
            properties: targetEdge.properties ? JSON.parse(JSON.stringify(targetEdge.properties)) : {}
        });
        
        edges.push({
            id: `edge_${id}_to_${targetNodeId}`,
            source: id,
            target: targetNodeId,
            isDefault: false,
            properties: {}
        });
    }
    
    selectedNodeId = id;
    closeInsertPopover();
    renderCanvas();
    renderPropertyEditor(id);
    updateJsonPreview();
    showToast(`Đã chèn khối thành công.`, 'success');
};

// Delete node from graph and restore path connection safely with gateway auto-cleanup
window.deleteNode = function(nodeId) {
    if (nodeId === 'start' || nodeId === 'end') return;
    
    const incomingEdge = edges.find(e => e.target === nodeId);
    const outgoingEdges = edges.filter(e => e.source === nodeId);
    
    if (incomingEdge && outgoingEdges.length > 0) {
        const sourceNodeId = incomingEdge.source;
        
        if (outgoingEdges.length === 1) {
            const targetNodeId = outgoingEdges[0].target;
            const duplicate = edges.some(e => e.source === sourceNodeId && e.target === targetNodeId);
            if (!duplicate) {
                edges.push({
                    id: `edge_${sourceNodeId}_to_${targetNodeId}`,
                    source: sourceNodeId,
                    target: targetNodeId,
                    isDefault: incomingEdge.isDefault,
                    properties: incomingEdge.properties ? JSON.parse(JSON.stringify(incomingEdge.properties)) : {}
                });
            }
        } else {
            const defaultEdge = outgoingEdges.find(e => e.isDefault) || outgoingEdges[0];
            edges.push({
                id: `edge_${sourceNodeId}_to_${defaultEdge.target}`,
                source: sourceNodeId,
                target: defaultEdge.target,
                isDefault: incomingEdge.isDefault,
                properties: {}
            });
        }
    }
    
    nodes = nodes.filter(n => n.id !== nodeId);
    edges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    
    let checkAgain = true;
    while (checkAgain) {
        checkAgain = false;
        const conditionNodes = nodes.filter(n => NODE_TYPES[n.type].category === 'condition');
        for (const condNode of conditionNodes) {
            const condOut = edges.filter(e => e.source === condNode.id);
            const uniqueTargets = new Set(condOut.map(e => e.target));
            if (uniqueTargets.size <= 1) {
                const condIn = edges.find(e => e.target === condNode.id);
                if (condIn && condOut.length >= 1) {
                    const sourceId = condIn.source;
                    const targetId = condOut[0].target;
                    const duplicate = edges.some(e => e.source === sourceId && e.target === targetId);
                    if (!duplicate) {
                        edges.push({
                            id: `edge_${sourceId}_to_${targetId}`,
                            source: sourceId,
                            target: targetId,
                            isDefault: condIn.isDefault,
                            properties: condIn.properties ? JSON.parse(JSON.stringify(condIn.properties)) : {}
                        });
                    }
                }
                nodes = nodes.filter(n => n.id !== condNode.id);
                edges = edges.filter(e => e.source !== condNode.id && e.target !== condNode.id);
                checkAgain = true;
                break;
            }
        }
    }
    
    if (selectedNodeId === nodeId) {
        selectedNodeId = null;
        clearPropertyEditor();
    }
    
    renderCanvas();
    updateJsonPreview();
    showToast('Đã xóa khối và dọn dẹp sơ đồ.', 'success');
};

// Thêm nhánh điều kiện mới từ khối Condition
window.addBranch = function(conditionNodeId) {
    const defaultEdge = edges.find(e => e.source === conditionNodeId && e.isDefault);
    const targetNodeId = defaultEdge ? defaultEdge.target : 'end';
    
    const condNode = nodes.find(n => n.id === conditionNodeId);
    const type = condNode ? condNode.type : 'Condition_MemberRank';
    
    // Get existing non-default branches to avoid duplicate values
    const existingBranches = edges.filter(e => e.source === conditionNodeId && !e.isDefault);
    const usedValues = new Set();
    
    existingBranches.forEach(e => {
        if (type === 'Condition_MemberRank') {
            const match = e.properties.expression?.match(/memberRank\s*==\s*['"]([^'"]+)['"]/);
            if (match) usedValues.add(match[1]);
        }
    });
    
    // Generate unique default expression
    let defaultExpr = '';
    if (type === 'Condition_MemberRank') {
        const ranks = ['VIP', 'GOLD', 'SILVER', 'MEMBER'];
        const unusedRank = ranks.find(r => !usedValues.has(r)) || 'SILVER';
        defaultExpr = `\${memberRank == '${unusedRank}'}`;
    } else if (type === 'Condition_TotalSpending') {
        defaultExpr = "${totalSpending >= 10000000}";
    } else if (type === 'Condition_AntiFraudScore') {
        defaultExpr = "${antiFraudScore <= 30}";
    } else if (type === 'Condition_Location') {
        defaultExpr = "${targetProvince == 'Danang'}";
    }
    
    const newEdgeId = `edge_${conditionNodeId}_to_${targetNodeId}_branch_${nodeCounter++}`;
    edges.push({
        id: newEdgeId,
        source: conditionNodeId,
        target: targetNodeId,
        isDefault: false,
        properties: { expression: defaultExpr }
    });
    
    renderCanvas();
    renderPropertyEditor(conditionNodeId);
    updateJsonPreview();
    showToast('Đã thêm một nhánh điều kiện mới. Bạn có thể bấm nút (+) trên nhánh để thêm hành động.', 'success');
};

// Xóa một nhánh điều kiện và dọn dẹp các node mồ côi
window.deleteBranch = function(edgeId, conditionNodeId) {
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    if (edge.isDefault) {
        showToast('Không thể xóa nhánh mặc định (Else).', 'error');
        return;
    }
    
    const targetNodeId = edge.target;
    edges = edges.filter(e => e.id !== edgeId);
    
    if (targetNodeId !== 'end') {
        const otherIncoming = edges.filter(e => e.target === targetNodeId);
        if (otherIncoming.length === 0) {
            nodes = nodes.filter(n => n.id !== targetNodeId);
            edges = edges.filter(e => e.source !== targetNodeId);
        }
    }
    
    let checkAgain = true;
    while (checkAgain) {
        checkAgain = false;
        const conditionNodes = nodes.filter(n => NODE_TYPES[n.type].category === 'condition');
        for (const condNode of conditionNodes) {
            const condOut = edges.filter(e => e.source === condNode.id);
            const uniqueTargets = new Set(condOut.map(e => e.target));
            if (uniqueTargets.size <= 1) {
                const condIn = edges.find(e => e.target === condNode.id);
                if (condIn && condOut.length >= 1) {
                    const sourceId = condIn.source;
                    const targetId = condOut[0].target;
                    const duplicate = edges.some(e => e.source === sourceId && e.target === targetId);
                    if (!duplicate) {
                        edges.push({
                            id: `edge_${sourceId}_to_${targetId}`,
                            source: sourceId,
                            target: targetId,
                            isDefault: condIn.isDefault,
                            properties: condIn.properties ? JSON.parse(JSON.stringify(condIn.properties)) : {}
                        });
                    }
                }
                nodes = nodes.filter(n => n.id !== condNode.id);
                edges = edges.filter(e => e.source !== condNode.id && e.target !== condNode.id);
                checkAgain = true;
                break;
            }
        }
    }
    
    renderCanvas();
    renderPropertyEditor(conditionNodeId);
    updateJsonPreview();
    showToast('Đã xóa nhánh điều kiện và dọn dẹp các khối liên quan.', 'success');
};
