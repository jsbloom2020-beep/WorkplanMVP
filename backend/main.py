from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from io import BytesIO
from fastapi.responses import StreamingResponse
import datetime as dt
import openpyxl  # for excel export
import re
import html

app = FastAPI(title="Workplan Backend MVP")

CURRENT_DATE_OVERRIDE = dt.date.today()

# --- CORS so React (localhost:3000) can talk to this API ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://workplanmvp.onrender.com",],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data models matching your React state ---

class Workstream(BaseModel):
    id: int
    name: str
    description: str


class Milestone(BaseModel):
    id: int
    workstreamId: int
    name: str
    description: str
    startDate: Optional[str] = None  # ISO date strings
    endDate: Optional[str] = None


class Task(BaseModel):
    id: int
    milestoneId: int
    name: str
    description: str
    owner: Optional[str] = ""
    startDate: Optional[str] = None
    endDate: Optional[str] = None


class GenerateMilestonesRequest(BaseModel):
    overview: str
    workstreams: List[Workstream]
    selected_workstream_ids: Optional[List[int]] = None


class GenerateTasksRequest(BaseModel):
    milestones: List[Milestone]
    selected_milestone_ids: Optional[List[int]] = None


class ChatRequest(BaseModel):
    message: str
    workstreams: List[Workstream]
    milestones: List[Milestone]
    tasks: List[Task]
    selected_workstream_ids: Optional[List[int]] = Field(
        default=None, alias="selectedWorkstreamIds"
    )
    selected_milestone_ids: Optional[List[int]] = Field(
        default=None, alias="selectedMilestoneIds"
    )
    selected_task_ids: Optional[List[int]] = Field(
        default=None, alias="selectedTaskIds"
    )
    active_step: Optional[int] = Field(default=None, alias="activeStep")
    milestone_selection_source: Optional[str] = Field(
        default="all", alias="milestoneSelectionSource"
    )
    task_selection_source: Optional[str] = Field(
        default="all", alias="taskSelectionSource"
    )

    class Config:
        allow_population_by_field_name = True


class ExportExcelRequest(BaseModel):
    workstreams: List[Workstream]
    milestones: List[Milestone]
    tasks: List[Task]

def to_ascii(s: str) -> str:
    """Best-effort: drop any non-ASCII characters to avoid encoding issues."""
    return s.encode("ascii", "ignore").decode("ascii")


HTML_TAG_RE = re.compile(r"<[^>]+>")


def sanitize_text(value: Optional[str]) -> str:
    """Remove HTML tags/entities and trim spacing for clean exports."""
    if not value:
        return ""
    text = html.unescape(value)
    text = HTML_TAG_RE.sub("", text)
    return text.replace("\xa0", " ").strip()


def format_selection(ids: Optional[List[int]]) -> str:
    if not ids:
        return "ALL"
    return ", ".join(str(i) for i in ids)


def restrict_updates(
    items,
    allowed_ids: Optional[List[int]],
    existing_items: List,
    allowed_parent_ids: Optional[List[int]] = None,
    id_to_parent: Optional[dict] = None,
):
    if items is None:
        return None

    allowed_ids_set = set(allowed_ids or [])
    allowed_parent_set = set(allowed_parent_ids or [])
    existing_ids = {item.id for item in existing_items}

    if not allowed_ids_set and not allowed_parent_set:
        return items

    id_to_parent = id_to_parent or {}

    filtered = []
    for item in items:
        item_id = item.get("id")
        parent = (
            item.get("workstreamId")
            if "workstreamId" in item
            else item.get("milestoneId")
        )
        if parent is None:
            parent = id_to_parent.get(item_id)

        if item_id in allowed_ids_set:
            filtered.append(item)
        elif parent is not None and parent in allowed_parent_set:
            filtered.append(item)
        elif (
            item_id not in existing_ids
            and not allowed_ids_set
            and not allowed_parent_set
        ):
            filtered.append(item)
    return filtered


TIMELINE_KEYWORDS = [
    "today",
    "tomorrow",
    "next",
    "start",
    "begin",
    "end",
    "finish",
    "close",
    "deadline",
    "due",
    "mid",
    "late",
    "early",
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
    "q1",
    "q2",
    "q3",
    "q4",
]


