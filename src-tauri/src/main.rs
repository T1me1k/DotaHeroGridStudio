use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

#[cfg(windows)]
fn replace_existing(target: &Path, replacement: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    extern "system" { fn ReplaceFileW(replaced: *const u16, replacement: *const u16, backup: *const u16, flags: u32, exclude: *const std::ffi::c_void, reserved: *const std::ffi::c_void) -> i32; }
    let dest: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let src: Vec<u16> = replacement.as_os_str().encode_wide().chain(Some(0)).collect();
    let ok = unsafe { ReplaceFileW(dest.as_ptr(), src.as_ptr(), std::ptr::null(), 0, std::ptr::null(), std::ptr::null()) };
    if ok == 0 { Err(std::io::Error::last_os_error().to_string()) } else { Ok(()) }
}
#[cfg(not(windows))]
fn replace_existing(target: &Path, replacement: &Path) -> Result<(), String> { fs::rename(replacement, target).map_err(|e| e.to_string()) }

#[derive(Serialize)]
struct Account { account: String, path: String }

fn steam_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(path) = std::env::var("PROGRAMFILES(X86)") { roots.push(PathBuf::from(path).join("Steam")); }
    if let Ok(path) = std::env::var("PROGRAMFILES") { roots.push(PathBuf::from(path).join("Steam")); }
    if let Ok(path) = std::env::var("LOCALAPPDATA") { roots.push(PathBuf::from(path).join("Steam")); }
    // Other Steam installs can be selected by adding their root here in a future release.
    roots
}

#[tauri::command]
fn find_accounts() -> Result<Vec<Account>, String> {
    let mut accounts = Vec::new();
    for root in steam_roots() {
        let userdata = root.join("userdata");
        let Ok(entries) = fs::read_dir(userdata) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.parse::<u64>().is_err() { continue; }
            let path = entry.path().join("570").join("remote").join("cfg").join("hero_grid_config.json");
            if path.exists() { accounts.push(Account { account: name, path: path.to_string_lossy().to_string() }); }
        }
    }
    accounts.sort_by(|a,b| a.path.cmp(&b.path)); accounts.dedup_by(|a,b| a.path == b.path);
    Ok(accounts)
}

fn validate_grid(grid: &Value) -> Result<(), String> {
    if grid.get("config_name").and_then(Value::as_str).is_none() { return Err("config_name required".into()); }
    let cats = grid.get("categories").and_then(Value::as_array).ok_or("categories required")?;
    for (i, cat) in cats.iter().enumerate() {
        if cat.get("category_name").and_then(Value::as_str).is_none() { return Err(format!("categories[{i}].category_name invalid")); }
        for field in ["x_position", "y_position", "width", "height"] {
            let n = cat.get(field).and_then(Value::as_f64).ok_or_else(|| format!("categories[{i}].{field} invalid"))?;
            if !n.is_finite() || ((field == "width" || field == "height") && n < 0.) { return Err(format!("categories[{i}].{field} invalid")); }
        }
        if !cat.get("hero_ids").and_then(Value::as_array).is_some_and(|a| a.iter().all(|v| v.as_u64().is_some_and(|n| n > 0))) { return Err(format!("categories[{i}].hero_ids invalid")); }
    }
    Ok(())
}

fn allowed_path(path: &Path) -> Result<(), String> {
    if path.file_name().and_then(|v| v.to_str()) != Some("hero_grid_config.json") { return Err("Invalid target file".into()); }
    let parent = path.parent().ok_or("Missing parent")?.canonicalize().map_err(|e| e.to_string())?;
    let mut matched = false;
    for root in steam_roots() {
        let Ok(userdata) = root.join("userdata").canonicalize() else { continue; };
        if let Ok(suffix) = parent.strip_prefix(userdata) {
            let parts: Vec<_> = suffix.iter().map(|v| v.to_string_lossy().to_string()).collect();
            if parts.len() == 4 && parts[0].parse::<u64>().is_ok() && parts[1] == "570" && parts[2] == "remote" && parts[3] == "cfg" { matched = true; }
        }
    }
    if matched && path.is_file() { Ok(()) } else { Err("Target is not an existing Steam Hero Grid file".into()) }
}

#[tauri::command]
fn install_grid(path: String, grid: Value) -> Result<String, String> {
    let target = PathBuf::from(path);
    allowed_path(&target)?;
    validate_grid(&grid)?;
    if std::process::Command::new("tasklist").args(["/FI", "IMAGENAME eq dota2.exe", "/NH"]).output().ok().is_some_and(|o| String::from_utf8_lossy(&o.stdout).to_ascii_lowercase().contains("dota2.exe")) { return Err("Close Dota 2 before installation".into()); }
    let original = fs::read(&target).map_err(|e| e.to_string())?;
    let mut data: Value = serde_json::from_slice(&original).map_err(|e| format!("Existing file is invalid: {e}"))?;
    let configs = data.get_mut("configs").and_then(Value::as_array_mut).ok_or("Existing configs missing")?;
    let mut incoming = grid;
    let name = incoming["config_name"].as_str().unwrap_or("My grid").to_string();
    let mut candidate = name.clone(); let mut i = 2;
    while configs.iter().any(|c| c.get("config_name").and_then(Value::as_str) == Some(&candidate)) { candidate = format!("{name} ({i})"); i += 1; }
    incoming["config_name"] = json!(candidate);
    configs.push(incoming);
    let output = serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?;
    let base = target.parent().ok_or("Missing parent")?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let backup_dir = base.join("DotaHeroGridStudio_backups"); fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let backup = backup_dir.join(format!("hero_grid_config_{stamp}.json"));
    fs::write(&backup, &original).map_err(|e| format!("Backup failed: {e}"))?;
    let temp = base.join(format!("hero_grid_config.{stamp}.tmp"));
    fs::write(&temp, output).map_err(|e| e.to_string())?;
    if let Err(e) = replace_existing(&target, &temp) { let _ = fs::remove_file(&temp); return Err(format!("Install failed ({e}); original file and backup are intact")); }
    Ok(format!("Installed '{candidate}'. Backup: {}", backup.display()))
}

fn main() { tauri::Builder::default().invoke_handler(tauri::generate_handler![find_accounts, install_grid]).run(tauri::generate_context!()).expect("Tauri startup failed"); }
