import React, { useEffect, useMemo, useState } from "react";
import { NODE_TYPES } from "./constants.js";
import { getNodeCategoryLabel, getNodeSummary } from "./utils/nodeDisplay.js";
import { getConditionBranchSummary } from "./utils/branchDisplay.js";
import { BRANCH_COL, isEmptyWorkflow } from "./utils/edgeRouting.js";
import CanvasSVG from "./canvas/CanvasSVG.jsx";
import CanvasMidpoints from "./canvas/CanvasMidpoints.jsx";
import ConditionBranchRow from "./canvas/ConditionBranchRow.jsx";
import ConditionMergeRow from "./canvas/ConditionMergeRow.jsx";
import { conditionHasBranchContent, getConditionMergePlacements } from "./utils/edgeDraw.js";
import DropZone from "./canvas/DropZone.jsx";
import InsertPopover from "./canvas/InsertPopover.jsx";

const COL_SLOTS = [
  { key: "left", col: -BRANCH_COL },
  { key: "center", col: 0 },
  { key: "right", col: BRANCH_COL }
];

export default function Canvas({
  canvasRef,
  nodes,
  edges,
  selected,
  layout,
  layoutTick,
  insertEdgeId,
  dragType,
  onCanvasClick,
  onCanvasDrop,
  onSelectNode,
  onInsertNode,
  onChangeTriggerType,
  onRenameNode,
  onCloseInsert,
  onSetInsertEdgeId,
  showToast
}) {
  const { levels, columns } = layout;
  const maxLvl = Math.max(...Object.values(levels), 0);

  const rows = useMemo(() => {
    const r = Array.from({ length: maxLvl + 1 }, () => []);
    nodes.forEach(n => {
      const l = levels[n.id] ?? 0;
      r[l].push(n);
    });
    return r;
  }, [nodes, levels, maxLvl]);

  const [canvasVersion, setCanvasVersion] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setCanvasVersion(v => v + 1), 60);
    return () => clearTimeout(id);
  }, [nodes, edges, layoutTick, columns, dragType]);

  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const isEmpty = isEmptyWorkflow(nodes, edges);
  const startEdge = edges.find(e => e.source === "start" && e.target === "end");
  const mergePlacements = useMemo(
    () => getConditionMergePlacements(nodes, edges, levels, columns),
    [nodes, edges, levels, columns]
  );

  const commitRename = id => {
    onRenameNode(id, renameValue);
    setRenamingId(null);
  };

  const renderNodeBody = node => {
    if (node.id === "start") {
      return <span className="cb-shape-line cb-shape-line-strong">Trigger</span>;
    }
    if (node.id === "end") {
      return <span className="cb-shape-line cb-shape-line-strong">Kết thúc</span>;
    }

    const category = getNodeCategoryLabel(node.type);
    const summary = getNodeSummary(node);
    const title = node.name || category;

    if (NODE_TYPES[node.type]?.cat === "condition") {
      const branchSummary = getConditionBranchSummary(node, edges);
      return (
        <>
          <span className="cb-shape-line cb-shape-line-strong">{title}</span>
          <span className="cb-shape-line cb-shape-line-sub">
            {branchSummary || "Chưa chọn điều kiện nào."}
          </span>
        </>
      );
    }

    return (
      <>
        <span className="cb-shape-line cb-shape-line-strong">{title}</span>
        {summary && <span className="cb-shape-line cb-shape-line-sub">{summary}</span>}
      </>
    );
  };

  const renderNode = node => {
    const meta = NODE_TYPES[node.type];
    const isSel = selected === node.id;
    const isRen = renamingId === node.id;
    const isCondition = meta?.cat === "condition";
    const shapeClass = node.id === "start"
      ? "cb-shape-start"
      : node.id === "end"
        ? "cb-shape-end"
        : isCondition
          ? "cb-shape-block cb-shape-condition"
          : "cb-shape-block cb-shape-action";

    return (
      <div
        key={node.id}
        className={"cb-grid-slot" + (isCondition ? " cb-grid-slot-condition" : "")}
      >
        <div
          className="cb-node-wrapper"
          onClick={e => { e.stopPropagation(); onSelectNode(node.id); }}
        >
          {isRen ? (
            <input
              type="text"
              autoFocus
              className="cb-rename-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => commitRename(node.id)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename(node.id);
                if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <div
              id={"cb-node-" + node.id}
              className={`${shapeClass}${isSel ? " selected" : ""}`}
              onDoubleClick={() => {
                if (node.id === "start" || node.id === "end") return;
                setRenamingId(node.id);
                setRenameValue(node.name);
              }}
              onDragOver={node.id === "start" ? e => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); } : undefined}
              onDragLeave={node.id === "start" ? e => { e.currentTarget.classList.remove("drag-over"); } : undefined}
              onDrop={node.id === "start" ? e => {
                e.preventDefault();
                e.currentTarget.classList.remove("drag-over");
                const t = e.dataTransfer.getData("text/plain");
                const m = NODE_TYPES[t];
                if (m && m.cat === "trigger") onChangeTriggerType(t);
                else showToast("Chỉ thả Trigger vào nút bắt đầu", "error");
              } : undefined}
            >
              {renderNodeBody(node)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={"cb-canvas-area" + (dragType ? " cb-canvas-dragging" : "")}
      onDragOver={e => e.preventDefault()}
      onDrop={onCanvasDrop}
      onClick={() => { onCanvasClick(); setRenamingId(null); }}
    >
      <div className="cb-canvas-header">
        <div>
          <h2>Bản vẽ quy trình</h2>
          <span className="cb-canvas-subtitle">
            Kéo khối vào ô <strong>+</strong> nét đứt trên nhánh được phép. <strong>Đúng</strong> trái · <strong>Sai</strong> phải.
          </span>
        </div>
      </div>

      <div className="cb-flow-canvas" ref={canvasRef}>
        <CanvasSVG
          nodes={nodes}
          edges={edges}
          columns={columns}
          canvasRef={canvasRef}
          version={canvasVersion}
          insertEdge={onInsertNode}
        />

        <CanvasMidpoints
          nodes={nodes}
          edges={edges}
          columns={columns}
          canvasRef={canvasRef}
          version={canvasVersion}
          setInsertEdgeId={onSetInsertEdgeId}
          insertNode={onInsertNode}
        />

        {insertEdgeId && (
          <InsertPopover
            edgeId={insertEdgeId}
            edges={edges}
            canvasRef={canvasRef}
            onClose={onCloseInsert}
            onPick={type => onInsertNode(insertEdgeId, type)}
          />
        )}

        {rows.map((rowNodes, lvl) => {
          const conditionNodesInRow = rowNodes.filter(
            n => NODE_TYPES[n.type]?.cat === "condition"
          );

          return (
            <React.Fragment key={"row_" + lvl}>
              <div className="cb-flow-row-wide" data-level={lvl}>
                {COL_SLOTS.map(({ key, col }) => {
                  const node = rowNodes.find(n => (columns[n.id] ?? 0) === col);
                  return (
                    <div key={key} className={`cb-col cb-col-${key}`}>
                      {node ? renderNode(node) : <div className="cb-col-empty" />}
                    </div>
                  );
                })}
              </div>

              {isEmpty && lvl === 0 && startEdge && (
                <div className="cb-flow-row-wide cb-drop-row">
                  <div className="cb-col cb-col-left" />
                  <div className="cb-col cb-col-center">
                    <DropZone
                      edgeId={startEdge.id}
                      label="Kéo item đầu tiên vào đây"
                      dragType={dragType}
                      insertEdgeId={insertEdgeId}
                      setInsertEdgeId={onSetInsertEdgeId}
                      insertNode={onInsertNode}
                    />
                  </div>
                  <div className="cb-col cb-col-right" />
                </div>
              )}

              {conditionNodesInRow.map(condNode => (
                <React.Fragment key={`branches_${condNode.id}`}>
                  <ConditionBranchRow
                    conditionId={condNode.id}
                    nodes={nodes}
                    edges={edges}
                    columns={columns}
                    dragType={dragType}
                    insertEdgeId={insertEdgeId}
                    setInsertEdgeId={onSetInsertEdgeId}
                    insertNode={onInsertNode}
                  />
                  {!conditionHasBranchContent(condNode.id, edges, nodes, columns) && (
                    <ConditionMergeRow conditionId={condNode.id} columns={columns} />
                  )}
                </React.Fragment>
              ))}

              {(mergePlacements[lvl] || []).map(cId => (
                <ConditionMergeRow key={`merge_${cId}`} conditionId={cId} columns={columns} />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
