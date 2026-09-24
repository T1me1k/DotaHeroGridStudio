use serde::Serialize;
use serde_json::{json, Value};
use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
const MAX_BYTES: u64 = 32 * 1024 * 1024;
#[derive(Serialize)]
pub struct Backup { pub name: String, pub bytes: u64 }
#[derive(Serialize)]
pub struct InstallResult { pub name: String, pub backup: String, pub categories: usize }
struct Lock(PathBuf);
impl Drop for Lock { fn drop(&mut self) { let _ = fs::remove_file(&self.0); } }
fn lock(target: &Path) -> Result<Lock, String> {
    let path = target.with_extension("studio-lock");
    OpenOptions::new().create_new(true).write(true).open(&path).map_err(|e| format!("Another operation is active or a stale .studio-lock exists: {e}"))?;
    Ok(Lock(path))
}
fn stamp() -> String { format!("{}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(), std::process::id()) }
pub fn validate_grid(grid: &Value) -> Result<(), String> {
    if grid.get("config_name").and_then(Value::as_str).is_none() { return Err("config_name required".into()); }
    let cats = grid.get("categories").and_then(Value::as_array).ok_or("categories required")?;
    if cats.len() > 10000 { return Err("Maximum 10,000 categories per config".into()); }
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
pub fn validate_file(value: &Value) -> Result<(), String> {
    if value.get("version").and_then(Value::as_u64).is_none() { return Err("version must be a nonnegative integer".into()); }
    for c in value.get("configs").and_then(Value::as_array).ok_or("configs missing")? { validate_grid(c)?; }
    Ok(())
}
fn read_regular(path: &Path) -> Result<Vec<u8>, String> {
    let meta=fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.file_type().is_file() || meta.len() > MAX_BYTES { return Err("File must be regular and at most 32 MB".into()); }
    fs::read(path).map_err(|e| e.to_string())
}
fn snapshot(target: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::symlink_metadata(target) { Ok(_) => Ok(Some(read_regular(target)?)), Err(e) if e.kind()==std::io::ErrorKind::NotFound => Ok(None), Err(e)=>Err(e.to_string()) }
}
fn durable_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file=OpenOptions::new().write(true).create_new(true).open(path).map_err(|e|e.to_string())?;
    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e|e.to_string())
}
#[cfg(windows)]
fn atomic_replace(target: &Path, temp: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name="kernel32")]
    extern "system" { fn MoveFileExW(from:*const u16,to:*const u16,flags:u32)->i32; }
    let dest:Vec<u16>=target.as_os_str().encode_wide().chain(Some(0)).collect();
    let src:Vec<u16>=temp.as_os_str().encode_wide().chain(Some(0)).collect();
    // Same-directory rename; REPLACE_EXISTING | WRITE_THROUGH. No delete gap.
    if unsafe { MoveFileExW(src.as_ptr(),dest.as_ptr(),1|8) }==0 { Err(std::io::Error::last_os_error().to_string()) } else { Ok(()) }
}
#[cfg(not(windows))]
fn atomic_replace(target:&Path,temp:&Path)->Result<(),String>{fs::rename(temp,target).map_err(|e|e.to_string())}
fn backup_dir(target:&Path)->Result<PathBuf,String>{
    let dir=target.parent().ok_or("No parent")?.join("DotaHeroGridStudio_backups");
    if dir.exists() && fs::symlink_metadata(&dir).map_err(|e|e.to_string())?.file_type().is_symlink(){return Err("Backup directory cannot be a symlink".into());}
    Ok(dir)
}
pub fn list(target:&Path)->Result<Vec<Backup>,String>{
    let dir=backup_dir(target)?;let mut result=Vec::new();if !dir.exists(){return Ok(result);}
    for entry in fs::read_dir(dir).map_err(|e|e.to_string())?.flatten(){let name=entry.file_name().to_string_lossy().to_string();let m=entry.file_type().map_err(|e|e.to_string())?;
        if m.is_file() && name.starts_with("grid-") && name.ends_with(".json"){result.push(Backup{name,bytes:entry.metadata().map_err(|e|e.to_string())?.len()});}}
    result.sort_by(|a,b|b.name.cmp(&a.name));Ok(result)
}
fn write_with_backup(target:&Path,expected:&Option<Vec<u8>>,output:&[u8],keep:usize)->Result<String,String>{
    if !(1..=200).contains(&keep){return Err("Backup retention must be 1..200".into());}
    if output.len() as u64>MAX_BYTES{return Err("Output exceeds 32 MB".into());}
    let dir=backup_dir(target)?;fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let name=format!("grid-{}.json",stamp());let backup=dir.join(&name);
    let empty=b"{\"version\":3,\"configs\":[]}";
    durable_new(&backup,expected.as_deref().unwrap_or(empty))?;
    let temp=target.with_extension(format!("{}.tmp",stamp()));
    let operation=(||{durable_new(&temp,output)?;if &snapshot(target)?!=expected{return Err("Grid changed during operation; retry after closing Dota and Steam cloud sync".into());}atomic_replace(target,&temp)})();
    if operation.is_err(){let _=fs::remove_file(&temp);}operation?;
    // Cleanup is best-effort and never turns a successful install into a failure.
    if let Ok(backups)=list(target){for b in backups.into_iter().skip(keep){let _=fs::remove_file(dir.join(b.name));}}
    Ok(name)
}
pub fn install(target:&Path,grid:Value,keep:usize)->Result<InstallResult,String>{install_mode(target,grid,keep,false)}
pub fn install_mode(target:&Path,mut grid:Value,keep:usize,test:bool)->Result<InstallResult,String>{
    if test { grid["config_name"]=json!("DHGS TEST"); }
    validate_grid(&grid)?;let _lock=lock(target)?;let original=snapshot(target)?;
    let mut root:Value=match &original{Some(b)=>serde_json::from_slice(b).map_err(|e|format!("Existing JSON invalid: {e}"))?,None=>json!({"version":3,"configs":[]})};
    validate_file(&root)?;
    let configs=root["configs"].as_array_mut().ok_or("configs missing")?;
    let name=grid["config_name"].as_str().ok_or("name missing")?.to_string();let mut candidate=name.clone();let mut n=2;
    while !test && configs.iter().any(|c|c["config_name"].as_str()==Some(candidate.as_str())){candidate=format!("{name} ({n})");n+=1;}
    grid["config_name"]=json!(candidate);let categories=grid["categories"].as_array().unwrap().len();
    if test { let position=configs.iter().position(|c|c["config_name"].as_str()==Some("DHGS TEST")).unwrap_or(configs.len());configs.retain(|c|c["config_name"].as_str()!=Some("DHGS TEST"));configs.insert(position.min(configs.len()),grid); }
    else { configs.push(grid); }
    let out=serde_json::to_vec_pretty(&root).map_err(|e|e.to_string())?;
    let backup=write_with_backup(target,&original,&out,keep)?;Ok(InstallResult{name:candidate,backup,categories})
}
pub fn restore(target:&Path,name:&str,keep:usize)->Result<String,String>{
    if !name.starts_with("grid-") || !name.ends_with(".json") || name.contains('/') || name.contains('\\') || name.contains("..") {return Err("Invalid backup name".into());}
    let _lock=lock(target)?;let backup=read_regular(&backup_dir(target)?.join(name))?;
    let root:Value=serde_json::from_slice(&backup).map_err(|e|e.to_string())?;validate_file(&root)?;
    let original=snapshot(target)?;write_with_backup(target,&original,&backup,keep)
}
pub fn read_text(target:&Path)->Result<String,String>{match snapshot(target)?{Some(bytes)=>String::from_utf8(bytes).map_err(|e|e.to_string()),None=>Ok("{\"version\":3,\"configs\":[]}".into())}}
pub fn writable(target:&Path)->Result<(),String>{let temp=target.with_extension(format!("{}.probe",stamp()));let result=durable_new(&temp,b"probe");let _=fs::remove_file(temp);result}
pub fn recover(target:&Path,expected:&str,recovered:Value,keep:usize)->Result<String,String>{
    validate_file(&recovered)?;let _lock=lock(target)?;let original=snapshot(target)?;
    if original.as_deref()!=Some(expected.as_bytes()){return Err("Файл изменился после предварительного восстановления; перечитайте его".into());}
    if let Ok(v)=serde_json::from_str::<Value>(expected){if validate_file(&v).is_ok(){return Err("Исходный файл исправен; используйте обычное открытие".into());}}
    let out=serde_json::to_vec_pretty(&recovered).map_err(|e|e.to_string())?;write_with_backup(target,&original,&out,keep)
}
#[cfg(test)]
mod tests {
 use super::*;
 struct Temp(PathBuf);impl Drop for Temp{fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
 fn temp()->Temp{let p=std::env::temp_dir().join(format!("dotagrid-test-{}",stamp()));fs::create_dir_all(&p).unwrap();Temp(p)}
 fn grid()->Value{json!({"config_name":"Art","categories":[{"category_name":"#","x_position":10,"y_position":20,"width":0,"height":0,"hero_ids":[]}]})}
 #[test]fn text_without_heroes_is_valid(){assert!(validate_grid(&grid()).is_ok());}
 #[test]fn creates_missing_config_and_initial_backup(){let d=temp();let p=d.0.join("hero_grid_config.json");install(&p,grid(),20).unwrap();let v:Value=serde_json::from_slice(&fs::read(p).unwrap()).unwrap();assert_eq!(v["configs"].as_array().unwrap().len(),1);}
 #[test]fn merges_renames_and_restores(){let d=temp();let p=d.0.join("hero_grid_config.json");install(&p,grid(),20).unwrap();let before=fs::read(&p).unwrap();let added=install(&p,grid(),20).unwrap();assert_eq!(added.name,"Art (2)");restore(&p,&added.backup,20).unwrap();assert_eq!(fs::read(&p).unwrap(),before);}
 #[test]fn malformed_original_not_touched(){let d=temp();let p=d.0.join("hero_grid_config.json");fs::write(&p,b"bad json").unwrap();assert!(install(&p,grid(),20).is_err());assert_eq!(fs::read(&p).unwrap(),b"bad json");}
 #[test]fn unknown_fields_and_retention_survive(){let d=temp();let p=d.0.join("hero_grid_config.json");fs::write(&p,b"{\"version\":3,\"extra\":42,\"configs\":[]}").unwrap();for _ in 0..4{install(&p,grid(),2).unwrap();}let v:Value=serde_json::from_slice(&fs::read(&p).unwrap()).unwrap();assert_eq!(v["extra"],42);assert_eq!(list(&p).unwrap().len(),2);}
 #[test]fn rejects_traversal_and_invalid_backup(){let d=temp();let p=d.0.join("hero_grid_config.json");assert!(restore(&p,"../outside.json",20).is_err());install(&p,grid(),20).unwrap();fs::write(backup_dir(&p).unwrap().join("grid-bad.json"),b"{}").unwrap();assert!(restore(&p,"grid-bad.json",20).is_err());}
 #[test]fn lock_prevents_concurrent_write(){let d=temp();let p=d.0.join("hero_grid_config.json");let _l=lock(&p).unwrap();assert!(install(&p,grid(),20).is_err());}
 #[test]fn test_install_replaces_only_named_test_grid(){let d=temp();let p=d.0.join("hero_grid_config.json");install(&p,grid(),20).unwrap();for _ in 0..3{install_mode(&p,grid(),20,true).unwrap();}let v:Value=serde_json::from_slice(&fs::read(&p).unwrap()).unwrap();assert_eq!(v["configs"].as_array().unwrap().len(),2);assert_eq!(v["configs"][0]["config_name"],"Art");assert_eq!(v["configs"][1]["config_name"],"DHGS TEST");}
 #[test]fn recovery_backs_up_raw_and_rejects_stale_preview(){let d=temp();let p=d.0.join("hero_grid_config.json");fs::write(&p,b"damaged").unwrap();let recovered=json!({"version":3,"configs":[grid()]});assert!(recover(&p,"stale",recovered.clone(),20).is_err());let backup=recover(&p,"damaged",recovered,20).unwrap();assert_eq!(fs::read(backup_dir(&p).unwrap().join(backup)).unwrap(),b"damaged");}
 #[test]fn budget_and_bad_geometry_rejected(){let mut g=grid();g["categories"][0]["width"]=json!(-1);assert!(validate_grid(&g).is_err());}
}
