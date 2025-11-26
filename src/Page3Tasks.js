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

function Page3Tasks({
  workstreams,
  setWorkstreams,
  milestones,
  setMilestones,
  tasks,
  setTasks,
  selectedWorkstreamIds = [],
  setSelectedWorkstreamIds,
  selectedMilestoneIds = [],
  setSelectedMilestoneIds,
  selectedTaskIds = [],
  setSelectedTaskIds,
  onBack,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) {
  const [draggedWsId, setDraggedWsId] = useState(null);
  const [draggedMsId, setDraggedMsId] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [collapsedWsIds, setCollapsedWsIds] = useState([]);
  const [collapsedMsIds, setCollapsedMsIds] = useState([]);
  const [wsDropIndex, setWsDropIndex] = useState(null);
  const [msDropTarget, setMsDropTarget] = useState({
    workstreamId: null,
    index: null,
  });
  const [taskDropTarget, setTaskDropTarget] = useState({
    milestoneId: null,
    index: null,
  });

  const safeWsSelection = Array.isArray(selectedWorkstreamIds)
    ? selectedWorkstreamIds
    : [];
  const safeMsSelection = Array.isArray(selectedMilestoneIds)
    ? selectedMilestoneIds
    : [];
  const safeTaskSelection = Array.isArray(selectedTaskIds)
    ? selectedTaskIds
    : [];

  const updateWsSelection = useSelectionUpdater(setSelectedWorkstreamIds);
  const updateMsSelection = useSelectionUpdater(setSelectedMilestoneIds);
  const updateTaskSelection = useSelectionUpdater(setSelectedTaskIds);

  useEffect(() => {
    const handleDocumentClick = (e) => {
      const row = e.target.closest(".ws-row-3, .ms-row-3, .task-row");
      if (!row) {
        updateWsSelection([]);
        updateMsSelection([]);
        updateTaskSelection([]);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [updateWsSelection, updateMsSelection, updateTaskSelection]);

  const handleWsClick = (id, shiftKey) => {
    updateMsSelection([]);
    updateTaskSelection([]);
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
    updateWsSelection([]);
    updateTaskSelection([]);
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

  const handleTaskClick = (id, shiftKey) => {
    updateWsSelection([]);
    updateMsSelection([]);
    updateTaskSelection((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      if (shiftKey) {
        return prevArray.includes(id)
          ? prevArray.filter((x) => x !== id)
          : [...prevArray, id];
      }
      return [id];
    });
  };

  const handleTaskChange = (id, field, value) => {
    const updated = tasks.map((t) =>
      t.id === id ? { ...t, [field]: value } : t
    );
    setTasks(updated);
  };

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
      description: "",
      startDate: "",
      endDate: "",
    };

    setMilestones([...milestones, newMs]);
    updateMsSelection([]);
    updateTaskSelection([]);
  };

  const handleAddTask = (milestoneId) => {
    const newId =
      tasks.length > 0 ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;

    const newTask = {
      id: newId,
      milestoneId,
      name: `Task ${newId}`,
      description: "Task Description",
      owner: "",
      startDate: "",
      endDate: "",
    };

    setTasks([...tasks, newTask]);
  };

  const handleRemoveTask = (id) => {
    const updated = tasks.filter((t) => t.id !== id);
    setTasks(updated);
    updateTaskSelection((prev) =>
      Array.isArray(prev) ? prev.filter((x) => x !== id) : []
    );
  };

  const handleTaskDragStart = (id) => {
    if (!safeTaskSelection.includes(id)) {
      updateTaskSelection([id]);
      updateWsSelection([]);
      updateMsSelection([]);
    }
    setDraggedTaskId(id);
  };

  const handleTaskDropAtIndex = (milestoneId, targetIndex) => {
    if (draggedTaskId == null) return;

    const current = [...tasks];
    const sourceTask = current.find((t) => t.id === draggedTaskId);
    if (!sourceTask || sourceTask.milestoneId !== milestoneId) {
      setDraggedTaskId(null);
      return;
    }

    const allMovingCandidateIds = safeTaskSelection.includes(draggedTaskId)
      ? safeTaskSelection
      : [draggedTaskId];

    const movingIds = allMovingCandidateIds.filter((id) => {
      const t = current.find((task) => task.id === id);
      return t && t.milestoneId === milestoneId;
    });

    if (movingIds.length === 0) {
      setDraggedTaskId(null);
      return;
    }

    const msTasks = current.filter((t) => t.milestoneId === milestoneId);
    const movingItems = msTasks.filter((t) => movingIds.includes(t.id));
    let remainingMsTasks = msTasks.filter((t) => !movingIds.includes(t.id));

    const movingIndexes = msTasks
      .map((t, idx) => ({ id: t.id, idx }))
      .filter((entry) => movingIds.includes(entry.id))
      .map((entry) => entry.idx)
      .sort((a, b) => a - b);

    const itemsBeforeTarget = movingIndexes.filter(
      (idx) => idx < targetIndex
    ).length;

    let index = targetIndex - itemsBeforeTarget;
    if (index < 0) index = 0;
    if (index > remainingMsTasks.length) index = remainingMsTasks.length;

    remainingMsTasks.splice(index, 0, ...movingItems);

    const newList = [];
    let msIndex = 0;
    for (const t of current) {
      if (t.milestoneId === milestoneId) {
        newList.push(remainingMsTasks[msIndex++]);
      } else {
        newList.push(t);
      }
    }

    setTasks(newList);
    setDraggedTaskId(null);
    setTaskDropTarget({ milestoneId: null, index: null });
  };

  const handleWsDragStart = (id) => {
    if (!safeWsSelection.includes(id)) {
      updateWsSelection([id]);
      updateMsSelection([]);
      updateTaskSelection([]);
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

  const handleMsDragStart = (id) => {
    if (!safeMsSelection.includes(id)) {
      updateMsSelection([id]);
      updateWsSelection([]);
      updateTaskSelection([]);
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

  const toggleWsCollapse = (id) => {
    setCollapsedWsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleMsCollapse = (id) => {
    setCollapsedMsIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

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
        height: 18,
        margin: "8px auto",
        width: "95%",
        borderTop:
          wsDropIndex === index ? "3px solid #4c6ef5" : "3px solid transparent",
        transition: "border-color 0.1s",
      }}
    />
  );

  const renderMsDropZone = (wsId, index) => (
    <div
      key={`ms-drop-${wsId}-${index}`}
      onDragOver={(e) => {
        e.preventDefault();
        setMsDropTarget({ workstreamId: wsId, index });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setMsDropTarget((prev) =>
            prev.workstreamId === wsId && prev.index === index
              ? { workstreamId: null, index: null }
              : prev
          );
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleMsDropAtIndex(wsId, index);
      }}
      style={{
        height: 14,
        margin: "4px 0",
        borderTop:
          msDropTarget.workstreamId === wsId &&
          msDropTarget.index === index
            ? "3px solid #4c6ef5"
            : "3px solid transparent",
      }}
    />
  );

  const renderTaskDropZone = (milestoneId, index) => (
    <div
      key={`task-drop-${milestoneId}-${index}`}
      onDragOver={(e) => {
        e.preventDefault();
        setTaskDropTarget({ milestoneId, index });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setTaskDropTarget((prev) =>
            prev.milestoneId === milestoneId && prev.index === index
              ? { milestoneId: null, index: null }
              : prev
          );
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleTaskDropAtIndex(milestoneId, index);
      }}
      style={{
        height: 12,
        borderTop:
          taskDropTarget.milestoneId === milestoneId &&
          taskDropTarget.index === index
            ? "3px solid #4c6ef5"
            : "3px solid transparent",
      }}
    />
  );

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
        <h2 style={{ margin: 0 }}>Page 3 – Tasks</h2>
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
        Refine tasks under each milestone. Drag workstreams, milestones, and
        tasks to reorder. You can select either workstreams, or milestones, or
        tasks (with Shift-click for multi-select), but not a mix of types at
        once.
      </p>

      {(() => {
        const rows = [];
        rows.push(renderWsDropZone(0));

        workstreams.forEach((ws, wsIndex) => {
          const wsMilestones = milestones.filter(
            (ms) => ms.workstreamId === ws.id
          );

          const wsCollapsed = collapsedWsIds.includes(ws.id);

          rows.push(
            <div
              key={ws.id}
              className="ws-row-3"
              draggable
              onDragStart={() => handleWsDragStart(ws.id)}
              onClick={(e) => {
                e.stopPropagation();
                handleWsClick(ws.id, e.shiftKey);
              }}
              style={{
                margin: "0 auto 24px auto",
                width: "95%",
                border: "1px solid #aaa",
                padding: "10px",
                backgroundColor: safeWsSelection.includes(ws.id)
                  ? "#eef4ff"
                  : "white",
                cursor: "move",
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
                    toggleWsCollapse(ws.id);
                  }}
                >
                  {wsCollapsed ? "▶" : "▼"}
                </button>
                <strong style={{ flex: 1 }}>{ws.name}</strong>
                <span style={{ flex: 2, fontSize: "0.9rem", color: "#555" }}>
                  {ws.description}
                </span>
              </div>

              {!wsCollapsed && (
                <>
                  {renderMsDropZone(ws.id, 0)}
                  {wsMilestones.map((ms, msIndex) => {
                    const msTasks = tasks.filter(
                      (t) => t.milestoneId === ms.id
                    );
                    const msCollapsed = collapsedMsIds.includes(ms.id);

                    return (
                      <React.Fragment key={ms.id}>
                        <div
                          className="ms-row-3"
                          draggable
                          onDragStart={() => handleMsDragStart(ms.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMsClick(ms.id, e.shiftKey);
                          }}
                          style={{
                            marginBottom: "20px",
                            padding: "8px 8px 12px 8px",
                            border: "1px solid #ddd",
                            backgroundColor: safeMsSelection.includes(ms.id)
                              ? "#f4f8ff"
                              : "#fafafa",
                            cursor: "move",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginBottom: "8px",
                              fontWeight: "bold",
                              fontSize: "0.95rem",
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMsCollapse(ms.id);
                              }}
                            >
                              {msCollapsed ? "▶" : "▼"}
                            </button>
                            <input
                              value={ms.name || ""}
                              onChange={(e) =>
                                handleMilestoneChange(
                                  ms.id,
                                  "name",
                                  e.target.value
                                )
                              }
                              onMouseDown={(e) => e.stopPropagation()}
                              placeholder="Milestone name"
                              style={{
                                flex: 1,
                                border: "1px solid #ccc",
                                padding: "4px 6px",
                                borderRadius: "4px",
                              }}
                            />
                          </div>

                          {!msCollapsed && (
                            <>
                              <textarea
                                value={ms.description || ""}
                                onChange={(e) =>
                                  handleMilestoneChange(
                                    ms.id,
                                    "description",
                                    e.target.value
                                  )
                                }
                                onMouseDown={(e) => e.stopPropagation()}
                                placeholder="Milestone description"
                                style={{
                                  width: "100%",
                                  border: "1px solid #ccc",
                                  borderRadius: "4px",
                                  padding: "6px",
                                  resize: "vertical",
                                  minHeight: "48px",
                                  marginBottom: "10px",
                                  backgroundColor: "white",
                                }}
                              />

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "1.2fr 2fr 1.2fr 1fr 1fr auto",
                                  gap: "8px",
                                  fontSize: "0.85rem",
                                  fontWeight: 600,
                                  marginBottom: "4px",
                                }}
                              >
                                <div>Task</div>
                                <div>Description</div>
                                <div>Owner</div>
                                <div>Start</div>
                                <div>End</div>
                                <div>Actions</div>
                              </div>

                              {renderTaskDropZone(ms.id, 0)}
                              {msTasks.map((t, index) => (
                                <React.Fragment key={t.id}>
                                  <div
                                    className="task-row"
                                    draggable
                                    onDragStart={() => handleTaskDragStart(t.id)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTaskClick(t.id, e.shiftKey);
                                    }}
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "1.2fr 2fr 1.2fr 1fr 1fr auto",
                                      gap: "8px",
                                      marginBottom: "4px",
                                      border: "1px solid #333",
                                      padding: "6px",
                                      backgroundColor: safeTaskSelection.includes(
                                        t.id
                                      )
                                        ? "#f4f8ff"
                                        : "white",
                                      cursor: "move",
                                    }}
                                  >
                                    <input
                                      value={t.name}
                                      onChange={(e) =>
                                        handleTaskChange(
                                          t.id,
                                          "name",
                                          e.target.value
                                        )
                                      }
                                      onMouseDown={(e) =>
                                        e.stopPropagation()
                                      }
                                    />
                                    <input
                                      value={t.description}
                                      onChange={(e) =>
                                        handleTaskChange(
                                          t.id,
                                          "description",
                                          e.target.value
                                        )
                                      }
                                      onMouseDown={(e) =>
                                        e.stopPropagation()
                                      }
                                    />
                                    <input
                                      value={t.owner || ""}
                                      onChange={(e) =>
                                        handleTaskChange(
                                          t.id,
                                          "owner",
                                          e.target.value
                                        )
                                      }
                                      placeholder="Owner"
                                      onMouseDown={(e) =>
                                        e.stopPropagation()
                                      }
                                    />
                                    <input
                                      type="date"
                                      value={t.startDate}
                                      onChange={(e) =>
                                        handleTaskChange(
                                          t.id,
                                          "startDate",
                                          e.target.value
                                        )
                                      }
                                      onMouseDown={(e) =>
                                        e.stopPropagation()
                                      }
                                    />
                                    <input
                                      type="date"
                                      value={t.endDate}
                                      onChange={(e) =>
                                        handleTaskChange(
                                          t.id,
                                          "endDate",
                                          e.target.value
                                        )
                                      }
                                      onMouseDown={(e) =>
                                        e.stopPropagation()
                                      }
                                    />
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveTask(t.id);
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {renderTaskDropZone(ms.id, index + 1)}
                                </React.Fragment>
                              ))}

                              <button onClick={() => handleAddTask(ms.id)}>
                                + Add Task
                              </button>
                            </>
                          )}
                        </div>
                        {renderMsDropZone(ws.id, msIndex + 1)}
                      </React.Fragment>
                    );
                  })}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddMilestone(ws.id);
                    }}
                    style={{ marginTop: "8px" }}
                  >
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

      <div style={{ marginTop: "20px" }}>
        <button onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

export default Page3Tasks;
