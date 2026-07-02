// Compute levels hierarchical sorting (BFS approach from start node)
window.computeLevels = function() {
    const levels = {};
    const visited = new Set();
    const queue = ['start'];
    levels['start'] = 0;
    
    while (queue.length > 0) {
        const curr = queue.shift();
        const currLevel = levels[curr] || 0;
        
        const outgoingEdges = edges.filter(e => e.source === curr);
        outgoingEdges.forEach(edge => {
            const target = edge.target;
            levels[target] = Math.max(levels[target] || 0, currLevel + 1);
            if (!visited.has(target)) {
                queue.push(target);
            }
        });
        visited.add(curr);
    }
    
    // Fallback for orphaned nodes (if any)
    nodes.forEach(n => {
        if (levels[n.id] === undefined) {
            levels[n.id] = 1;
        }
    });
    
    // Force end event to be the last level
    const maxLevel = Math.max(...Object.values(levels).filter(v => v !== levels['end']), 0);
    levels['end'] = maxLevel + 1;
    
    return levels;
};

// Compute layout (levels and columns) to align parallel branches vertically without overlaps
window.computeLayout = function() {
    const levels = computeLevels();
    const columns = {};
    const occupied = {}; // key: "level_col", value: nodeId
    
    function occupySlot(nodeId, level, preferredCol) {
        let col = preferredCol;
        let step = 1;
        let direction = 1;
        while (occupied[`${level}_${col}`] && occupied[`${level}_${col}`] !== nodeId) {
            col = preferredCol + direction * step;
            if (direction === 1) {
                direction = -1;
            } else {
                direction = 1;
                step++;
            }
        }
        columns[nodeId] = col;
        occupied[`${level}_${col}`] = nodeId;
    }
    
    // Start node is always at column 0
    occupySlot('start', 0, 0);
    
    const visitedCols = new Set();
    const colQueue = ['start'];
    
    while (colQueue.length > 0) {
        const curr = colQueue.shift();
        if (visitedCols.has(curr)) continue;
        visitedCols.add(curr);
        
        const currCol = columns[curr] || 0;
        const currLevel = levels[curr] || 0;
        
        const outEdges = edges.filter(e => e.source === curr);
        if (outEdges.length > 0) {
            // Sort edges: non-default first, then default Else
            const sortedEdges = [...outEdges].sort((a, b) => {
                if (a.isDefault && !b.isDefault) return 1;
                if (!a.isDefault && b.isDefault) return -1;
                return 0;
            });
            
            const k = sortedEdges.length;
            if (k === 1) {
                const target = sortedEdges[0].target;
                const targetLevel = levels[target] || (currLevel + 1);
                if (columns[target] === undefined) {
                    if (target === 'end') {
                        occupySlot(target, targetLevel, 0);
                    } else {
                        occupySlot(target, targetLevel, currCol);
                    }
                }
                colQueue.push(target);
            } else {
                // Multiple branches - IMPROVED ALGORITHM FOR ALL CONDITIONS
                const sourceNode = nodes.find(n => n.id === curr);
                const isCondition = sourceNode && NODE_TYPES[sourceNode.type]?.category === 'condition';
                
                // Dynamic spacing based on number of branches
                // More branches = wider spacing to avoid overlap
                const numBranches = sortedEdges.length;
                const baseSpacing = isCondition ? 2 : 1;
                const spacing = baseSpacing * Math.max(1, Math.ceil(numBranches / 2));
                
                // Separate default from non-default
                const nonDefaultEdges = sortedEdges.filter(e => !e.isDefault);
                const defaultEdges = sortedEdges.filter(e => e.isDefault);
                
                sortedEdges.forEach((edge, idx) => {
                    const target = edge.target;
                    const targetLevel = levels[target] || (currLevel + 1);
                    
                    if (columns[target] !== undefined) {
                        // Already assigned - multiple edges to same target
                        // This is OK for End node (convergence point)
                        // Paths will curve from different columns back to target's column
                        colQueue.push(target);
                        return;
                    }
                    
                    if (target === 'end') {
                        // End node always center (column 0)
                        occupySlot(target, targetLevel, 0);
                        colQueue.push(target);
                        return;
                    }
                    
                    if (edge.isDefault) {
                        // Default branch: center or slightly offset if center is occupied
                        occupySlot(target, targetLevel, currCol);
                    } else {
                        // Non-default branches: distribute evenly left and right
                        const nonDefaultIndex = nonDefaultEdges.findIndex(e => e.id === edge.id);
                        const totalNonDefault = nonDefaultEdges.length;
                        
                        let offset;
                        
                        if (totalNonDefault === 1) {
                            // Only 1 non-default: slight offset to show it's not default
                            offset = -spacing;
                        } else if (totalNonDefault === 2) {
                            // 2 non-default: one left, one right
                            offset = (nonDefaultIndex === 0) ? -spacing : spacing;
                        } else {
                            // 3+ non-default: distribute around center
                            // Pattern: -spacing, +spacing, -spacing*2, +spacing*2, -spacing*3, ...
                            if (nonDefaultIndex % 2 === 0) {
                                // Even indices (0, 2, 4...): go left
                                offset = -spacing * (Math.floor(nonDefaultIndex / 2) + 1);
                            } else {
                                // Odd indices (1, 3, 5...): go right
                                offset = spacing * Math.ceil(nonDefaultIndex / 2);
                            }
                        }
                        
                        occupySlot(target, targetLevel, currCol + offset);
                    }
                    
                    colQueue.push(target);
                });
            }
        }
    }
    
    if (columns['end'] === undefined) {
        columns['end'] = 0;
    }
    
    nodes.forEach(n => {
        if (columns[n.id] === undefined) {
            const lvl = levels[n.id] || 1;
            occupySlot(n.id, lvl, 0);
        }
    });
    
    return { levels, columns };
};