def extract_timeline_hints(text: str) -> str:
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    hints = []
    for sentence in sentences:
        lower = sentence.lower()
        if any(keyword in lower for keyword in TIMELINE_KEYWORDS):
            hints.append(sentence.strip())

    explicit_dates = re.findall(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b", text)
    if explicit_dates:
        hints.append("Explicit dates mentioned: " + ", ".join(explicit_dates))
    return " ".join(hints).strip()


def describe_selection(label: str, items: List, selected_ids: Optional[List[int]]) -> str:
    if not items:
        return f"{label}: none defined."

    if not selected_ids:
        listings = ", ".join(f"(id={item.id}) {item.name}" for item in items)
        return f"{label} (all editable): {listings}"

    selected_set = set(selected_ids)
    selected_items = [item for item in items if item.id in selected_set]
    locked_items = [item for item in items if item.id not in selected_set]

    selected_text = (
        ", ".join(f"(id={item.id}) {item.name}" for item in selected_items)
        or "none"
    )
    locked_text = (
        ", ".join(f"(id={item.id}) {item.name}" for item in locked_items)
        or "none"
    )

    return (
        f"{label} selected: {selected_text}\n"
        f"{label} locked (do NOT change): {locked_text}"
    )


def summarize_existing_timeline(milestones: List[Milestone]) -> str:
    dates = []
    for ms in milestones:
        for date_str in (ms.startDate, ms.endDate):
            if not date_str:
                continue
            try:
                dt_obj = dt.datetime.fromisoformat(date_str)
                dates.append(dt_obj)
            except Exception:
                continue

    if not dates:
        return "No milestone dates currently defined."

    earliest = min(dates)
    latest = max(dates)
    return (
        f"Current milestone timeline spans from {earliest.date()} "
        f"to {latest.date()}."
    )

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ai/generate-milestones")
def generate_milestones(req: GenerateMilestonesRequest) -> List[Milestone]:
    if req.selected_workstream_ids:
        target_ws_ids = set(req.selected_workstream_ids)
    else:
        target_ws_ids = {ws.id for ws in req.workstreams}

    new_milestones: List[Milestone] = []
    next_id = 1

    for ws in req.workstreams:
        if ws.id not in target_ws_ids:
            continue

        for i in range(1, 3):
            m = Milestone(
                id=next_id,
                workstreamId=ws.id,
                name=f"{ws.name} – Milestone {i}",
                description=f"Auto-suggested milestone {i} for {ws.name}.",
                startDate=None,
                endDate=None,
            )
            new_milestones.append(m)
            next_id += 1

    return new_milestones


@app.post("/ai/generate-tasks")
def generate_tasks(req: GenerateTasksRequest) -> List[Task]:
    if req.selected_milestone_ids:
        target_ms_ids = set(req.selected_milestone_ids)
    else:
        target_ms_ids = {m.id for m in req.milestones}

    new_tasks: List[Task] = []
    next_id = 1

    for ms in req.milestones:
        if ms.id not in target_ms_ids:
            continue

        for i in range(1, 4):
            t = Task(
                id=next_id,
                milestoneId=ms.id,
                name=f"{ms.name} – Task {i}",
                description=f"Auto-suggested task {i} for milestone {ms.name}.",
                owner="",
                startDate=None,
                endDate=None,
            )
            new_tasks.append(t)
            next_id += 1

    return new_tasks


@app.post("/ai/chat")
def chat(req: ChatRequest):
    import json
    from openai import OpenAI

    client = OpenAI()  # uses OPENAI_API_KEY

    # Format current plan for the model
    ws_text = "\n".join(
        [f"- (id={w.id}) {w.name}: {w.description}" for w in req.workstreams]
    ) or "None"

    ms_text = "\n".join(
        [f"- (id={m.id}, ws={m.workstreamId}) {m.name}: {m.description}" for m in req.milestones]
    ) or "None"

    task_text = "\n".join(
        [f"- (id={t.id}, ms={t.milestoneId}) {t.name}: {t.description}" for t in req.tasks]
    ) or "None"

    timeline_hint = extract_timeline_hints(req.message)
    existing_timeline = summarize_existing_timeline(req.milestones)
    step_context = {1: "Workstreams", 2: "Milestones", 3: "Tasks"}
    current_step = step_context.get(req.active_step, "Unknown")

    milestone_lookup = {ms.id: ms.workstreamId for ms in req.milestones}
    allowed_milestone_ids = set(req.selected_milestone_ids or [])
    allowed_milestone_ws = set(req.selected_workstream_ids or [])
    for ms_id in allowed_milestone_ids:
        ws_id = milestone_lookup.get(ms_id)
        if ws_id is not None:
            allowed_milestone_ws.add(ws_id)
    if not allowed_milestone_ids and allowed_milestone_ws:
        for ms in req.milestones:
            if ms.workstreamId in allowed_milestone_ws:
                allowed_milestone_ids.add(ms.id)

    task_parent_lookup = {t.id: t.milestoneId for t in req.tasks}
    allowed_task_ids = set(req.selected_task_ids or [])
    allowed_task_milestones = set(req.selected_milestone_ids or [])
    for task_id in allowed_task_ids:
        parent_ms = task_parent_lookup.get(task_id)
        if parent_ms is not None:
            allowed_task_milestones.add(parent_ms)
    if not allowed_task_milestones and allowed_milestone_ws:
        for ms_id, ws_id in milestone_lookup.items():
            if ws_id in allowed_milestone_ws:
                allowed_task_milestones.add(ms_id)
    if not allowed_task_milestones:
        allowed_task_milestones = allowed_milestone_ids.copy()

    selection_summary = (
        "Selection focus:\n"
        f"- Workstreams: {format_selection(req.selected_workstream_ids)}\n"
        f"- Milestones: {format_selection(req.selected_milestone_ids)}\n"
        f"- Tasks: {format_selection(req.selected_task_ids)}\n\n"
        f"{describe_selection('Workstreams', req.workstreams, req.selected_workstream_ids)}\n\n"
        f"{describe_selection('Milestones', req.milestones, req.selected_milestone_ids)}\n\n"
        f"{describe_selection('Tasks', req.tasks, req.selected_task_ids)}\n\n"
        f"Current UI context: {current_step}\n"
        "Only modify entities relevant to this context."
    )

    today_text = (
        "Treat today's date as "
        f"{CURRENT_DATE_OVERRIDE.strftime('%B %d, %Y')} "
        f"({CURRENT_DATE_OVERRIDE.isoformat()}). "
    )

    system_prompt = (
        "You are an expert M&A integration consultant. "
        "You refine workstreams, milestones, and tasks.\n\n"
        f"{today_text}\n"
        "IMPORTANT RULES:\n"
        "- If a selection list is provided for a level, you MUST only edit, delete, "
        "or create entries tied to those IDs. Leave every unselected item untouched.\n"
        "- Treat items not in the selection as locked. If the user requests changes to them, respond with a clarifying question asking them to select the right items and make no changes.\n"
        "- If a list is empty (meaning ALL), you may modify the entire set for that level. However, do not add or remove items unless the user explicitly asks for that change.\n"
        "- When workstreams are selected and no milestone selection is provided, you may edit milestones that belong to those workstreams (and only those milestones).\n"
        "- Default to editing the selected milestones/workstreams; add or delete milestones only when the user explicitly requests it.\n"
        "- When removing a selected item, omit it from the returned list instead of describing the deletion.\n"
        "- If no selection is provided but you cannot find the referenced item (by id or name), ask the user for clarification instead of pretending the change happened.\n"
        "- Obey all timeline hints. Align start/end dates with the provided window (e.g., 'starts today' or 'ends in late January'). If you cannot meet the timeframe with available information, ask the user for clarification instead of inventing dates.\n"
        "- Compare any new milestone dates with the existing milestone window summary. Keep new dates within (or immediately adjacent to) the current plan unless the user explicitly expands the schedule.\n"
        "- Respect the current UI context reported below. For example, if the context is \"Milestones\", do not add or mention tasks.\n\n"
        "Return ONLY a JSON object with this shape:\n"
        "{\n"
        '  \"message\": string,\n'
        '  \"updatedWorkstreams\": null or [ { \"id\": int, \"name\": string, \"description\": string } ],\n'
        '  \"updatedMilestones\": null or [\n'
        '      { \"id\": int, \"workstreamId\": int, \"name\": string,\n'
        '        \"description\": string, \"startDate\": string, \"endDate\": string }\n'
        "  ],\n"
        '  \"updatedTasks\": null or [\n'
        '      { \"id\": int, \"milestoneId\": int, \"name\": string,\n'
        '        \"description\": string, \"startDate\": string, \"endDate\": string }\n'
        "  ]\n"
        "}\n"
        "If you do not want to change a level, set that field to null.\n"
        "When creating tasks from milestones, use the milestone ids from the list below "
        "for the milestoneId field.\n"
        "Dates should be in YYYY-MM-DD format.\n"
    )

    user_prompt = (
        "User message:\n"
        f"{req.message}\n\n"
        "Timeline hints:\n"
        f"{timeline_hint or 'None provided.'}\n\n"
        f"Today's date: {CURRENT_DATE_OVERRIDE.strftime('%B %d, %Y')} ({CURRENT_DATE_OVERRIDE.isoformat()})\n"
        f"Existing milestone window:\n{existing_timeline}\n\n"
        f"{selection_summary}\n"
        "Current workstreams:\n"
        f"{ws_text}\n\n"
        "Current milestones:\n"
        f"{ms_text}\n\n"
        "Current tasks:\n"
        f"{task_text}\n"
    )

    system_prompt_ascii = to_ascii(system_prompt)
    user_prompt_ascii = to_ascii(user_prompt)

    try:
        resp = client.chat.completions.create(
            model="gpt-4.1-mini",  # or gpt-3.5-turbo if you prefer
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt_ascii},
                {"role": "user", "content": user_prompt_ascii},
            ],
        )

        raw = resp.choices[0].message.content
        data = json.loads(raw)

        message = data.get("message", "")
        updated_ws = restrict_updates(
            data.get("updatedWorkstreams", None),
            req.selected_workstream_ids,
            req.workstreams,
        )
        updated_ms = restrict_updates(
            data.get("updatedMilestones", None),
            list(allowed_milestone_ids),
            req.milestones,
            list(allowed_milestone_ws),
            milestone_lookup,
        )
        updated_tasks = restrict_updates(
            data.get("updatedTasks", None),
            list(allowed_task_ids),
            req.tasks,
            list(allowed_task_milestones),
            task_parent_lookup,
        )
        if req.active_step == 2:
            updated_tasks = None

        return {
            "role": "assistant",
            "text": message,
            "updatedWorkstreams": updated_ws,
            "updatedMilestones": updated_ms,
            "updatedTasks": updated_tasks,
        }

    except Exception as e:
        print("ERROR in /ai/chat:", repr(e))
        return {
            "role": "assistant",
            "text": "Sorry, something went wrong talking to the AI. Please try again.",
            "updatedWorkstreams": None,
            "updatedMilestones": None,
            "updatedTasks": None,
        }

