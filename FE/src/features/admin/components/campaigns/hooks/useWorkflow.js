import { useCallback, useMemo, useState } from "react";
import { NODE_TYPES, DEFAULT_NODES, DEFAULT_EDGES } from "../constants.js";
import { clone, computeLayout, normalizeWorkflow, findMainEdgeToEnd } from "../utils/graph.js";
import { bridgeAfterDelete, ensureConditionBranches, dedupeEdges } from "../utils/graphNormalize.js";
import { buildBranchProps, createDefaultBranchProps } from "../utils/expression.js";
import { nextCounter } from "../nodeCounter.js";

const DEFAULT_META = { totalBudget: "" };

// Encapsulates the whole editor workflow state — nodes, edges, selection and
// every mutation the UI can perform on them. The parent decides how to load
// data (via `setNodes` / `setEdges`) and pipes user feedback through `showToast`.
export default function useWorkflow(showToast) {
  const [nodes, setNodes] = useState(DEFAULT_NODES);
  const [edges, setEdges] = useState(DEFAULT_EDGES);
  const [meta, setMeta] = useState(() => clone(DEFAULT_META));
  const [selected, setSelected] = useState(null);
  const [insertEdgeId, setInsertEdgeId] = useState(null);

  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selected) || null,
    [nodes, selected]
  );

  const insertNodeIntoEdge = useCallback((edgeId, type, forcedId) => {
    const meta = NODE_TYPES[type];
    if (!meta || meta.cat === "trigger") {
      showToast("Không thể chèn Trigger vào giữa sơ đồ", "error");
      return;
    }
    const edgeIdx = edges.findIndex(e => e.id === edgeId);
    if (edgeIdx === -1) return;
    const target = edges[edgeIdx];
    const id = forcedId || ("n_" + Date.now() + "_" + nextCounter());
    const properties = clone(meta.def || {});

    setNodes(prev => {
      const endNode = prev.find(n => n.id === "end");
      const others  = prev.filter(n => n.id !== "end");
      return [...others, { id, name: meta.name, type, properties }, endNode];
    });

    setEdges(prev => {
      const next = [...prev];
      next.splice(edgeIdx, 1);
      if (meta.cat === "condition") {
        const ifProps = createDefaultBranchProps(type);
        const downstream = target.target;
        next.push({
          id: "edge_" + target.source + "_to_" + id,
          source: target.source, target: id,
          isDefault: target.isDefault, properties: clone(target.properties || {})
        });
        next.push({
          id: "edge_" + id + "_to_end_default",
          source: id, target: "end",
          isDefault: true, properties: {}
        });
        next.push({
          id: "edge_" + id + "_to_" + downstream + "_if",
          source: id, target: downstream,
          isDefault: false, properties: clone(ifProps)
        });
      } else {
        next.push({
          id: "edge_" + target.source + "_to_" + id,
          source: target.source, target: id,
          isDefault: target.isDefault, properties: clone(target.properties || {})
        });
        next.push({
          id: "edge_" + id + "_to_" + target.target,
          source: id, target: target.target,
          isDefault: false, properties: {}
        });
      }
      const endNode = { id: "end", name: "Kết thúc", type: "End_Event", properties: {} };
      const draftNodes = [...nodes.filter(n => n.id !== "end"), { id, name: meta.name, type, properties }, endNode];
      return ensureConditionBranches(draftNodes, dedupeEdges(next));
    });

    setSelected(id);
    setInsertEdgeId(null);
    showToast("Đã chèn khối: " + meta.name, "success");
  }, [edges, nodes, showToast]);

  const addNodeAtEnd = useCallback(type => {
    const meta = NODE_TYPES[type];
    if (!meta) return;
    if (meta.cat === "trigger") {
      showToast("Không thể chèn Trigger vào giữa sơ đồ", "error");
      return;
    }
    const endEdge = findMainEdgeToEnd(edges);
    if (!endEdge) {
      showToast("Không tìm thấy vị trí chèn — hãy thả vào nút + trên đường nối", "error");
      return;
    }
    insertNodeIntoEdge(endEdge.id, type);
  }, [edges, insertNodeIntoEdge, showToast]);

  const deleteNode = useCallback(() => {
    if (!selected || selected === "start" || selected === "end") return;
    const nextNodes = nodes.filter(n => n.id !== selected);
    const nextEdges = bridgeAfterDelete(edges, nodes, selected);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelected(null);
    showToast("Đã xóa khối", "info");
  }, [edges, nodes, selected, showToast]);

  const addBranch = useCallback(nodeId => {
    const condNode = nodes.find(n => n.id === nodeId);
    if (!condNode) return;
    const defEdge = edges.find(e => e.source === nodeId && e.isDefault);
    const target  = defEdge ? defEdge.target : "end";
    const t = condNode.type;

    const used = new Set();
    edges
      .filter(e => e.source === nodeId && !e.isDefault)
      .forEach(e => {
        if (t === "Condition_MemberRank" && e.properties?.expression) {
          const m = e.properties.expression.match(/==\s*['"]([^'"]+)['"]/);
          if (m) used.add(m[1]);
        }
      });

    let branchParams = {};
    if (t === "Condition_MemberRank") {
      const rks = ["VIP", "GOLD", "SILVER", "MEMBER"];
      branchParams = { rank: rks.find(r => !used.has(r)) || "SILVER" };
    } else if (t === "Condition_TotalSpending") {
      branchParams = { operator: ">=", amount: 10000000 };
    } else if (t === "Condition_Location") {
      branchParams = { value: "Danang" };
    } else if (t === "Condition_ContainsCategory") {
      branchParams = { value: "new_cat" };
    } else if (t === "Condition_ContainsProduct") {
      branchParams = { value: "new_prod" };
    }

    setEdges(prev => [...prev, {
      id: "edge_" + nodeId + "_to_" + target + "_br" + nextCounter(),
      source: nodeId, target,
      isDefault: false,
      properties: buildBranchProps(t, branchParams)
    }]);
    showToast("Đã thêm nhánh IF mới", "info");
  }, [edges, nodes, showToast]);

  const deleteBranch = useCallback(edgeId => {
    const e = edges.find(x => x.id === edgeId);
    if (!e) return;
    if (e.isDefault) {
      showToast("Không thể xóa nhánh Else (mặc định)", "error");
      return;
    }
    const ifCount = edges.filter(x => x.source === e.source && !x.isDefault).length;
    if (ifCount <= 1) {
      showToast("Condition gateway cần ít nhất 1 nhánh IF (ngoài Else)", "error");
      return;
    }
    setEdges(prev => prev.filter(x => x.id !== edgeId));
    showToast("Đã xóa nhánh IF", "info");
  }, [edges, showToast]);

  const changeTriggerType = useCallback(newType => {
    setNodes(prev => prev.map(n => n.id === "start"
      ? { ...n, type: newType, name: "Bắt đầu", properties: clone(NODE_TYPES[newType]?.def || {}) }
      : n
    ));
    showToast("Đã đổi Trigger: " + (NODE_TYPES[newType]?.name || newType), "success");
  }, [showToast]);

  const updateNodeProp = useCallback((key, val) => {
    if (!selected) return;
    setNodes(prev => prev.map(n => n.id === selected
      ? { ...n, properties: { ...n.properties, [key]: val } }
      : n
    ));
  }, [selected]);

  const updateNodeProps = useCallback(patch => {
    if (!selected || !patch) return;
    setNodes(prev => prev.map(n => n.id === selected
      ? { ...n, properties: { ...n.properties, ...patch } }
      : n
    ));
  }, [selected]);

  const updateNodeName = useCallback((idOrName, maybeName) => {
    // Two call styles supported:
    //   updateNodeName(name)         - renames current selection
    //   updateNodeName(id, name)     - renames a specific node (used by inline rename)
    if (maybeName === undefined) {
      const name = idOrName;
      if (!selected) return;
      setNodes(prev => prev.map(n => n.id === selected ? { ...n, name } : n));
    } else {
      const id = idOrName;
      const name = maybeName;
      setNodes(prev => prev.map(n => n.id === id ? { ...n, name } : n));
    }
  }, [selected]);

  const updateEdgeExpr = useCallback((edgeId, props) => {
    setEdges(prev => prev.map(e => e.id === edgeId
      ? { ...e, properties: { ...e.properties, ...props } }
      : e
    ));
  }, []);

  const resetWorkflow = useCallback(() => {
    setNodes(clone(DEFAULT_NODES));
    setEdges(clone(DEFAULT_EDGES));
    setMeta(clone(DEFAULT_META));
    setSelected(null);
    setInsertEdgeId(null);
  }, []);

  const updateMeta = useCallback(patch => {
    setMeta(prev => ({ ...prev, ...patch }));
  }, []);

  const loadWorkflow = useCallback((rawNodes, rawEdges, rawMeta) => {
    if (!Array.isArray(rawNodes) || !rawNodes.length) {
      setNodes(clone(DEFAULT_NODES));
      setEdges(clone(DEFAULT_EDGES));
      setMeta(clone(DEFAULT_META));
    } else {
      const { nodes: n, edges: e } = normalizeWorkflow(rawNodes, rawEdges);
      setNodes(n);
      setEdges(ensureConditionBranches(n, dedupeEdges(e)));
      const budget = rawMeta?.totalBudget;
      setMeta({
        totalBudget: budget != null && budget !== "" ? String(budget) : ""
      });
    }
    setSelected(null);
    setInsertEdgeId(null);
  }, []);

  return {
    // state
    nodes, edges, meta, selected, selectedNode, insertEdgeId, layout,
    // setters (rarely used by parent)
    setNodes, setEdges, setMeta, setSelected, setInsertEdgeId,
    // operations
    addNodeAtEnd,
    insertNodeIntoEdge,
    deleteNode,
    addBranch,
    deleteBranch,
    changeTriggerType,
    updateNodeProp,
    updateNodeProps,
    updateNodeName,
    updateEdgeExpr,
    updateMeta,
    resetWorkflow,
    loadWorkflow
  };
}
