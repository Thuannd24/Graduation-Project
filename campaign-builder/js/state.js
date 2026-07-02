// Global State variables for the campaign builder
var nodes = [
    { id: 'start', name: 'Bắt đầu', type: 'Trigger_Event_NewUser', properties: {} },
    { id: 'end', name: 'Kết thúc', type: 'End_Event', properties: {} }
];

var edges = [
    { id: 'edge_start_to_end', source: 'start', target: 'end', isDefault: false, properties: {} }
];

var selectedNodeId = null;
var nodeCounter = 1;
var activeInsertEdgeId = null;
var activePopoverEl = null;

// Reset canvas to default state
window.resetCanvas = function() {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ sơ đồ hiện tại và đặt lại về mặc định?')) {
        nodes = [
            { id: 'start', name: 'Bắt đầu', type: 'Trigger_Event_NewUser', properties: {} },
            { id: 'end', name: 'Kết thúc', type: 'End_Event', properties: {} }
        ];
        edges = [
            { id: 'edge_start_to_end', source: 'start', target: 'end', isDefault: false, properties: {} }
        ];
        selectedNodeId = null;
        nodeCounter = 1;
        
        closeInsertPopover();
        clearPropertyEditor();
        renderCanvas();
        updateJsonPreview();
        showToast('Đã khôi phục sơ đồ về trạng thái mặc định.', 'success');
    }
};

// Close popover
window.closeInsertPopover = function() {
    if (activePopoverEl) {
        activePopoverEl.remove();
        activePopoverEl = null;
    }
    activeInsertEdgeId = null;
};
