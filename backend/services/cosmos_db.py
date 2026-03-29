from azure.cosmos import CosmosClient
import datetime
from azure.cosmos.exceptions import CosmosHttpResponseError
from config import (
    COSMOS_ENDPOINT,
    COSMOS_KEY,
    COSMOS_DATABASE,
    COSMOS_CONTAINER,
    COSMOS_CONTAINER_USERS,
    COSMOS_CONTAINER_DNA,
    COSMOS_CONTAINER_STRESS,
    COSMOS_CONTAINER_TOPIC_GRAPHS,
    COSMOS_CONTAINER_SIGNALS,
    COSMOS_CONTAINER_VIDEO_SUMMARY,
)

client   = CosmosClient(COSMOS_ENDPOINT, COSMOS_KEY)
database = client.get_database_client(COSMOS_DATABASE)


# ── Containers ────────────────────────────────────────────────
notes_container  = database.get_container_client(COSMOS_CONTAINER)
users_container  = database.get_container_client(COSMOS_CONTAINER_USERS)
dna_container    = database.get_container_client(COSMOS_CONTAINER_DNA)
stress_container = database.get_container_client(COSMOS_CONTAINER_STRESS)
topic_graphs_container = database.get_container_client(COSMOS_CONTAINER_TOPIC_GRAPHS)
signals_container = database.get_container_client(COSMOS_CONTAINER_SIGNALS)
summaries_container = database.get_container_client(COSMOS_CONTAINER_VIDEO_SUMMARY)


# ══════════════════════════════════════════════════════════════
#  Video Summaries
# ══════════════════════════════════════════════════════════════

