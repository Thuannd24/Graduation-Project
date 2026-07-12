import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { campaignApi } from "../../../../services/campaignApi.ts";
import "../campaign-builder.css";

import { NODE_TYPES, DEFAULT_NODES, DEFAULT_EDGES } from "./constants.js";
import { clone, buildGraphPayload, parseStoredWorkflow } from "./utils/graph.js";
import { findClientValidationErrors, mergeValidationResults, getErrorNodeIds } from "./utils/clientValidation.js";
import { generateBPMNXML, formatXML } from "./utils/bpmn.js";
import useToast from "./hooks/useToast.js";
import useWorkflow from "./hooks/useWorkflow.js";
import useCampaigns from "./hooks/useCampaigns.js";
import useLookupData from "./hooks/useLookupData.js";

import Toast from "./Toast.jsx";
import Toolbox from "./Toolbox.jsx";
import CanvasFlow from "./CanvasFlow.jsx";
import PropertyPanel from "./PropertyPanel.jsx";
import BottomPanel from "./BottomPanel.jsx";
import CampaignsList from "./CampaignsList.jsx";
import DeployModal from "./DeployModal.jsx";
import CampaignBudgetBar from "./CampaignBudgetBar.jsx";
import EvaluateModal from "./EvaluateModal.jsx";

const EMPTY_DEPLOY_FORM = { name: "", startDate: "", endDate: "" };
const EMPTY_EVAL_FORM   = { processKey: "", campaignName: "", userId: "", location: "", categories: "", products: "", raw: "{}" };

