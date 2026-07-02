// Main entry and initialization for Campaign Builder

document.addEventListener('DOMContentLoaded', () => {
    // Initialize tabs and modals
    setupTabs();
    setupModals();
    setupAuth();
    
    // Initial draw of canvas and preview
    renderCanvas();
    updateJsonPreview();
    updateBpmnPreview();
    
    // Main button action listeners
    btnValidate.addEventListener('click', validateWorkflow);
    btnReset.addEventListener('click', resetCanvas);
    document.getElementById('btn-copy-json').addEventListener('click', copyJsonToClipboard);
    document.getElementById('btn-copy-bpmn').addEventListener('click', copyBpmnToClipboard);
    document.getElementById('btn-download-bpmn').addEventListener('click', downloadBpmn);
    document.getElementById('btn-auto-layout').addEventListener('click', () => {
        renderCanvas();
        showToast('Đã tự động căn chỉnh sơ đồ', 'success');
    });
    
    // Close popover when clicking outside
    document.addEventListener('click', (e) => {
        if (activePopoverEl && !activePopoverEl.contains(e.target) && !e.target.classList.contains('midpoint-connector')) {
            closeInsertPopover();
        }
    });
    
    // Re-draw SVG lines on window resize
    window.addEventListener('resize', () => {
        drawSVGLines();
    });

    // Setup drag-and-drop mechanics from sidebar catalog
    setupDragAndDrop();
});
