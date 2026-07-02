// Client-side BPMN XML Generator (Preview only - actual compilation on server)

window.generateBPMNXML = function() {
    const processKey = 'preview_workflow_' + Date.now();
    const processName = 'Workflow Preview';
    
    // Header
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions 
    xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    id="Definitions_${processKey}" 
    targetNamespace="http://bpmn.io/schema/bpmn" 
    exporter="CampaignBuilder" 
    exporterVersion="2.0">
    
  <bpmn:process id="${processKey}" name="${processName}" isExecutable="true">
`;

    // Generate nodes
    nodes.forEach(node => {
        xml += generateNodeXML(node);
    });
    
    // Generate sequence flows
    edges.forEach(edge => {
        xml += generateSequenceFlowXML(edge);
    });
    
    xml += `  </bpmn:process>
    
  <bpmndi:BPMNDiagram id="BPMNDiagram_${processKey}">
    <bpmndi:BPMNPlane id="BPMNPlane_${processKey}" bpmnElement="${processKey}">
`;

    // Generate visual elements
    nodes.forEach((node, index) => {
        xml += generateShapeXML(node, index);
    });
    
    edges.forEach(edge => {
        xml += generateEdgeXML(edge);
    });
    
    xml += `    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    return xml;
};

// Generate node XML based on type
function generateNodeXML(node) {
    const meta = NODE_TYPES[node.type];
    if (!meta) return '';
    
    const outgoing = edges.filter(e => e.source === node.id).map(e => `      <bpmn:outgoing>${e.id}</bpmn:outgoing>`).join('\n');
    const incoming = edges.filter(e => e.target === node.id).map(e => `      <bpmn:incoming>${e.id}</bpmn:incoming>`).join('\n');
    
    if (node.id === 'start') {
        // Start Event
        return `    <bpmn:startEvent id="${node.id}" name="${node.name}">
${outgoing}
    </bpmn:startEvent>
    
`;
    } else if (node.id === 'end') {
        // End Event
        return `    <bpmn:endEvent id="${node.id}" name="${node.name}">
${incoming}
    </bpmn:endEvent>
    
`;
    } else if (meta.category === 'condition') {
        // Exclusive Gateway
        return `    <bpmn:exclusiveGateway id="${node.id}" name="${node.name}">
${incoming}
${outgoing}
    </bpmn:exclusiveGateway>
    
`;
    } else {
        // Service Task (for actions)
        const delegateClass = getDelegateClass(node.type);
        return `    <bpmn:serviceTask id="${node.id}" name="${node.name}" camunda:delegateExpression="\${${delegateClass}}">
${incoming}
${outgoing}
      <bpmn:extensionElements>
        <camunda:inputOutput>
${generateCamundaProperties(node)}
        </camunda:inputOutput>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    
`;
    }
}

// Generate sequence flow XML
function generateSequenceFlowXML(edge) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const isFromCondition = sourceNode && NODE_TYPES[sourceNode.type]?.category === 'condition';
    
    let xml = `    <bpmn:sequenceFlow id="${edge.id}" sourceRef="${edge.source}" targetRef="${edge.target}"`;
    
    if (edge.isDefault) {
        xml += ` default="true"`;
    }
    
    xml += `>`;
    
    // Add condition expression for non-default flows from condition nodes
    if (isFromCondition && !edge.isDefault && edge.properties?.expression) {
        xml += `
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${escapeXml(edge.properties.expression)}</bpmn:conditionExpression>`;
    }
    
    xml += `
    </bpmn:sequenceFlow>
    
`;
    
    return xml;
}

// Generate Camunda properties for service tasks
function generateCamundaProperties(node) {
    let props = '';
    
    Object.entries(node.properties || {}).forEach(([key, value]) => {
        const xmlValue = escapeXml(String(value));
        props += `          <camunda:inputParameter name="${key}">${xmlValue}</camunda:inputParameter>\n`;
    });
    
    return props;
}