def _sanitize_for_cosmos(obj):
    """Recursively cleans data for Cosmos DB compatibility."""
    if isinstance(obj, dict):
        return {str(k): _sanitize_for_cosmos(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_cosmos(i) for i in obj]
    if isinstance(obj, str) and len(obj) > 30000:
        return obj[:30000] + "… [truncated]"
    return obj

def save_video_summary(summary_data: dict, user_id: str):
    import copy, json
    doc = copy.deepcopy(summary_data)
    video_id = doc.get("video_id", "unknown")
    doc["id"]      = f"{user_id}_{video_id}"
    doc["user_id"] = user_id
    doc["type"]    = "video_summary"
    doc = _sanitize_for_cosmos(doc)
    try:
        json.dumps(doc)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Summary data is not JSON-serializable: {e}")
    print(f"[CosmosDB] Saving video summary: id={doc['id']}, user={user_id}")
    result = summaries_container.upsert_item(doc)
    print(f"[CosmosDB] ✓ Saved successfully: id={doc['id']}")
    return result

def get_summaries_by_user(user_id: str, limit: int = 10):
    """Fetches history of summaries for a specific user."""
    query = "SELECT * FROM c WHERE c.user_id=@user_id AND c.type=@type"
    items = list(summaries_container.query_items(
        query=query,
        parameters=[
            {"name": "@user_id", "value": user_id},
            {"name": "@type",    "value": "video_summary"},
        ],
        enable_cross_partition_query=True,
    ))
    items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return items[:limit]
# ══════════════════════════════════════════════════════════════
#  Notes
# ══════════════════════════════════════════════════════════════

def create_note(note_data: dict):
    return notes_container.create_item(note_data)


def get_note(note_id: str):
    query = "SELECT * FROM c WHERE c.id=@id"
    items = list(notes_container.query_items(
        query=query,
        parameters=[{"name": "@id", "value": note_id}],
        enable_cross_partition_query=True,
    ))
    return items[0] if items else None


def update_note(note_id: str, updated_fields: dict):
    existing = get_note(note_id)
    if not existing:
        return None
    existing.update(updated_fields)                     # Update is a method of dict. Only updates existing variable (add a key if not already present), Not the database stored on Azure
    return notes_container.upsert_item(existing)        # upsert_items is from CosmosClient. Updates if same id exists else create new


def delete_note(note_id: str):
    existing = get_note(note_id)
    if not existing:
        return False

    candidate_keys = [
        existing.get("id"),
        existing.get("user_id"),
        existing.get("partitionKey"),
        existing.get("pk"),
        existing.get("subject"),
        None,
    ]

    seen = set()
    for partition_key in candidate_keys:
        marker = repr(partition_key)
        if marker in seen:
            continue
        seen.add(marker)
        try:
            notes_container.delete_item(item=existing["id"], partition_key=partition_key)
            return True
        except CosmosHttpResponseError:
            continue

    raise RuntimeError(f"Unable to delete note {note_id}; partition key did not match.")


def get_all_notes():
    items = list(notes_container.query_items(
        query="SELECT * FROM c",
        enable_cross_partition_query=True,
    ))
    return items


def get_recent_sessions(user_id: str, limit: int = 10) -> list:
    query = "SELECT * FROM c WHERE c.user_id=@user_id"
    items = list(notes_container.query_items(
        query=query,
        parameters=[{"name": "@user_id", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return items[:limit]


# ══════════════════════════════════════════════════════════════
#  Users
# ══════════════════════════════════════════════════════════════

def create_user(user_data: dict):
    return users_container.create_item(user_data)


def get_user_by_email(email: str) -> dict:
    query = "SELECT * FROM c WHERE c.email=@email"
    items = list(users_container.query_items(
        query=query,
        parameters=[{"name": "@email", "value": email}],
        enable_cross_partition_query=True,
    ))
    return items[0] if items else None


def get_user_by_id(user_id: str) -> dict:
    query = "SELECT * FROM c WHERE c.id=@id"
    items = list(users_container.query_items(
        query=query,
        parameters=[{"name": "@id", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    return items[0] if items else None


def update_user(user_id: str, updated_fields: dict):
    existing = get_user_by_id(user_id)
    if not existing:
        return None
    existing.update(updated_fields)
    return users_container.upsert_item(existing)


# ══════════════════════════════════════════════════════════════
#  Study DNA
# ══════════════════════════════════════════════════════════════

def upsert_study_dna(user_id: str, dna_data: dict):
    dna_container.upsert_item({
        "id"     : f"dna_{user_id}",
        "user_id": user_id,
        **dna_data,
    })


def get_study_dna(user_id: str) -> dict:
    query = "SELECT * FROM c WHERE c.user_id=@uid"
    items = list(dna_container.query_items(
        query=query,
        parameters=[{"name": "@uid", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    return items[0] if items else None


# ══════════════════════════════════════════════════════════════
#  Stress Logs
# ══════════════════════════════════════════════════════════════

def save_stress_log(user_id: str, stress_data: dict):
    import time
    stress_container.upsert_item({
        "id"     : f"stress_{user_id}_{int(time.time() * 1000)}",
        "user_id": user_id,
        **stress_data,
    })


def get_latest_stress(user_id: str) -> dict:
    query = "SELECT * FROM c WHERE c.user_id=@uid"
    items = list(stress_container.query_items(
        query=query,
        parameters=[{"name": "@uid", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    if not items:
        return None
    items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return items[0]


def get_stress_logs_by_user(user_id: str, limit: int = 50) -> list:
    query = "SELECT * FROM c WHERE c.user_id=@uid"
    items = list(stress_container.query_items(
        query=query,
        parameters=[{"name": "@uid", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return items[:limit]

def get_notes_by_user(user_id: str) -> list:
    query = "SELECT * FROM c WHERE c.user_id=@user_id"
    items = list(notes_container.query_items(
        query=query,
        parameters=[{"name": "@user_id", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return items


# ==============================================================
#  Topic Graphs
# ==============================================================

def create_topic_graph(topic_graph_data: dict):
    return topic_graphs_container.create_item(topic_graph_data)


def get_topic_graph(graph_id: str, user_id: str = None):
    query = "SELECT * FROM c WHERE c.id=@id"
    parameters = [{"name": "@id", "value": graph_id}]

    if user_id:
        query += " AND c.user_id=@user_id"
        parameters.append({"name": "@user_id", "value": user_id})

    items = list(topic_graphs_container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True,
    ))
    return items[0] if items else None


def get_topic_graphs_by_user(user_id: str) -> list:
    query = "SELECT * FROM c WHERE c.user_id=@user_id"
    items = list(topic_graphs_container.query_items(
        query=query,
        parameters=[{"name": "@user_id", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return items


def get_orphan_topic_graphs() -> list:
    items = list(topic_graphs_container.query_items(
        query="SELECT * FROM c WHERE NOT IS_DEFINED(c.user_id) OR IS_NULL(c.user_id)",
        enable_cross_partition_query=True,
    ))
    items.sort(key=lambda x: x.get("_ts", 0), reverse=True)
    return items


def update_topic_graph(graph_id: str, updated_fields: dict, user_id: str = None):
    existing = get_topic_graph(graph_id, user_id=user_id)
    if not existing:
        return None
    existing.update(updated_fields)
    return topic_graphs_container.upsert_item(existing)


def delete_topic_graph(graph_id: str, user_id: str = None):
    existing = get_topic_graph(graph_id, user_id=user_id)
    if not existing:
        return False

    candidate_keys = [
        existing.get("id"),
        existing.get("user_id"),
        existing.get("partitionKey"),
        existing.get("pk"),
        existing.get("subject"),
        None,
    ]

    seen = set()
    for partition_key in candidate_keys:
        marker = repr(partition_key)
        if marker in seen:
            continue
        seen.add(marker)
        try:
            topic_graphs_container.delete_item(item=existing["id"], partition_key=partition_key)
            return True
        except CosmosHttpResponseError:
            continue

    raise RuntimeError(f"Unable to delete topic graph {graph_id}; partition key did not match.")

# ══════════════════════════════════════════════════════════════
#  Signals  — persistent per-user signal store
# ══════════════════════════════════════════════════════════════

def get_signals(user_id: str) -> dict:
    """Fetch accumulated signals document for user."""
    query = "SELECT * FROM c WHERE c.user_id=@uid"
    items = list(signals_container.query_items(
        query=query,
        parameters=[{"name": "@uid", "value": user_id}],
        enable_cross_partition_query=True,
    ))
    return items[0] if items else None


def upsert_signals_document(signals_data: dict) -> dict:
    now_iso = datetime.datetime.utcnow().isoformat()
    signals_data["last_activity_at"] = now_iso
    signals_data["last_updated"] = now_iso
    signals_container.upsert_item(signals_data)
    return signals_data


def merge_signals(user_id: str, new_signals: dict) -> dict:
    """
    Merge new signals into existing Cosmos document.
    Cumulative fields are added together.
    Average fields are recalculated as rolling averages.
    """
    existing = get_signals(user_id) or {
        "id"                 : f"signals_{user_id}",
        "user_id"            : user_id,
        "audio_replays"      : 0,
        "quiz_attempts"      : 0,
        "avg_quiz_score"     : 50.0,
        "notes_viewed"       : 0,
        "heatmap_views"      : 0,
        "red_zone_clicks"    : 0,
        "login_streak"       : 0,
        "days_since_last"    : 1,
        "total_study_minutes": 0,
        "quiz_retry_rate"    : 0.0,
        "quiz_improvement"   : 0.0,
        "time_on_explanation": 0.0,
        "upload_count"       : 0,
        "reread_count"       : 0,
        "session_events"     : [],
        "daily_study_minutes": {},
        "reread_events"      : [],
    }

    # ── Cumulative — add together ─────────────────────────────
    for field in [
        "audio_replays", "notes_viewed", "heatmap_views",
        "red_zone_clicks", "total_study_minutes",
    ]:
        existing[field] = existing.get(field, 0) + new_signals.get(field, 0)

    existing["reread_count"] = (
        existing.get("reread_count", 0) + new_signals.get("reread_count", 0)
    )

    if new_signals.get("reread_at"):
        reread_events = list(existing.get("reread_events", []))
        reread_events.append(new_signals["reread_at"])
        existing["reread_events"] = reread_events[-500:]

    # ── quiz_attempts — lifetime total ────────────────────────
    existing["quiz_attempts"] = (
        existing.get("quiz_attempts", 0) + new_signals.get("quiz_attempts", 0)
    )

    # ── Max — keep highest streak ─────────────────────────────
    existing["login_streak"] = max(
        existing.get("login_streak", 0),
        new_signals.get("login_streak", 0),
    )

    # ── Latest value — always overwrite ──────────────────────
    existing["days_since_last"] = new_signals.get(
        "days_since_last", existing.get("days_since_last", 1)
    )

    # ── Rolling averages ──────────────────────────────────────
    n = existing.get("upload_count", 0)

    def rolling_avg(old_val, new_val, n):
        if new_val is None:
            return old_val
        if n == 0:
            return round(float(new_val), 2)
        return round(((float(old_val) * n) + float(new_val)) / (n + 1), 2)

    existing["avg_quiz_score"]     = rolling_avg(existing.get("avg_quiz_score",     50),  new_signals.get("avg_quiz_score"),     n)
    existing["quiz_retry_rate"]    = rolling_avg(existing.get("quiz_retry_rate",     0.0), new_signals.get("quiz_retry_rate"),    n)
    existing["quiz_improvement"]   = rolling_avg(existing.get("quiz_improvement",   0.0), new_signals.get("quiz_improvement"),   n)
    existing["time_on_explanation"]= rolling_avg(existing.get("time_on_explanation", 0.0), new_signals.get("time_on_explanation"),n)

    study_delta = float(new_signals.get("total_study_minutes", 0) or 0)
    study_day = new_signals.get("study_day") or datetime.datetime.utcnow().date().isoformat()
    daily_study_minutes = dict(existing.get("daily_study_minutes", {}))
    daily_study_minutes[study_day] = round(
        float(daily_study_minutes.get(study_day, 0)) + study_delta,
        2,
    )
    existing["daily_study_minutes"] = daily_study_minutes

    # ── Increment upload count ────────────────────────────────
    upload_delta = int(new_signals.get("upload_count_delta", 0) or 0)
    if "upload_count" in new_signals:
        upload_delta = int(new_signals.get("upload_count", 0) or 0)
    existing["upload_count"]  = existing.get("upload_count", 0) + upload_delta
    existing["last_updated"]  = datetime.datetime.utcnow().isoformat()

    signals_container.upsert_item(existing)
    return existing
