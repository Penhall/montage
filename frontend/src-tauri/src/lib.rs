use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

// ── Types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: String,
    pub email: String,
    pub tier: String,
    pub videos_this_month: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub user: Option<User>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateJobRequest {
    pub title: String,
    pub topic: Option<String>,
    pub duration: i32,
    pub platform: String,
    pub style: String,
    pub pipeline: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JobStatus {
    pub id: String,
    pub status: String,
    pub progress: i32,
    pub title: String,
    pub created_at: String,
    pub result_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackendStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub port: u16,
}

// ── Database ─────────────────────────────────────────────────────────

pub struct DbState {
    pub conn: Mutex<Connection>,
}

fn get_db_path() -> PathBuf {
    let mut path = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    path.push("montage.db");
    path
}

fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".local").join("share"))
    }
}

fn init_database(conn: &Connection) {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            tier TEXT NOT NULL DEFAULT 'free',
            videos_this_month INTEGER NOT NULL DEFAULT 0,
            reset_at TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            params TEXT NOT NULL,
            script TEXT,
            progress INTEGER NOT NULL DEFAULT 0,
            result_path TEXT,
            thumbnail_path TEXT,
            duration_s INTEGER,
            error TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            file_path TEXT NOT NULL,
            thumbnail_path TEXT,
            duration_s INTEGER,
            platform_profile TEXT,
            style_playbook TEXT,
            size_bytes INTEGER,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        ",
    )
    .expect("Failed to initialize database");
}

fn seed_users(conn: &Connection) {
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);

    if count > 0 {
        return;
    }

    let users = vec![
        ("admin@montage.local", "Admin!234", "admin"),
        ("tester@montage.local", "Test!234", "free"),
    ];

    for (email, password, tier) in users {
        let id = Uuid::new_v4().to_string();
        let hash = bcrypt::hash(password, 10).expect("bcrypt hash failed");
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO users (id, email, password_hash, tier, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, email, hash, tier, now],
        )
        .expect("Failed to seed user");

        log::info!("Seeded user: {} (tier: {})", email, tier);
    }
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[tauri::command]
fn login(
    state: State<DbState>,
    request: LoginRequest,
) -> Result<LoginResponse, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, email, password_hash, tier, videos_this_month, created_at FROM users WHERE email = ?1",
        params![request.email],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, String>(5)?,
            ))
        },
    );

    match result {
        Ok((id, email, hash, tier, videos, created_at)) => {
            if bcrypt::verify(&request.password, &hash).unwrap_or(false) {
                Ok(LoginResponse {
                    success: true,
                    user: Some(User { id, email, tier, videos_this_month: videos, created_at }),
                    error: None,
                })
            } else {
                Ok(LoginResponse {
                    success: false,
                    user: None,
                    error: Some("Invalid password".into()),
                })
            }
        }
        Err(_) => Ok(LoginResponse {
            success: false,
            user: None,
            error: Some("User not found".into()),
        }),
    }
}