@app.post("/export/excel")
def export_excel(req: ExportExcelRequest):
    wb = openpyxl.Workbook()

    sheet = wb.active
    sheet.title = "Workplan"
    headers = [
        "ID",
        "Activity Title",
        "Activity Description",
        "Milestone",
        "Owner",
        "Start Date",
        "End Date",
    ]
    sheet.append(headers)

    milestones_by_ws = {}
    for milestone in req.milestones:
        milestones_by_ws.setdefault(milestone.workstreamId, []).append(milestone)

    tasks_by_milestone = {}
    for task in req.tasks:
        tasks_by_milestone.setdefault(task.milestoneId, []).append(task)

    for ws_index, workstream in enumerate(req.workstreams, start=1):
        ws_id = str(ws_index)
        sheet.append([
            ws_id,
            sanitize_text(workstream.name),
            sanitize_text(workstream.description),
            "",
            "",
            "",
            "",
        ])

        milestones = milestones_by_ws.get(workstream.id, [])
        for ms_index, milestone in enumerate(milestones, start=1):
            milestone_id = f"{ws_id}.{ms_index}"
            sheet.append([
                milestone_id,
                sanitize_text(milestone.name),
                sanitize_text(milestone.description),
                True,
                "",
                sanitize_text(milestone.startDate or ""),
                sanitize_text(milestone.endDate or ""),
            ])

            tasks = tasks_by_milestone.get(milestone.id, [])
            for task_index, task in enumerate(tasks, start=1):
                task_id = f"{milestone_id}.{task_index}"
                sheet.append([
                    task_id,
                    sanitize_text(task.name),
                    sanitize_text(task.description),
                    False,
                    sanitize_text(task.owner or ""),
                    sanitize_text(task.startDate or ""),
                    sanitize_text(task.endDate or ""),
                ])

    file_stream = BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    filename = f"workplan_{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/voice/transcribe")
def voice_transcribe():
    return {"message": "Voice transcription endpoint not implemented yet."}
