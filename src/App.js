import React, { useState, useRef, useEffect, useCallback } from "react";
import Page1Workstreams from "./Page1Workstreams";
import Page2Milestones from "./Page2Milestones";
import Page3Tasks from "./Page3Tasks";
import ChatBox from "./ChatBox";

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:8001"
    : "https://workplanmvp-backend.onrender.com";

const ACCESS_PASSWORD = "Workplan2025!";

const DEFAULT_WORKSTREAMS = [
  { id: 1, name: "Workstream 1", description: "Workstream Description" },
  { id: 2, name: "Workstream 2", description: "Workstream Description" },
  { id: 3, name: "Workstream 3", description: "Workstream Description" },
  { id: 4, name: "Workstream 4", description: "Workstream Description" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const normalizeMilestoneDates = (items) => {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!item || !item.startDate || !item.endDate) return item;
    if (!ISO_DATE.test(item.startDate) || !ISO_DATE.test(item.endDate)) {
      return item;
    }
    const start = new Date(item.startDate);
    const end = new Date(item.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return item;
    }

    while (end < start) {
      end.setFullYear(end.getFullYear() + 1);
    }

    return {
      ...item,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  });
};

const sortMilestonesByEndDate = (items, workstreams) => {
  if (!Array.isArray(items)) return items;
  const wsOrder = workstreams.map((ws) => ws.id);
  const wsIdToMilestones = new Map();

  items.forEach((ms) => {
    if (!wsIdToMilestones.has(ms.workstreamId)) {
      wsIdToMilestones.set(ms.workstreamId, []);
    }
    wsIdToMilestones.get(ms.workstreamId).push(ms);
  });

  const sortList = (list) =>
    list.sort((a, b) => {
      const aEnd = ISO_DATE.test(a.endDate || "") ? a.endDate : null;
      const bEnd = ISO_DATE.test(b.endDate || "") ? b.endDate : null;
      if (aEnd && bEnd) return aEnd.localeCompare(bEnd);
      if (aEnd) return -1;
      if (bEnd) return 1;
      return 0;
    });

  const sorted = [];
  wsOrder.forEach((wsId) => {
    const list = wsIdToMilestones.get(wsId);
    if (!list) return;
    sorted.push(...sortList(list));
    wsIdToMilestones.delete(wsId);
  });

  wsIdToMilestones.forEach((list) => {
    sorted.push(...sortList(list));
  });

  return sorted;
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const applyScopedUpdate = (
  currentItems,
  updatedItems,
  selectedIds,
  { preserveMissingSelected = false } = {}
) => {
  if (!Array.isArray(updatedItems)) return null;

  const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
  const currentIdSet = new Set(currentItems.map((item) => item.id));

  if (!selectedIds || selectedIds.length === 0) {
    const next = currentItems.map((item) =>
      updatedMap.has(item.id) ? updatedMap.get(item.id) : item
    );

    updatedMap.forEach((item, id) => {
      if (!currentIdSet.has(id)) {
        next.push(item);
      }
    });

    return next;
  }

  const selectionSet = new Set(selectedIds);
  const next = [];

  currentItems.forEach((item) => {
    if (!selectionSet.has(item.id)) {
      next.push(item);
      return;
    }

    if (updatedMap.has(item.id)) {
      next.push(updatedMap.get(item.id));
      updatedMap.delete(item.id);
    } else if (preserveMissingSelected) {
      next.push(item);
    }
  });

  updatedMap.forEach((item, id) => {
    if (!currentIdSet.has(id)) {
      next.push(item);
    }
  });

  return next;
};

const pruneSelection = (selection, updatedItems) => {
  if (!Array.isArray(selection) || selection.length === 0) return selection;
  if (!Array.isArray(updatedItems) || updatedItems.length === 0) return [];
  const ids = new Set(updatedItems.map((item) => item.id));
  return selection.filter((id) => ids.has(id));
};

function App() {
  const [step, setStep] = useState(1);

  const [workstreams, setWorkstreams] = useState(() =>
    deepClone(DEFAULT_WORKSTREAMS)
  );

  const [milestones, setMilestones] = useState([]);

  const [tasks, setTasks] = useState([]);

  const [history, setHistory] = useState(() => [
    {
      workstreams: deepClone(DEFAULT_WORKSTREAMS),
      milestones: [],
      tasks: [],
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0);
  const isRestoring = useRef(false);

  const [isLoading, setIsLoading] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("workplanAuthed") === "true";
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [selectedWorkstreamIds, setSelectedWorkstreamIds] = useState([]);

  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState([]);
  
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);


  // simple local chat history; later you’ll send these to your backend
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      role: "assistant",
      text: "Ask me anything about your workplan, and I’ll help refine workstreams, milestones, or tasks.",
    },
  ]);

  const goToNext = () => setStep((prev) => Math.min(prev + 1, 3));
  const goToBack = () => setStep((prev) => Math.max(prev - 1, 1));

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    if (passwordInput === ACCESS_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError("");
      if (typeof window !== "undefined") {
        window.localStorage.setItem("workplanAuthed", "true");
      }
    } else {
      setLoginError("Incorrect password. Please try again.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPasswordInput("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("workplanAuthed");
    }
  };

  const createSnapshot = useCallback(
    () => ({
      workstreams: deepClone(workstreams),
      milestones: deepClone(milestones),
      tasks: deepClone(tasks),
    }),
    [workstreams, milestones, tasks]
  );

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    if (isRestoring.current) {
      isRestoring.current = false;
      return;
    }
    const snapshot = createSnapshot();
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndexRef.current + 1);
      const nextHistory = [...trimmed, snapshot].slice(-50);
      const nextIndex = nextHistory.length - 1;
      historyIndexRef.current = nextIndex;
      setHistoryIndex(nextIndex);
      return nextHistory;
    });
  }, [createSnapshot]);

  const getEffectiveMilestoneSelection = () => {
    if (selectedMilestoneIds.length > 0) {
      return { ids: selectedMilestoneIds, source: "milestone" };
    }
    if (selectedWorkstreamIds.length > 0) {
      const ids = milestones
        .filter((ms) => selectedWorkstreamIds.includes(ms.workstreamId))
        .map((ms) => ms.id);
      return { ids, source: "workstream" };
    }
    return { ids: [], source: "all" };
  };

  const getEffectiveTaskSelection = (milestoneSelection) => {
    if (selectedTaskIds.length > 0) {
      return { ids: selectedTaskIds, source: "task" };
    }
    if (selectedMilestoneIds.length > 0) {
      const ids = tasks
        .filter((t) => selectedMilestoneIds.includes(t.milestoneId))
        .map((t) => t.id);
      return { ids, source: "milestone" };
    }
    if (selectedWorkstreamIds.length > 0) {
      const allowedMilestoneIds =
        milestoneSelection.ids.length > 0
          ? milestoneSelection.ids
          : milestones
              .filter((ms) => selectedWorkstreamIds.includes(ms.workstreamId))
              .map((ms) => ms.id);
      const allowedSet = new Set(allowedMilestoneIds);
      const ids = tasks
        .filter((t) => allowedSet.has(t.milestoneId))
        .map((t) => t.id);
      return { ids, source: "workstream" };
    }
    return { ids: [], source: "all" };
  };

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    isRestoring.current = true;
    setWorkstreams(deepClone(snapshot.workstreams));
    setMilestones(deepClone(snapshot.milestones));
    setTasks(deepClone(snapshot.tasks));
  }, []);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    applySnapshot(history[nextIndex]);
    setHistoryIndex(nextIndex);
  }, [history, historyIndex, applySnapshot]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    applySnapshot(history[nextIndex]);
    setHistoryIndex(nextIndex);
  }, [history, historyIndex, applySnapshot]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;
      const key = e.key.toLowerCase();

      const tagName = (e.target?.tagName || "").toLowerCase();
      const isEditableTarget =
        e.target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        e.target?.getAttribute?.("role") === "textbox";
      if (isEditableTarget) {
        return;
      }

      const milestoneById = new Map(
        milestones.map((ms) => [ms.id, ms])
      );
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const tasksByMilestone = new Map();
      tasks.forEach((task) => {
        if (!tasksByMilestone.has(task.milestoneId)) {
          tasksByMilestone.set(task.milestoneId, []);
        }
        tasksByMilestone.get(task.milestoneId).push(task.id);
      });

      const getSharedWorkstreamFromMilestones = (ids) => {
        if (!ids.length) return null;
        const wsSet = new Set();
        ids.forEach((id) => {
          const ms = milestoneById.get(id);
          if (ms) wsSet.add(ms.workstreamId);
        });
        return wsSet.size === 1 ? [...wsSet][0] : null;
      };

      const sharedMilestoneForTasks = (() => {
        if (!selectedTaskIds.length) return null;
        const set = new Set();
        selectedTaskIds.forEach((id) => {
          const task = taskById.get(id);
          if (task) set.add(task.milestoneId);
        });
        return set.size === 1 ? [...set][0] : null;
      })();

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      if (key === "a") {
        e.preventDefault();
        const allWsIds = workstreams.map((ws) => ws.id);
        const selectAllWorkstreams = () => {
          setSelectedWorkstreamIds(allWsIds);
          setSelectedMilestoneIds([]);
          setSelectedTaskIds([]);
        };

        if (step === 1) {
          selectAllWorkstreams();
          return;
        }

        if (step === 2) {
          const sharedWs = getSharedWorkstreamFromMilestones(
            selectedMilestoneIds
          );
          if (selectedMilestoneIds.length > 0 && sharedWs != null) {
            const milestonesInWs = milestones
              .filter((ms) => ms.workstreamId === sharedWs)
              .map((ms) => ms.id);
            const hasFullWs =
              milestonesInWs.length > 0 &&
              selectedMilestoneIds.length === milestonesInWs.length;

            if (!hasFullWs) {
              setSelectedWorkstreamIds([]);
              setSelectedMilestoneIds(milestonesInWs);
              setSelectedTaskIds([]);
              return;
            }

            selectAllWorkstreams();
            return;
          }

          if (selectedWorkstreamIds.length > 0) {
            selectAllWorkstreams();
            return;
          }

          selectAllWorkstreams();
          return;
        }

        if (step === 3) {
          const targetMilestoneId = sharedMilestoneForTasks;
          const allTasksForMilestone =
            targetMilestoneId != null
              ? tasksByMilestone.get(targetMilestoneId) || []
              : [];
          const milestoneInfo =
            targetMilestoneId != null
              ? milestoneById.get(targetMilestoneId)
              : null;

          if (
            targetMilestoneId != null &&
            selectedTaskIds.length > 0 &&
            selectedTaskIds.length < allTasksForMilestone.length
          ) {
            setSelectedTaskIds(allTasksForMilestone);
            return;
          }

          const sharedWsFromMilestones = getSharedWorkstreamFromMilestones(
            selectedMilestoneIds
          );

          let milestoneContext = null;

          if (sharedWsFromMilestones != null) {
            const milestoneIdsForWs = milestones
              .filter((ms) => ms.workstreamId === sharedWsFromMilestones)
              .map((ms) => ms.id);
            const alreadyAll =
              milestoneIdsForWs.length > 0 &&
              selectedMilestoneIds.length === milestoneIdsForWs.length;
            milestoneContext = {
              wsId: sharedWsFromMilestones,
              milestoneIds: milestoneIdsForWs,
              alreadyAll,
            };
          } else if (
            targetMilestoneId != null &&
            selectedTaskIds.length > 0 &&
            selectedTaskIds.length === allTasksForMilestone.length &&
            allTasksForMilestone.length > 0 &&
            milestoneInfo
          ) {
            const milestoneIdsForWs = milestones
              .filter((ms) => ms.workstreamId === milestoneInfo.workstreamId)
              .map((ms) => ms.id);
            milestoneContext = {
              wsId: milestoneInfo.workstreamId,
              milestoneIds: milestoneIdsForWs,
              alreadyAll: false,
            };
          }

          if (milestoneContext) {
            if (!milestoneContext.alreadyAll) {
              setSelectedMilestoneIds(milestoneContext.milestoneIds);
              setSelectedTaskIds([]);
              setSelectedWorkstreamIds([]);
              return;
            }
            selectAllWorkstreams();
            return;
          }

          if (selectedWorkstreamIds.length > 0) {
            selectAllWorkstreams();
            return;
          }

          selectAllWorkstreams();
          return;
        }

        selectAllWorkstreams();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    undo,
    redo,
    workstreams,
    milestones,
    tasks,
    selectedWorkstreamIds,
    selectedMilestoneIds,
    selectedTaskIds,
    step,
  ]);

  const handleSendMessage = async (text) => {
    if (!text.trim()) return;

    const newMessage = {
      id: Date.now(),
      role: "user",
      text: text.trim(),
    };
    setChatMessages((prev) => [...prev, newMessage]);

    const wsSelectionForPayload = selectedWorkstreamIds;
    const milestoneSelection = getEffectiveMilestoneSelection();
    const msSelectionForPayload = milestoneSelection.ids;
    const msSelectionSource = milestoneSelection.source;
    const taskSelection = getEffectiveTaskSelection(milestoneSelection);
    const taskSelectionForPayload = taskSelection.ids;
    const taskSelectionSource = taskSelection.source;

    try {
      setIsLoading(true); // ⬅️ start loading

      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          workstreams,
          milestones,
          tasks,
          selectedWorkstreamIds: wsSelectionForPayload,
          selectedMilestoneIds: msSelectionForPayload,
          selectedTaskIds: taskSelectionForPayload,
          activeStep: step,
          milestoneSelectionSource: msSelectionSource,
          taskSelectionSource: taskSelectionSource,
        }),
      });

      const data = await res.json();

      const assistantMessage = {
        id: Date.now() + 1,
        role: data.role || "assistant",
        text: data.text || "",
      };
      setChatMessages((prev) => [...prev, assistantMessage]);

      if (data.updatedWorkstreams) {
        const next = applyScopedUpdate(
          workstreams,
          data.updatedWorkstreams,
          wsSelectionForPayload
        );
        if (Array.isArray(next)) {
          setWorkstreams(next);
          if (selectedWorkstreamIds.length) {
            setSelectedWorkstreamIds((prev) =>
              pruneSelection(prev, next)
            );
          }
        }
      }
      if (data.updatedMilestones) {
        const nextRaw = applyScopedUpdate(
          milestones,
          data.updatedMilestones,
          msSelectionForPayload,
          { preserveMissingSelected: msSelectionSource !== "milestone" }
        );
        const normalized = normalizeMilestoneDates(nextRaw);
        const next = sortMilestonesByEndDate(normalized, workstreams);
        if (Array.isArray(next)) {
          setMilestones(next);
          if (selectedMilestoneIds.length) {
            setSelectedMilestoneIds((prev) => pruneSelection(prev, next));
          }
        }
      }
      if (data.updatedTasks) {
        const next = applyScopedUpdate(
          tasks,
          data.updatedTasks,
          taskSelectionForPayload,
          { preserveMissingSelected: taskSelectionSource !== "task" }
        );
        if (Array.isArray(next)) {
          setTasks(next);
          if (selectedTaskIds.length) {
            setSelectedTaskIds((prev) => pruneSelection(prev, next));
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      const errorMessage = {
        id: Date.now() + 2,
        role: "assistant",
        text:
          "Sorry, I couldn’t reach the backend. Please try again in a moment.",
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false); // ⬅️ stop loading
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await fetch(`${API_BASE}/export/excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workstreams, milestones, tasks }),
      });

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const downloadName = filenameMatch
        ? filenameMatch[1]
        : `workplan-export-${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19)}.xlsx`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error("Export error:", error);
      alert(
        "Failed to export workplan. Please ensure the backend is running and try again."
      );
    }
  };


  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          padding: "24px",
        }}
      >
        <form
          onSubmit={handleLoginSubmit}
          style={{
            background: "white",
            padding: "32px",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            width: "100%",
            maxWidth: "360px",
          }}
        >
          <h1 style={{ marginTop: 0 }}>Workplan Login</h1>
          <p style={{ color: "#475569", marginBottom: "16px" }}>
            Enter the access password to continue.
          </p>
          <label
            htmlFor="workplan-password"
            style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}
          >
            Password
          </label>
          <input
            id="workplan-password"
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter password"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5f5",
              marginBottom: "12px",
            }}
            autoComplete="current-password"
            autoFocus
          />
          {loginError && (
            <div style={{ color: "#b91c1c", marginBottom: "12px" }}>
              {loginError}
            </div>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: "#2563eb",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Enter Workplan
          </button>
        </form>
      </div>
    );
  }


  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  let content;
  const undoRedoProps = {
    canUndo,
    canRedo,
    onUndo: undo,
    onRedo: redo,
  };
  if (step === 1) {
    content = (
      <Page1Workstreams
        workstreams={workstreams}
        setWorkstreams={setWorkstreams}
        selectedWorkstreamIds={selectedWorkstreamIds}
        setSelectedWorkstreamIds={setSelectedWorkstreamIds}
        onNext={goToNext}
        {...undoRedoProps}
      />
    );
  } else if (step === 2) {
    content = (
      <Page2Milestones
        workstreams={workstreams}
        setWorkstreams={setWorkstreams}
        milestones={milestones}
        setMilestones={setMilestones}
        selectedWorkstreamIds={selectedWorkstreamIds}
        setSelectedWorkstreamIds={setSelectedWorkstreamIds}
        selectedMilestoneIds={selectedMilestoneIds}
        setSelectedMilestoneIds={setSelectedMilestoneIds}
        onNext={goToNext}
        onBack={goToBack}
        {...undoRedoProps}
      />
    );
  } else {
    content = (
      <Page3Tasks
        workstreams={workstreams}
        setWorkstreams={setWorkstreams}
        milestones={milestones}
        setMilestones={setMilestones}
        tasks={tasks}
        setTasks={setTasks}
        selectedWorkstreamIds={selectedWorkstreamIds}
        setSelectedWorkstreamIds={setSelectedWorkstreamIds}
        selectedMilestoneIds={selectedMilestoneIds}
        setSelectedMilestoneIds={setSelectedMilestoneIds}
        selectedTaskIds={selectedTaskIds}
        setSelectedTaskIds={setSelectedTaskIds}
        onBack={goToBack}
        {...undoRedoProps}
      />
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Main content area scrolls */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "20px",
            maxWidth: "1000px",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ marginBottom: "4px" }}>Workplan Builder MVP</h1>
              <p style={{ marginTop: 0 }}>Step {step} of 3</p>
            </div>
            <button onClick={handleLogout}>Log out</button>
          </div>
          <hr />
          {content}

          <div style={{ marginTop: "24px", textAlign: "right" }}>
            <button onClick={handleExportExcel}>
              Export workplan to Excel
            </button>
          </div>
        </div>
      </div>

      {/* Chat bar anchored at bottom */}
        <ChatBox
        messages={chatMessages}
        onSend={handleSendMessage}
        isLoading={isLoading}
      />

    </div>
  );
}

export default App;