// Orchestrator for the whole campaign builder screen. Owns the "list vs
// editor" view switch, cross-cutting state (deploy/eval modals, validation,
// which campaign is being edited) and wires together the three specialised
// hooks (toast / workflow / campaigns) with the presentational components.
export default function CampaignsTab() {
  // ── High-level view state ──────────────────────────────────────────────────
  const [view, setView] = useState("list");           // "list" | "editor"
  const [editingId, setEditingId] = useState(null);
  const [bottomTab, setBottomTab] = useState("validation");
  const [dragType, setDragType] = useState(null);
  const [layoutTick, setLayoutTick] = useState(0);

  // ── Validation state ───────────────────────────────────────────────────────
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showDeploy, setShowDeploy] = useState(false);
  const [deployForm, setDeployForm] = useState(EMPTY_DEPLOY_FORM);
  const [showEvaluate, setShowEvaluate] = useState(false);
  const [evalForm, setEvalForm] = useState(EMPTY_EVAL_FORM);
  const [evalResult, setEvalResult] = useState(null);

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const canvasRef = useRef(null);
  const { toast, showToast } = useToast();
  const wf = useWorkflow(showToast);
  const {
    campaigns, loading, fetchCampaigns, toggleActive, removeCampaign
  } = useCampaigns(showToast);
  const lookup = useLookupData();

  // Delete-key removes the currently selected node.
  useEffect(() => {
    const handler = e => {
      if (e.key === "Delete" && wf.selected && wf.selected !== "start" && wf.selected !== "end") {
        wf.deleteNode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [wf]);

  // ── Memoised previews ──────────────────────────────────────────────────────
  const jsonPreview = useMemo(
    () => JSON.stringify(buildGraphPayload(wf.nodes, wf.edges, wf.meta), null, 2),
    [wf.nodes, wf.edges, wf.meta]
  );
  const bpmnPreview = useMemo(
    () => formatXML(generateBPMNXML(wf.nodes, wf.edges)),
    [wf.nodes, wf.edges]
  );

  const clientErrorsLive = useMemo(
    () => findClientValidationErrors(wf.nodes, wf.edges, wf.meta),
    [wf.nodes, wf.edges, wf.meta]
  );
  const errorNodeIds = useMemo(() => {
    const ids = getErrorNodeIds(validationResult?.errors);
    clientErrorsLive.forEach(e => { if (e.nodeId) ids.add(e.nodeId); });
    return ids;
  }, [validationResult, clientErrorsLive]);

  const selectedNodeErrors = useMemo(() => {
    if (!wf.selected) return [];
    const merged = mergeValidationResults(clientErrorsLive, validationResult || { valid: true, errors: [] });
    return (merged.errors || []).filter(e => e.nodeId === wf.selected);
  }, [wf.selected, clientErrorsLive, validationResult]);

  // ── Editor → List transitions ──────────────────────────────────────────────
  const openNewCampaign = () => {
    setEditingId(null);
    wf.resetWorkflow();
    setValidationResult(null);
    setDeployForm(EMPTY_DEPLOY_FORM);
    setView("editor");
  };

  const backToList = () => {
    setView("list");
    setEditingId(null);
    fetchCampaigns();
  };

  const resetCanvas = () => {
    if (!window.confirm("Đặt lại sơ đồ về mặc định?")) return;
    wf.resetWorkflow();
    setEditingId(null);
    setValidationResult(null);
    setBottomTab("validation");
    showToast("Đã đặt lại sơ đồ", "info");
  };

  // ── API operations ─────────────────────────────────────────────────────────
  const validateWorkflow = useCallback(async () => {
    try {
      setValidating(true);
      setBottomTab("validation");
      const clientErrors = findClientValidationErrors(wf.nodes, wf.edges, wf.meta);
      let serverResult = { valid: true, errors: [], summary: "" };
      try {
        const payload = buildGraphPayload(wf.nodes, wf.edges, wf.meta);
        const result = await campaignApi.validateWorkflow(payload);
        serverResult = result && typeof result.valid === "boolean"
          ? result
          : { valid: false, summary: "Phản hồi validate không hợp lệ", errors: [] };
      } catch (err) {
        serverResult = {
          valid: false,
          summary: err.message,
          errors: [{ message: `Server: ${err.message}`, errorType: "server_error" }]
        };
      }
      const merged = mergeValidationResults(clientErrors, serverResult);
      setValidationResult(merged);
      showToast(
        merged.valid ? "Cấu hình hợp lệ" : `${merged.errors.length} lỗi cần sửa`,
        merged.valid ? "success" : "error"
      );
    } catch (err) {
      setValidationResult({ valid: false, summary: err.message, errors: [{ message: err.message }] });
      showToast("Lỗi: " + err.message, "error");
    } finally {
      setValidating(false);
    }
  }, [showToast, wf.nodes, wf.edges, wf.meta]);

  const openDeployModal = () => {
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + 30);
    setDeployForm(prev => ({
      name: prev.name || "",
      startDate: prev.startDate || now.toISOString().slice(0, 16),
      endDate:   prev.endDate   || future.toISOString().slice(0, 16)
    }));
    setShowDeploy(true);
  };

  const submitDeploy = async e => {
    e.preventDefault();
    const clientErrors = findClientValidationErrors(wf.nodes, wf.edges, wf.meta);
    if (clientErrors.length) {
      showToast(`${clientErrors.length} lỗi — xem tab Validation`, "error");
      setBottomTab("validation");
      setValidationResult(mergeValidationResults(clientErrors, { valid: false, errors: [] }));
      return;
    }
    try {
      const payload = buildGraphPayload(wf.nodes, wf.edges, wf.meta);
      const dto = {
        name: deployForm.name.trim(),
        totalBudget: payload.meta?.totalBudget ?? 0,
        startDate: new Date(deployForm.startDate).toISOString(),
        endDate:   new Date(deployForm.endDate).toISOString(),
        active: true,
        workflowJson: JSON.stringify(payload)
      };
      if (editingId) {
        await campaignApi.updateCampaign(editingId, dto);
        showToast("Cập nhật chiến dịch thành công", "success");
      } else {
        await campaignApi.createCampaign(dto);
        showToast("Triển khai chiến dịch thành công", "success");
      }
      setShowDeploy(false);
      setEditingId(null);
      await fetchCampaigns();
      setView("list");
    } catch (err) {
      showToast("Lỗi: " + err.message, "error");
    }
  };

  const loadForEdit = useCallback(async camp => {
    try {
      const detail = await campaignApi.getCampaign(camp.id);
      if (detail && detail.workflowJson) {
        const graph = JSON.parse(detail.workflowJson);
        const parsed = parseStoredWorkflow(graph);
        wf.loadWorkflow(parsed.nodes, parsed.edges, parsed.meta);
        if (!parsed.meta.totalBudget && detail.totalBudget) {
          wf.updateMeta({ totalBudget: String(detail.totalBudget) });
        }
      } else {
        wf.loadWorkflow(clone(DEFAULT_NODES), clone(DEFAULT_EDGES));
      }
      setEditingId(camp.id);
      setValidationResult(null);
      setDeployForm({
        name: camp.name || "",
        startDate: camp.startDate ? new Date(camp.startDate).toISOString().slice(0, 16) : "",
        endDate:   camp.endDate   ? new Date(camp.endDate).toISOString().slice(0, 16)   : ""
      });
      setView("editor");
      showToast("Đã tải chiến dịch để chỉnh sửa", "info");
    } catch (err) {
      showToast("Lỗi tải chiến dịch: " + err.message, "error");
    }
  }, [showToast, wf]);

  const openEvaluateModal = camp => {
    setEvalForm({
      ...EMPTY_EVAL_FORM,
      processKey: camp.bpmnProcessDefinitionKey || "",
      campaignName: camp.name || ""
    });
    setEvalResult(null);
    setShowEvaluate(true);
  };

  const runEvaluate = async e => {
    e.preventDefault();
    let vars = {};
    if (evalForm.userId)     vars.userId = evalForm.userId;
    if (evalForm.location)   vars.location = evalForm.location;
    if (evalForm.categories) vars.categories = evalForm.categories.split(",").map(s => s.trim()).filter(Boolean);
    if (evalForm.products)   vars.products   = evalForm.products.split(",").map(s => s.trim()).filter(Boolean);
    try {
      const raw = evalForm.raw.trim();
      if (raw) vars = { ...vars, ...JSON.parse(raw) };
    } catch {
      showToast("JSON biến bổ sung không hợp lệ", "error");
      return;
    }
    try {
      const res = await campaignApi.evaluateCampaign(evalForm.processKey, vars);
      setEvalResult(res);
      showToast("Chạy giả lập hoàn tất", "success");
    } catch (err) {
      setEvalResult({ error: err.message });
      showToast("Lỗi giả lập: " + err.message, "error");
    }
  };

  const copyText = (txt, label) => {
    navigator.clipboard.writeText(txt)
      .then(() => showToast("Đã sao chép " + label, "success"))
      .catch(() => showToast("Không thể sao chép", "error"));
  };

  const downloadBpmn = () => {
    const blob = new Blob([bpmnPreview], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow_" + Date.now() + ".bpmn";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Đã tải xuống BPMN", "success");
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //                              LIST VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "list") {
    return (
      <div className="cb-app">
        <Toast toast={toast} />
        <header className="cb-header">
          <div className="cb-logo">
            <div className="cb-logo-icon">CE</div>
            <div>
              <h1>CampaignEngine</h1>
              <span>Trình Thiết Kế Chiến Dịch Tiếp Thị Tự Động</span>
            </div>
          </div>
          <div className="cb-header-actions">
            <button className="cb-btn cb-btn-primary" onClick={openNewCampaign}>
              Tạo chiến dịch mới
            </button>
          </div>
        </header>

        <div style={{ overflow: "auto", padding: 16 }}>
          <CampaignsList
            loading={loading}
            campaigns={campaigns}
            onEdit={loadForEdit}
            onToggleActive={toggleActive}
            onEvaluate={openEvaluateModal}
            onDelete={removeCampaign}
          />
        </div>

        <EvaluateModal
          open={showEvaluate}
          form={evalForm}
          result={evalResult}
          onChangeForm={setEvalForm}
          onClose={() => setShowEvaluate(false)}
          onSubmit={runEvaluate}
          lookup={lookup}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                             EDITOR VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="cb-app">
      <Toast toast={toast} />

      <header className="cb-header">
        <div className="cb-logo">
          <div className="cb-logo-icon">CE</div>
          <div>
            <h1>CampaignEngine</h1>
            <span>
              {editingId
                ? "Chỉnh sửa chiến dịch #" + editingId
                : "Trình Thiết Kế Chiến Dịch Tiếp Thị Tự Động"}
            </span>
          </div>
        </div>
        <div className="cb-header-actions">
          <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={backToList}>Danh sách</button>
          <button
            className="cb-btn cb-btn-secondary cb-btn-sm"
            onClick={() => { setLayoutTick(t => t + 1); showToast("Đã căn chỉnh sơ đồ", "success"); }}
          >
            Căn chỉnh
          </button>
          <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={validateWorkflow}>
            Kiểm tra sơ đồ
          </button>
          <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={openDeployModal}>
            {editingId ? "Cập nhật" : "Triển khai"}
          </button>
          <button className="cb-btn cb-btn-danger cb-btn-sm" onClick={resetCanvas}>Đặt lại</button>
        </div>
      </header>

      <CampaignBudgetBar
        nodes={wf.nodes}
        meta={wf.meta}
        onChangeMeta={wf.updateMeta}
      />

      <div className="cb-main-layout">
        <Toolbox
          onQuickAdd={wf.addNodeAtEnd}
          onDragStart={setDragType}
          onDragEnd={() => setDragType(null)}
        />

        <CanvasFlow
          canvasRef={canvasRef}
          nodes={wf.nodes}
          edges={wf.edges}
          selected={wf.selected}
          layout={wf.layout}
          layoutTick={layoutTick}
          insertEdgeId={wf.insertEdgeId}
          dragType={dragType}
          errorNodeIds={errorNodeIds}
          clientErrorCount={clientErrorsLive.length}
          onCanvasClick={() => { wf.setSelected(null); wf.setInsertEdgeId(null); }}
          onCanvasDrop={e => {
            e.preventDefault();
            if (!dragType) return;
            const meta = NODE_TYPES[dragType];
            if (!meta || meta.cat === "trigger") {
              showToast("Thả vào nút + trên đường nối, không thả trực tiếp lên canvas", "error");
              return;
            }
            wf.addNodeAtEnd(dragType);
          }}
          onSelectNode={id => { wf.setSelected(id); wf.setInsertEdgeId(null); }}
          onInsertNode={wf.insertNodeIntoEdge}
          onChangeTriggerType={wf.changeTriggerType}
          onRenameNode={wf.updateNodeName}
          onCloseInsert={() => wf.setInsertEdgeId(null)}
          onSetInsertEdgeId={wf.setInsertEdgeId}
          showToast={showToast}
        />

        <PropertyPanel
          selectedNode={wf.selectedNode}
          nodeErrors={selectedNodeErrors}
          nodes={wf.nodes}
          edges={wf.edges}
          onDeleteNode={wf.deleteNode}
          onChangeTriggerType={wf.changeTriggerType}
          onUpdateProp={wf.updateNodeProp}
          onUpdateProps={wf.updateNodeProps}
          onUpdateName={name => wf.updateNodeName(name)}
          onUpdateEdgeExpr={wf.updateEdgeExpr}
          onAddBranch={wf.addBranch}
          onDeleteBranch={wf.deleteBranch}
          lookup={lookup}
        />
      </div>

      <BottomPanel
        activeTab={bottomTab}
        onChangeTab={tab => {
          setBottomTab(tab);
          if (tab === "campaigns") fetchCampaigns();
        }}
        validating={validating}
        validationResult={validationResult}
        onSelectErrorNode={id => { wf.setSelected(id); wf.setInsertEdgeId(null); }}
        editingId={editingId}
        jsonPreview={jsonPreview}
        bpmnPreview={bpmnPreview}
        campaigns={campaigns}
        loading={loading}
        onOpenDeploy={openDeployModal}
        onCopy={copyText}
        onDownloadBpmn={downloadBpmn}
        onEdit={loadForEdit}
        onToggleActive={toggleActive}
        onEvaluate={openEvaluateModal}
        onDelete={removeCampaign}
      />

      <DeployModal
        open={showDeploy}
        editingId={editingId}
        form={deployForm}
        onChangeForm={setDeployForm}
        onClose={() => setShowDeploy(false)}
        onSubmit={submitDeploy}
      />

      <EvaluateModal
        open={showEvaluate}
        form={evalForm}
        result={evalResult}
        onChangeForm={setEvalForm}
        onClose={() => setShowEvaluate(false)}
        onSubmit={runEvaluate}
        lookup={lookup}
      />
    </div>
  );
}
