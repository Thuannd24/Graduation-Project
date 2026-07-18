import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { buildFlowElements } from "./flow/flowLayout.js";
import WorkflowNode from "./flow/nodes/WorkflowNode.jsx";
import BranchTagNode from "./flow/nodes/BranchTagNode.jsx";
import MergeNode from "./flow/nodes/MergeNode.jsx";
import JunctionNode from "./flow/nodes/JunctionNode.jsx";
import InsertSlotNode from "./flow/nodes/InsertSlotNode.jsx";
import ForkArmEdge from "./flow/edges/ForkArmEdge.jsx";
import BranchRailEdge from "./flow/edges/BranchRailEdge.jsx";
import WorkflowEdge from "./flow/edges/WorkflowEdge.jsx";
import InsertPopover from "./canvas/InsertPopover.jsx";

const nodeTypes = {
  workflow: WorkflowNode,
  branchTag: BranchTagNode,
  merge: MergeNode,
  junction: JunctionNode,
  insertSlot: InsertSlotNode
};

const edgeTypes = {
  workflow: WorkflowEdge,
  forkArm: ForkArmEdge,
  branchRail: BranchRailEdge
};

function CanvasFlowInner({
  canvasRef,
  nodes: wfNodes,
  edges: wfEdges,
  selected,
  layout,
  layoutTick,
  insertEdgeId,
  dragType,
  errorNodeIds,
  clientErrorCount = 0,
  onCanvasClick,
  onSelectNode,
  onInsertNode,
  onInsertNodeAfterMerge,
  onCloseInsert,
  onSetInsertEdgeId
}) {
  const [pendingMergeInsert, setPendingMergeInsert] = useState(null);

  useEffect(() => {
    if (!insertEdgeId) setPendingMergeInsert(null);
  }, [insertEdgeId]);

  const onInsertClick = useCallback(
    (edgeId, mergeInsert) => {
      onSetInsertEdgeId(prev => (prev === edgeId ? null : edgeId));
      setPendingMergeInsert(mergeInsert || null);
    },
    [onSetInsertEdgeId]
  );

  const onInsertDrop = useCallback(
    (edgeId, type, mergeInsert) => {
      if (mergeInsert) onInsertNodeAfterMerge?.(mergeInsert.edgeIds, mergeInsert.downstreamId, type);
      else onInsertNode(edgeId, type);
    },
    [onInsertNode, onInsertNodeAfterMerge]
  );

  const built = useMemo(
    () =>
      buildFlowElements(wfNodes, wfEdges, layout, {
        selected,
        insertEdgeId,
        dragType
      }),
    [wfNodes, wfEdges, layout, selected, insertEdgeId, dragType, layoutTick]
  );

  const enrichedNodes = useMemo(
    () =>
      built.nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          edges: wfEdges,
          insertEdgeId,
          dragType,
          onInsertClick,
          onInsertDrop,
          hasError: n.type === "workflow" && errorNodeIds?.has(n.id)
        }
      })),
    [built.nodes, wfEdges, insertEdgeId, dragType, onInsertClick, onInsertDrop, errorNodeIds]
  );

  const enrichedEdges = useMemo(
    () =>
      built.edges.map(e => ({
        ...e,
        data: {
          ...e.data,
          insertEdgeId,
          dragType,
          onInsertClick,
          onInsertDrop
        }
      })),
    [built.edges, insertEdgeId, dragType, onInsertClick, onInsertDrop]
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(enrichedNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(enrichedEdges);

  const { fitView } = useReactFlow();

  useEffect(() => {
    setRfNodes(enrichedNodes);
    setRfEdges(enrichedEdges);
  }, [enrichedNodes, enrichedEdges, setRfNodes, setRfEdges]);

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 200 }), 80);
    return () => clearTimeout(t);
  }, [layoutTick, wfNodes, wfEdges, fitView]);

  const onNodeClick = useCallback(
    (_, node) => {
      if (node.type === "workflow") onSelectNode(node.id);
      else onCanvasClick();
    },
    [onSelectNode, onCanvasClick]
  );

  const onPaneClick = useCallback(() => onCanvasClick(), [onCanvasClick]);

  return (
    <div className={"cb-canvas-area cb-canvas-flow" + (dragType ? " cb-canvas-dragging" : "")} ref={canvasRef}>
      <div className="cb-canvas-header">
        <div>
          <h2>Bản vẽ quy trình</h2>
          <span className="cb-canvas-subtitle">
            Kéo khối vào nút <strong>+</strong> · <strong>Đúng</strong> trái · <strong>Sai</strong> phải
            {clientErrorCount > 0 && (
              <span className="cb-canvas-warn"> · {clientErrorCount} lỗi cấu hình</span>
            )}
          </span>
        </div>
      </div>

      <div className="cb-flow-react">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodeOrigin={[0.5, 0]}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnScroll
          minZoom={0.4}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 20, zoom: 0.85 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(99,102,241,0.15)" />
        </ReactFlow>

        {insertEdgeId && (
          <InsertPopover
            edgeId={insertEdgeId}
            edges={wfEdges}
            canvasRef={canvasRef}
            onClose={onCloseInsert}
            onPick={type => {
              if (pendingMergeInsert) onInsertNodeAfterMerge?.(pendingMergeInsert.edgeIds, pendingMergeInsert.downstreamId, type);
              else onInsertNode(insertEdgeId, type);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function CanvasFlow(props) {
  return (
    <ReactFlowProvider>
      <CanvasFlowInner {...props} />
    </ReactFlowProvider>
  );
}