#[tauri::command]
fn get_user(state: State<DbState>, user_id: String) -> Result<Option<User>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, email, tier, videos_this_month, created_at FROM users WHERE id = ?1",
        params![user_id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                tier: row.get(2)?,
                videos_this_month: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    );

    match result {
        Ok(user) => Ok(Some(user)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn create_job(
    state: State<DbState>,
    user_id: String,
    request: CreateJobRequest,
) -> Result<JobStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Check tier limits
    let tier: String = conn
        .query_row(
            "SELECT tier FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|_| "User not found".to_string())?;

    let used: i32 = conn
        .query_row(
            "SELECT videos_this_month FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let limit: i32 = if tier == "pro" { 999 } else { 3 };
    if used >= limit {
        return Err(format!("Tier limit reached: {}/{} videos this month", used, limit));
    }

    let job_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let params_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO jobs (id, user_id, status, params, created_at) VALUES (?1, ?2, 'pending', ?3, ?4)",
        params![job_id, user_id, params_json, now],
    )
    .map_err(|e| e.to_string())?;

    // Increment usage
    conn.execute(
        "UPDATE users SET videos_this_month = videos_this_month + 1 WHERE id = ?1",
        params![user_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(JobStatus {
        id: job_id,
        status: "pending".into(),
        progress: 0,
        title: request.title.clone(),
        created_at: now,
        result_path: None,
    })
}

#[tauri::command]
fn list_jobs(state: State<DbState>, user_id: String) -> Result<Vec<JobStatus>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, status, progress, json_extract(params, '$.title'), created_at, result_path FROM jobs WHERE user_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![user_id], |row| {
            Ok(JobStatus {
                id: row.get(0)?,
                status: row.get(1)?,
                progress: row.get(2)?,
                title: row.get::<_, String>(3).unwrap_or_default(),
                created_at: row.get(4)?,
                result_path: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut jobs = Vec::new();
    for row in rows {
        jobs.push(row.map_err(|e| e.to_string())?);
    }
    Ok(jobs)
}

#[tauri::command]
fn list_videos(
    state: State<DbState>,
    user_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, job_id, title, file_path, thumbnail_path, duration_s, platform_profile, style_playbook, size_bytes, created_at FROM videos WHERE user_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![user_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "job_id": row.get::<_, String>(1)?,
                "title": row.get::<_, String>(2)?,
                "file_path": row.get::<_, String>(3)?,
                "thumbnail_path": row.get::<_, String>(4)?,
                "duration_s": row.get::<_, i32>(5)?,
                "platform_profile": row.get::<_, String>(6)?,
                "style_playbook": row.get::<_, String>(7)?,
                "size_bytes": row.get::<_, i32>(8)?,
                "created_at": row.get::<_, String>(9)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut videos = Vec::new();
    for row in rows {
        videos.push(row.map_err(|e| e.to_string())?);
    }
    Ok(videos)
}

#[tauri::command]
fn run_pipeline(
    state: State<DbState>,
    job_id: String,
) -> Result<String, String> {
    // Mark job as processing
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE jobs SET status = 'processing' WHERE id = ?1",
        params![job_id],
    )
    .map_err(|e| e.to_string())?;

    // Launch Python backend pipeline
    let backend_path = std::env::current_dir()
        .unwrap_or_default()
        .parent()
        .map(|p| p.join("backend"))
        .unwrap_or_default();

    // Run in background
    std::thread::spawn(move || {
        let output = std::process::Command::new("python3")
            .arg("-m")
            .arg("backend.pipeline.engine")
            .arg("--job-id")
            .arg(&job_id)
            .current_dir(backend_path.parent().unwrap_or(&backend_path))
            .output();

        match output {
            Ok(o) => {
                log::info!(
                    "Pipeline {} completed: {}",
                    job_id,
                    String::from_utf8_lossy(&o.stdout)
                );
            }
            Err(e) => {
                log::error!("Pipeline {} failed: {}", job_id, e);
            }
        }
    });

    Ok(job_id)
}

#[tauri::command]
fn get_app_data_dir() -> Result<String, String> {
    let path = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn check_backend_health() -> Result<BackendStatus, String> {
    // Check if Python backend is running on port 8000
    match std::net::TcpStream::connect("127.0.0.1:8000") {
        Ok(_) => Ok(BackendStatus {
            running: true,
            pid: None,
            port: 8000,
        }),
        Err(_) => Ok(BackendStatus {
            running: false,
            pid: None,
            port: 8000,
        }),
    }
}

// ── App Setup ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = get_db_path();
    log::info!("Database path: {:?}", db_path);

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path).expect("Failed to open database");
    init_database(&conn);
    seed_users(&conn);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(DbState {
            conn: Mutex::new(conn),
        })
        .invoke_handler(tauri::generate_handler![
            login,
            get_user,
            create_job,
            list_jobs,
            list_videos,
            run_pipeline,
            get_app_data_dir,
            check_backend_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
