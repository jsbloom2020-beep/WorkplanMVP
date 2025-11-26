import React, { useState, useEffect, useRef, useCallback } from "react";

function Page1Workstreams({
  workstreams,
  setWorkstreams,
  selectedWorkstreamIds = [],
  setSelectedWorkstreamIds,
  onNext,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) {
  const [draggedId, setDraggedId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const pageRef = useRef(null);
  const safeSelectedIds = Array.isArray(selectedWorkstreamIds)
    ? selectedWorkstreamIds
    : [];

  const updateSelection = useCallback(
    (updater) => {
      if (typeof setSelectedWorkstreamIds !== "function") return;
      setSelectedWorkstreamIds((prev) => {
        const prevArray = Array.isArray(prev) ? prev : [];
        if (typeof updater === "function") {
          return updater(prevArray);
        }
        return Array.isArray(updater) ? updater : prevArray;
      });
    },
    [setSelectedWorkstreamIds]
  );

  // GLOBAL click handler: clear selection if you click anywhere
  // that's NOT inside a workstream row.
  useEffect(() => {
    const handleDocumentClick = (e) => {
      const row = e.target.closest(".ws-row");
      if (!row) {
        updateSelection([]);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [updateSelection]);

  // Select / multi-select rows
  const handleRowClick = (id, shiftKey) => {
    updateSelection((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      if (shiftKey) {
        // toggle in selection
        return prevArray.includes(id)
          ? prevArray.filter((x) => x !== id)
          : [...prevArray, id];
      }
      // single selection
      return [id];
    });
  };

  const handleChange = (id, field, value) => {
    const updated = workstreams.map((ws) =>
      ws.id === id ? { ...ws, [field]: value } : ws
    );
    setWorkstreams(updated);
  };

  const handleAddWorkstream = () => {
    const newId =
      workstreams.length > 0
        ? Math.max(...workstreams.map((ws) => ws.id)) + 1
        : 1;

    const newWs = {
      id: newId,
      name: `Workstream ${newId}`,
      description: "Workstream Description",
    };
    setWorkstreams([...workstreams, newWs]);
  };

  const handleRemoveWorkstream = (id) => {
    const updated = workstreams.filter((ws) => ws.id !== id);
    setWorkstreams(updated);
    updateSelection((prev) =>
      Array.isArray(prev) ? prev.filter((x) => x !== id) : []
    );
  };

  // When drag starts: if row isn't selected, treat as single-selection drag
  const handleDragStart = (id) => {
    if (!safeSelectedIds.includes(id)) {
      updateSelection([id]);
    }
    setDraggedId(id);
  };

  // Drop at a specific index (supports top / middle / bottom)
  const handleDropAtIndex = (targetIndex) => {
    if (draggedId == null) return;

    const movingIds = safeSelectedIds.includes(draggedId)
      ? safeSelectedIds
      : [draggedId];

    const validMovingIds = movingIds.filter((id) =>
      workstreams.some((ws) => ws.id === id)
    );
    if (validMovingIds.length === 0) {
      setDraggedId(null);
      return;
    }

    const movingItems = workstreams.filter((ws) =>
      validMovingIds.includes(ws.id)
    );
    let remaining = workstreams.filter(
      (ws) => !validMovingIds.includes(ws.id)
    );

    const movingIndexes = workstreams
      .map((ws, idx) => ({ id: ws.id, idx }))
      .filter((entry) => validMovingIds.includes(entry.id))
      .map((entry) => entry.idx)
      .sort((a, b) => a - b);

    const itemsBeforeTarget = movingIndexes.filter((idx) => idx < targetIndex)
      .length;

    let index = targetIndex - itemsBeforeTarget;
    if (index < 0) index = 0;
    if (index > remaining.length) index = remaining.length;

    remaining.splice(index, 0, ...movingItems);
    setWorkstreams(remaining);
    setDraggedId(null);
    setDropIndex(null);
  };

  return (
    <div
      ref={pageRef}
      style={{
        minHeight: "80vh",
        padding: "0 24px",
      }}
    >
      <h2>Page 1 – Workstreams</h2>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <button onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button onClick={onRedo} disabled={!canRedo}>
          Redo
        </button>
      </div>

      {(() => {
        const renderDropZone = (index) => (
          <div
            key={`dropzone-${index}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropIndex(index);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setDropIndex((prev) => (prev === index ? null : prev));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDropAtIndex(index);
            }}
            style={{
              height: 12,
              margin: "6px auto",
              width: "95%",
              borderTop:
                dropIndex === index ? "3px solid #4c6ef5" : "3px solid transparent",
              transition: "border-color 0.1s",
            }}
          />
        );

        const rows = [];
        rows.push(renderDropZone(0));

        workstreams.forEach((ws, index) => {
          rows.push(
            <div
              key={ws.id}
              className="ws-row" // used by the global click handler
              draggable
              onDragStart={() => handleDragStart(ws.id)}
              onClick={(e) => {
                e.stopPropagation();
                handleRowClick(ws.id, e.shiftKey);
              }}
              style={{
                width: "95%",
                margin: "0 auto 10px auto",
                display: "flex",
                gap: "8px",
                border: "1px solid #333",
                padding: "8px",
                backgroundColor: safeSelectedIds.includes(ws.id)
                  ? "#eef4ff"
                  : "white",
                cursor: "move",
              }}
            >
              <input
                style={{ flex: 1 }}
                value={ws.name}
                onChange={(e) => handleChange(ws.id, "name", e.target.value)}
              />
              <input
                style={{ flex: 2 }}
                value={ws.description}
                onChange={(e) =>
                  handleChange(ws.id, "description", e.target.value)
                }
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveWorkstream(ws.id);
                }}
              >
                ✕
              </button>
            </div>
          );
          rows.push(renderDropZone(index + 1));
        });

        return rows;
      })()}

      <button onClick={handleAddWorkstream} style={{ marginTop: "10px" }}>
        + Add workstream
      </button>

      <div style={{ marginTop: "20px" }}>
        <button onClick={onNext}>Next: Milestones →</button>
      </div>
    </div>
  );
}

export default Page1Workstreams;
