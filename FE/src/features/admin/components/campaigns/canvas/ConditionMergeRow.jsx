import React from "react";

/** Hàng merge — anchor vô hình cho SVG */
export default function ConditionMergeRow({ conditionId, columns }) {
  const col = columns?.[conditionId] ?? 0;
  const colClass = col < 0 ? "left" : col > 0 ? "right" : "center";

  return (
    <div className="cb-flow-row-wide cb-merge-row">
      {col === 0 ? (
        <>
          <div className="cb-col cb-col-left" />
          <div className="cb-col cb-col-center">
            <div className="cb-fork-merge" id={`cb-fork-merge-${conditionId}`} aria-hidden="true" />
          </div>
          <div className="cb-col cb-col-right" />
        </>
      ) : (
        <>
          <div className="cb-col cb-col-left" />
          <div className="cb-col cb-col-center" />
          <div className={`cb-col cb-col-${colClass}`}>
            <div className="cb-fork-merge" id={`cb-fork-merge-${conditionId}`} aria-hidden="true" />
          </div>
        </>
      )}
    </div>
  );
}
