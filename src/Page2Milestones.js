import React, { useState, useEffect, useCallback } from "react";

function useSelectionUpdater(setter) {
  return useCallback(
    (updater) => {
      if (typeof setter !== "function") return;
      setter((prev) => {
        const prevArray = Array.isArray(prev) ? prev : [];
        if (typeof updater === "function") {
          return updater(prevArray);
        }
        return Array.isArray(updater) ? updater : prevArray;
      });
    },
    [setter]
  );
}

function Page2Milestones({
  workstreams,
  setWorkstreams,
  milestones,
  setMilestones,
  selectedWorkstreamIds = [],
  setSelectedWorkstreamIds,
  selectedMilestoneIds = [],
  setSelectedMilestoneIds,
  onNext,
  onBack,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) {
  const [collapsedWsIds, setCollapsedWsIds] = useState([]);
  const [draggedWsId, setDraggedWsId] = useState(null);
  const [draggedMsId, setDraggedMsId] = useState(null);
  const [wsDropIndex, setWsDropIndex] = useState(null);
  const [msDropTarget, setMsDropTarget] = useState({
    workstreamId: null,
    index: null,
  });

  const safeWsSelection = Array.isArray(selectedWorkstreamIds)
    ? selectedWorkstreamIds
    : [];
  const safeMsSelection = Array.isArray(selectedMilestoneIds)
    ? selectedMilestoneIds
    : [];

  const updateWsSelection = useSelectionUpdater(setSelectedWorkstreamIds);
  const updateMsSelection = useSelectionUpdater(setSelectedMilestoneIds);

  useEffect(() => {
    const handleDocumentClick = (e) => {
      const row = e.target.closest(".ws-row, .ms-row");
      if (!row) {
        updateWsSelection([]);
        updateMsSelection([]);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [updateWsSelection, updateMsSelection]);

  const isWsCollapsed = (id) => collapsedWsIds.includes(id);

  const toggleCollapse = (id) => {
    setCollapsedWsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Selection helpers
  const handleWsClick = (id, shiftKey) => {
    updateMsSelection([]); // can't have milestones selected at same time
    updateWsSelection((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      if (shiftKey) {
        return prevArray.includes(id)
          ? prevArray.filter((x) => x !== id)
          : [...prevArray, id];
      }
      return [id];
    });
  };

  const handleMsClick = (id, shiftKey) => {
    updateWsSelection([]); // clear workstream selection when picking milestones
    updateMsSelection((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      if (shiftKey) {
        return prevArray.includes(id)
          ? prevArray.filter((x) => x !== id)
          : [...prevArray, id];
      }
      return [id];
    });
  };

  // Workstream edit/add
  const handleWsChange = (id, field, value) => {
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
    const remainingWs = workstreams.filter((ws) => ws.id !== id);
    const remainingMs = milestones.filter((ms) => ms.workstreamId !== id);
    setWorkstreams(remainingWs);
    setMilestones(remainingMs);
    updateWsSelection((prev) =>
      Array.isArray(prev) ? prev.filter((x) => x !== id) : []
    );
    updateMsSelection((prev) =>
      Array.isArray(prev)
        ? prev.filter((msId) =>
            remainingMs.some((ms) => ms.id === msId)
          )
        : []
    );
  };

  // Milestone edit/add/remove
  const handleMilestoneChange = (id, field, value) => {
    const updated = milestones.map((ms) =>
      ms.id === id ? { ...ms, [field]: value } : ms
    );
    setMilestones(updated);
  };

  const handleAddMilestone = (workstreamId) => {
    const newId =
      milestones.length > 0
        ? Math.max(...milestones.map((m) => m.id)) + 1
        : 1;

    const newMs = {
      id: newId,
      workstreamId,
      name: `Milestone ${newId}`,
      description: "Milestone Description",
      startDate: "",
      endDate: "",
    };

    setMilestones([...milestones, newMs]);
  };

  const handleRemoveMilestone = (id) => {
    const updated = milestones.filter((ms) => ms.id !== id);
    setMilestones(updated);
    updateMsSelection((prev) =>
      Array.isArray(prev) ? prev.filter((x) => x !== id) : []
    );
  };

  // === Workstream drag/drop (multi, with explicit drop zones between) ===
  const handleWsDragStart = (id) => {
    if (!safeWsSelection.includes(id)) {
      updateWsSelection([id]);
      updateMsSelection([]); // clear milestones selection on WS drag
    }
    setDraggedWsId(id);
  };

  const handleWsDropAtIndex = (targetIndex) => {
    if (draggedWsId == null) return;

    const movingIds = safeWsSelection.includes(draggedWsId)
      ? safeWsSelection
      : [draggedWsId];

    const validMovingIds = movingIds.filter((id) =>
      workstreams.some((ws) => ws.id === id)
    );
    if (validMovingIds.length === 0) {
      setDraggedWsId(null);
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

    const itemsBeforeTarget = movingIndexes.filter(
      (idx) => idx < targetIndex
    ).length;

    let index = targetIndex - itemsBeforeTarget;
    if (index < 0) index = 0;
    if (index > remaining.length) index = remaining.length;

    remaining.splice(index, 0, ...movingItems);
    setWorkstreams(remaining);
    setDraggedWsId(null);
    setWsDropIndex(null);
  };

  // === Milestone drag/drop within a workstream (multi) ===
  const handleMsDragStart = (id) => {
    if (!safeMsSelection.includes(id)) {
      updateMsSelection([id]);
      updateWsSelection([]); // clear WS selection on milestone drag
    }
    setDraggedMsId(id);
  };

  const handleMsDropAtIndex = (workstreamId, targetIndex) => {
    if (draggedMsId == null) return;

    const current = [...milestones];

    const sourceMs = current.find((ms) => ms.id === draggedMsId);
    if (!sourceMs || sourceMs.workstreamId !== workstreamId) {
      setDraggedMsId(null);
      return;
    }

    const allMovingCandidateIds = safeMsSelection.includes(draggedMsId)
      ? safeMsSelection
      : [draggedMsId];

    const movingIds = allMovingCandidateIds.filter((id) => {
      const m = current.find((ms) => ms.id === id);
      return m && m.workstreamId === workstreamId;
    });

    if (movingIds.length === 0) {
      setDraggedMsId(null);
      return;
    }

    const wsMs = current.filter((ms) => ms.workstreamId === workstreamId);
    const movingItems = wsMs.filter((ms) => movingIds.includes(ms.id));
    let remainingWsMs = wsMs.filter((ms) => !movingIds.includes(ms.id));

    const movingIndexes = wsMs
      .map((ms, idx) => ({ id: ms.id, idx }))
      .filter((entry) => movingIds.includes(entry.id))
      .map((entry) => entry.idx)
      .sort((a, b) => a - b);

    const itemsBeforeTarget = movingIndexes.filter(
      (idx) => idx < targetIndex
    ).length;

    let index = targetIndex - itemsBeforeTarget;
    if (index < 0) index = 0;
    if (index > remainingWsMs.length) index = remainingWsMs.length;

    remainingWsMs.splice(index, 0, ...movingItems);

    const newList = [];
    let wsIndex = 0;
    for (const ms of current) {
      if (ms.workstreamId === workstreamId) {
        newList.push(remainingWsMs[wsIndex++]);
      } else {
        newList.push(ms);
      }
    }

    setMilestones(newList);
    setDraggedMsId(null);
    setMsDropTarget({ workstreamId: null, index: null });
  };

  const handleNext = () => {
    onNext();
  };

  return (
    <div
      style={{
        minHeight: "80vh",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0 }}>Page 2 – Milestones</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
        </div>
      </div>
      <p>
        Define milestones for each workstream. Drag to reorder; Shift-click to
        multi-select; click anywhere outside rows to clear selection; collapse
        workstreams to focus.
      </p>

      {(() => {
        const renderWsDropZone = (index) => (
          <div
            key={`ws-drop-${index}`}
            onDragOver={(e) => {
              e.preventDefault();
              setWsDropIndex(index);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setWsDropIndex((prev) => (prev === index ? null : prev));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleWsDropAtIndex(index);
            }}
            style={{
              height: 16,
              margin: "8px auto",
              width: "95%",
              borderTop:
                wsDropIndex === index
                  ? "3px solid #4c6ef5"
                  : "3px solid transparent",
              transition: "border-color 0.1s",
            }}
          />
        );

        const rows = [];
        rows.push(renderWsDropZone(0));

        workstreams.forEach((ws, wsIndex) => {
          const wsMilestones = milestones.filter(
            (ms) => ms.workstreamId === ws.id
          );
          const collapsed = isWsCollapsed(ws.id);

          const renderMsDropZone = (index) => (
            <div
              key={`ms-drop-${ws.id}-${index}`}
              onDragOver={(e) => {
                e.preventDefault();
                setMsDropTarget({ workstreamId: ws.id, index });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setMsDropTarget((prev) =>
                    prev.workstreamId === ws.id && prev.index === index
                      ? { workstreamId: null, index: null }
                      : prev
                  );
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleMsDropAtIndex(ws.id, index);
              }}
              style={{
                height: 12,
                margin: "4px 0",
                borderTop:
                  msDropTarget.workstreamId === ws.id &&
                  msDropTarget.index === index
                    ? "3px solid #4c6ef5"
                    : "3px solid transparent",
              }}
            />
          );

          rows.push(
            <div
              key={ws.id}
              className="ws-row"
              draggable
              onDragStart={() => handleWsDragStart(ws.id)}
              style={{
                margin: "0 auto 20px auto",
                width: "95%",
                border: "1px solid #aaa",
                padding: "10px",
                backgroundColor: safeWsSelection.includes(ws.id)
                  ? "#eef4ff"
                  : "white",
                cursor: "move",
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleWsClick(ws.id, e.shiftKey);
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(ws.id);
                  }}
                >
                  {collapsed ? "▶" : "▼"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveWorkstream(ws.id);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
                <input
                  style={{ flex: 1 }}
                  value={ws.name}
                  onChange={(e) =>
                    handleWsChange(ws.id, "name", e.target.value)
                  }
                />
                <input
                  style={{ flex: 2 }}
                  value={ws.description}
                  onChange={(e) =>
                    handleWsChange(ws.id, "description", e.target.value)
                  }
                />
              </div>

              {!collapsed && (
                <>
                  {renderMsDropZone(0)}
                  {wsMilestones.map((ms, msIndex) => (
                    <React.Fragment key={ms.id}>
                      <div
                        className="ms-row"
                        draggable
                        onDragStart={() => handleMsDragStart(ms.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMsClick(ms.id, e.shiftKey);
                        }}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.2fr 2fr 1fr 1fr auto",
                          gap: "8px",
                          marginBottom: "8px",
                          border: "1px solid #333",
                          padding: "8px",
                          backgroundColor: safeMsSelection.includes(ms.id)
                            ? "#f4f8ff"
                            : "white",
                          cursor: "move",
                        }}
                      >
                        <input
                          value={ms.name}
                          onChange={(e) =>
                            handleMilestoneChange(
                              ms.id,
                              "name",
                              e.target.value
                            )
                          }
                          placeholder="Milestone name"
                        />
                        <input
                          value={ms.description}
                          onChange={(e) =>
                            handleMilestoneChange(
                              ms.id,
                              "description",
                              e.target.value
                            )
                          }
                          placeholder="Description"
                        />
                        <input
                          type="date"
                          value={ms.startDate}
                          onChange={(e) =>
                            handleMilestoneChange(
                              ms.id,
                              "startDate",
                              e.target.value
                            )
                          }
                        />
                        <input
                          type="date"
                          value={ms.endDate}
                          onChange={(e) =>
                            handleMilestoneChange(
                              ms.id,
                              "endDate",
                              e.target.value
                            )
                          }
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMilestone(ms.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      {renderMsDropZone(msIndex + 1)}
                    </React.Fragment>
                  ))}

                  <button onClick={() => handleAddMilestone(ws.id)}>
                    + Add Milestone
                  </button>
                </>
              )}
            </div>
          );
          rows.push(renderWsDropZone(wsIndex + 1));
        });

        return rows;
      })()}

      <button onClick={handleAddWorkstream} style={{ marginTop: "10px" }}>
        + Add another workstream
      </button>

      <div style={{ marginTop: "20px" }}>
        <button onClick={onBack} style={{ marginRight: "10px" }}>
          ← Back
        </button>
        <button onClick={handleNext}>Next: Tasks →</button>
      </div>
    </div>
  );
}

export default Page2Milestones;