// Draw SVG Connection Lines & place "+" insertion buttons
window.drawSVGLines = function() {
    connectionsSvg.innerHTML = '';
    
    // Clear old midpoint connectors and labels first
    document.querySelectorAll('.midpoint-connector, .edge-branch-label').forEach(el => el.remove());
    
    const canvasRect = flowCanvas.getBoundingClientRect();
    
    edges.forEach(edge => {
        const sourceEl = document.getElementById(`node-wrap-${edge.source}`);
        const targetEl = document.getElementById(`node-wrap-${edge.target}`);
        
        if (!sourceEl || !targetEl) return;
        
        const sourceShape = sourceEl.querySelector('.shape-start, .shape-condition-container, .shape-action, .shape-end');
        const targetShape = targetEl.querySelector('.shape-start, .shape-condition-container, .shape-action, .shape-end');
        
        if (!sourceShape || !targetShape) return;
        
        const sourceRect = sourceShape.getBoundingClientRect();
        const targetRect = targetShape.getBoundingClientRect();
        
        const sourceNode = nodes.find(n => n.id === edge.source);
        const isSourceCondition = sourceNode && NODE_TYPES[sourceNode.type] && NODE_TYPES[sourceNode.type].category === 'condition';
        
        // Coordinates relative to canvas
        let startX = sourceRect.left + sourceRect.width / 2 - canvasRect.left;
        let startY = sourceRect.bottom - canvasRect.top;
        
        const endX = targetRect.left + targetRect.width / 2 - canvasRect.left;
        const endY = targetRect.top - canvasRect.top;
        
        // For condition nodes, adjust start point based on branch direction
        if (isSourceCondition) {
            const sourceCenterX = sourceRect.left + sourceRect.width / 2 - canvasRect.left;
            const sourceCenterY = sourceRect.top + sourceRect.height / 2 - canvasRect.top;
            
            // Calculate horizontal distance to determine anchor usage
            const horizontalDistance = endX - sourceCenterX;
            const threshold = 50; // Increased threshold for better detection
            
            // Determine which anchor to use based on target position
            if (horizontalDistance < -threshold) {
                // Target is significantly LEFT → use left anchor
                startX = sourceRect.left - canvasRect.left;
                startY = sourceCenterY;
            } else if (horizontalDistance > threshold) {
                // Target is significantly RIGHT → use right anchor
                startX = sourceRect.right - canvasRect.left;
                startY = sourceCenterY;
            } else {
                // Target is center/below → use bottom anchor
                startX = sourceCenterX;
                startY = sourceRect.bottom - canvasRect.top;
            }
        }
        
        // Create path element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Render Manhattan orthogonal path for clean enterprise look
        let d = '';
        if (Math.abs(startX - endX) < 15) {
            // Straight vertical line for same column
            d = `M ${startX} ${startY} L ${endX} ${endY}`;
        } else {
            // Branching flow - exit horizontally first, then go down
            const isSourceCondition = sourceNode && NODE_TYPES[sourceNode.type] && NODE_TYPES[sourceNode.type].category === 'condition';
            
            if (isSourceCondition) {
                // For condition nodes: Exit from side (left/right), then curve down
                const horizontalExit = startY + 15; // Exit horizontally 15px below diamond center
                const verticalEntry = endY - 30;     // Enter target from above
                
                d = `M ${startX} ${startY} ` +
                    `L ${startX} ${horizontalExit} ` +  // Go down a bit
                    `L ${endX} ${horizontalExit} ` +     // Go horizontal to target X
                    `L ${endX} ${endY}`;                 // Go down to target
            } else {
                // Normal branching
                const midY = (startY + endY) / 2;
                d = `M ${startX} ${startY} ` +
                    `L ${startX} ${midY} ` +
                    `L ${endX} ${midY} ` +
                    `L ${endX} ${endY}`;
            }
        }
        
        const strokeColor = edge.isDefault ? '#d97706' : '#4f46e5';
        
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', strokeColor); // Condition paths in Indigo blue, Else in orange
        path.setAttribute('stroke-width', '2.5');
        if (edge.isDefault) {
            path.setAttribute('stroke-dasharray', '5,5');
        }
        
        connectionsSvg.appendChild(path);
        
        // Calculate midpoint along the actual path segments
        let midX, midY;
        if (isSourceCondition && Math.abs(startX - endX) >= 15) {
            // For branching conditions, place midpoint on the horizontal segment
            const horizontalExit = startY + 15;
            midX = (startX + endX) / 2;
            midY = horizontalExit;
        } else {
            midX = (startX + endX) / 2;
            midY = (startY + endY) / 2;
        }
        
        // Create "+" button overlay
        const connectorBtn = document.createElement('div');
        connectorBtn.className = 'midpoint-connector';
        connectorBtn.innerHTML = '+';
        connectorBtn.style.left = `${midX}px`;
        connectorBtn.style.top = `${midY}px`;
        connectorBtn.title = edge.isDefault ? 'Chèn khối vào luồng rẽ nhánh mặc định' : 'Chèn khối mới vào đây';
        
        connectorBtn.onclick = (e) => {
            e.stopPropagation();
            openInsertPopover(edge.id, midX, midY);
        };
        
        // Hỗ trợ kéo thả khối trực tiếp vào nút dấu cộng
        connectorBtn.addEventListener('dragover', (e) => {
            e.preventDefault();
            connectorBtn.classList.add('drag-over');
        });
        connectorBtn.addEventListener('dragleave', () => {
            connectorBtn.classList.remove('drag-over');
        });
        connectorBtn.addEventListener('drop', (e) => {
            e.preventDefault();
            connectorBtn.classList.remove('drag-over');
            const type = e.dataTransfer.getData('text/plain');
            const targetMeta = NODE_TYPES[type];
            if (targetMeta && targetMeta.category !== 'trigger' && targetMeta.category !== 'end') {
                activeInsertEdgeId = edge.id;
                insertNode(type);
            } else {
                showToast('Không thể chèn sự kiện kích hoạt (Trigger) hoặc Kết thúc vào giữa sơ đồ.', 'error');
            }
        });
        
        // Create branch faint text label (e.g. VIP, GOLD, or TotalSpending expression)
        let labelText = '';
        if (isSourceCondition) {
            if (edge.properties && edge.properties.expression) {
                const expr = edge.properties.expression;
                if (sourceNode.type === 'Condition_MemberRank') {
                    const match = expr.match(/==\s*'([^']+)'/) || expr.match(/==\s*"([^"]+)"/);
                    labelText = match ? match[1] : '';
                } else if (sourceNode.type === 'Condition_TotalSpending') {
                    const match = expr.match(/totalSpending\s*(>=|<=|>|<|==)\s*(\d+)/);
                    if (match) {
                        const val = Number(match[2]).toLocaleString('vi-VN');
                        labelText = `${match[1]} ${val}đ`;
                    }
                } else if (sourceNode.type === 'Condition_AntiFraudScore') {
                    const match = expr.match(/antiFraudScore\s*(>=|<=|>|<|==)\s*(\d+)/);
                    if (match) {
                        labelText = `${match[1]} ${match[2]}`;
                    }
                } else if (sourceNode.type === 'Condition_Location') {
                    const match = expr.match(/targetProvince\s*==\s*'([^']+)'/) || expr.match(/targetProvince\s*==\s*"([^"]+)"/);
                    labelText = match ? match[1] : '';
                } else {
                    labelText = expr;
                }
            } else if (edge.isDefault) {
                labelText = 'Khác (Else)';
            }
        }
        
        if (labelText) {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'edge-branch-label';
            labelDiv.textContent = labelText;
            labelDiv.style.left = `${midX}px`;
            labelDiv.style.top = `${midY - 24}px`;
            flowCanvas.appendChild(labelDiv);
        }
        
        // TẠO ĐƯỜNG NỐI TƯƠNG TÁC TÀNG HÌNH THÂN THIỆN KÉO THẢ (24px hover-width)
        const interactPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        interactPath.setAttribute('d', d);
        interactPath.setAttribute('fill', 'none');
        interactPath.setAttribute('stroke', 'transparent');
        interactPath.setAttribute('stroke-width', '24');
        interactPath.setAttribute('style', 'cursor: cell; pointer-events: stroke;');
        
        // Lắng nghe sự kiện kéo qua đường nối tàng hình này
        interactPath.addEventListener('dragover', (e) => {
            e.preventDefault();
            path.setAttribute('stroke', '#4f46e5');
            path.setAttribute('stroke-width', '4');
            connectorBtn.classList.add('drag-over');
        });
        interactPath.addEventListener('dragleave', () => {
            path.setAttribute('stroke', strokeColor);
            path.setAttribute('stroke-width', '2.5');
            connectorBtn.classList.remove('drag-over');
        });
        interactPath.addEventListener('drop', (e) => {
            e.preventDefault();
            path.setAttribute('stroke', strokeColor);
            path.setAttribute('stroke-width', '2.5');
            connectorBtn.classList.remove('drag-over');
            
            const type = e.dataTransfer.getData('text/plain');
            const targetMeta = NODE_TYPES[type];
            if (targetMeta && targetMeta.category !== 'trigger' && targetMeta.category !== 'end') {
                activeInsertEdgeId = edge.id;
                insertNode(type);
            } else {
                showToast('Không thể chèn sự kiện kích hoạt (Trigger) hoặc Kết thúc vào giữa sơ đồ.', 'error');
            }
        });
        
        connectionsSvg.appendChild(interactPath);
        flowCanvas.appendChild(connectorBtn);
    });
};