// Get delegate class name based on node type
function getDelegateClass(nodeType) {
    const delegateMap = {
        'Action_IssueVoucher_Percent': 'issueVoucherPercentDelegate',
        'Action_IssueVoucher_Fixed': 'issueVoucherFixedDelegate',
        'Action_IssueVoucher_Freeship': 'issueVoucherFreeshippingDelegate',
        'Action_Upgrade_MemberRank': 'upgradeMemberRankDelegate',
        'Action_Loyalty_Point': 'loyaltyPointDelegate',
        'Action_Send_Email': 'sendNotificationDelegate',
        'Action_Send_SMS': 'smsDelegate'
    };
    
    return delegateMap[nodeType] || 'defaultDelegate';
}

// Generate shape XML for diagram
function generateShapeXML(node, index) {
    const x = 100 + (index % 3) * 200;
    const y = 100 + Math.floor(index / 3) * 150;
    const meta = NODE_TYPES[node.type];
    
    if (node.id === 'start' || node.id === 'end') {
        // Circle shape
        return `      <bpmndi:BPMNShape id="Shape_${node.id}" bpmnElement="${node.id}">
        <dc:Bounds x="${x}" y="${y}" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${x - 10}" y="${y + 40}" width="56" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      
`;
    } else if (meta?.category === 'condition') {
        // Diamond shape
        return `      <bpmndi:BPMNShape id="Shape_${node.id}" bpmnElement="${node.id}" isMarkerVisible="true">
        <dc:Bounds x="${x}" y="${y}" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${x - 20}" y="${y + 55}" width="90" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      
`;
    } else {
        // Rectangle shape
        return `      <bpmndi:BPMNShape id="Shape_${node.id}" bpmnElement="${node.id}">
        <dc:Bounds x="${x}" y="${y}" width="100" height="80" />
      </bpmndi:BPMNShape>
      
`;
    }
}

// Generate edge XML for diagram
function generateEdgeXML(edge) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    const sourceIndex = nodes.indexOf(sourceNode);
    const targetIndex = nodes.indexOf(targetNode);
    
    const x1 = 100 + (sourceIndex % 3) * 200 + 50;
    const y1 = 100 + Math.floor(sourceIndex / 3) * 150 + 40;
    const x2 = 100 + (targetIndex % 3) * 200 + 50;
    const y2 = 100 + Math.floor(targetIndex / 3) * 150;
    
    return `      <bpmndi:BPMNEdge id="Edge_${edge.id}" bpmnElement="${edge.id}">
        <di:waypoint x="${x1}" y="${y1}" />
        <di:waypoint x="${x2}" y="${y2}" />
      </bpmndi:BPMNEdge>
      
`;
}

// Escape XML special characters
function escapeXml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// Update BPMN preview in UI
window.updateBpmnPreview = function() {
    const bpmnPreview = document.getElementById('bpmn-preview');
    if (!bpmnPreview) return;
    
    try {
        const xml = generateBPMNXML();
        bpmnPreview.textContent = formatXML(xml);
    } catch (error) {
        console.error('Error generating BPMN XML:', error);
        bpmnPreview.textContent = `<!-- Error generating BPMN XML: ${error.message} -->`;
    }
};

// Format XML with indentation
function formatXML(xml) {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    let formatted = '';
    let pad = 0;
    
    xml = xml.replace(reg, '$1\n$2$3');
    
    xml.split('\n').forEach(line => {
        let indent = 0;
        if (line.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (line.match(/^<\/\w/)) {
            if (pad !== 0) {
                pad -= 1;
            }
        } else if (line.match(/^<\w([^>]*[^\/])?>.*$/)) {
            indent = 1;
        } else {
            indent = 0;
        }
        
        formatted += PADDING.repeat(pad) + line + '\n';
        pad += indent;
    });
    
    return formatted.trim();
}

// Copy BPMN to clipboard
window.copyBpmnToClipboard = function() {
    const bpmnPreview = document.getElementById('bpmn-preview');
    if (!bpmnPreview) return;
    
    navigator.clipboard.writeText(bpmnPreview.textContent)
        .then(() => showToast('Đã sao chép BPMN XML vào bộ nhớ đệm.', 'success'))
        .catch(() => showToast('Không thể sao chép.', 'error'));
};

// Download BPMN as .bpmn file
window.downloadBpmn = function() {
    try {
        const xml = generateBPMNXML();
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow_${Date.now()}.bpmn`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Đã tải xuống file BPMN thành công!', 'success');
    } catch (error) {
        console.error('Error downloading BPMN:', error);
        showToast('Lỗi khi tải xuống BPMN.', 'error');
    }
};
