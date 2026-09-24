#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use dota_hero_grid_studio::storage;
use serde::Serialize;
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}, process::Command};
#[derive(Serialize)]
struct Account { account: String, path: String, exists: bool }
fn quiet(command: &mut Command) -> &mut Command {
    #[cfg(windows)] { use std::os::windows::process::CommandExt;command.creation_flags(0x08000000); }
    command
}
fn steam_roots(custom_root:Option<&str>) -> Vec<PathBuf> {
    let mut roots=Vec::new();if let Some(path)=custom_root.filter(|s|!s.is_empty()){roots.push(PathBuf::from(path));}
    #[cfg(windows)]
    for (key,value) in [("HKCU\\Software\\Valve\\Steam","SteamPath"),("HKLM\\SOFTWARE\\Valve\\Steam","InstallPath"),("HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam","InstallPath")] {
        if let Ok(out)=quiet(Command::new("reg").args(["query",key,"/v",value])).output(){
            if out.status.success(){for line in String::from_utf8_lossy(&out.stdout).lines(){if let Some((_,path))=line.split_once("REG_SZ"){roots.push(PathBuf::from(path.trim()));}}}
        }
    }
    for env in ["PROGRAMFILES(X86)","PROGRAMFILES","LOCALAPPDATA"] { if let Ok(v)=std::env::var(env){roots.push(PathBuf::from(v).join("Steam"));} }
    roots=roots.into_iter().filter_map(|p|p.canonicalize().ok()).collect();roots.sort();roots.dedup();roots
}
#[tauri::command]
fn find_accounts(custom_root:Option<String>)->Result<Vec<Account>,String>{
    let mut accounts=Vec::new();for root in steam_roots(custom_root.as_deref()){let Ok(entries)=fs::read_dir(root.join("userdata"))else{continue};
        for e in entries.flatten(){let account=e.file_name().to_string_lossy().to_string();if account.parse::<u64>().is_err(){continue;}
            let cfg=e.path().join("570/remote/cfg");if !cfg.is_dir(){continue;}let path=cfg.join("hero_grid_config.json");
            accounts.push(Account{account,path:path.to_string_lossy().to_string(),exists:path.is_file()});}}
    accounts.sort_by(|a,b|a.path.cmp(&b.path));accounts.dedup_by(|a,b|a.path==b.path);Ok(accounts)
}
fn allowed_path(path:&Path,custom_root:Option<&str>)->Result<PathBuf,String>{
    if path.file_name().and_then(|s|s.to_str())!=Some("hero_grid_config.json"){return Err("Invalid filename".into());}
    let parent=path.parent().ok_or("Missing parent")?.canonicalize().map_err(|e|e.to_string())?;
    for root in steam_roots(custom_root){let Ok(base)=root.join("userdata").canonicalize()else{continue};if let Ok(suffix)=parent.strip_prefix(base){
        let parts:Vec<_>=suffix.iter().map(|p|p.to_string_lossy().to_string()).collect();
        if parts.len()==4 && parts[0].parse::<u64>().is_ok() && parts[1]=="570" && parts[2]=="remote" && parts[3]=="cfg" {return Ok(parent.join("hero_grid_config.json"));}
    }}Err("Not a discovered Steam userdata/<account>/570/remote/cfg directory".into())
}
fn ensure_dota_closed()->Result<(),String>{
    if !cfg!(windows){return Err("Installation currently supports Windows only".into());}
    let out=quiet(Command::new("tasklist").args(["/FI","IMAGENAME eq dota2.exe","/NH"])).output().map_err(|e|format!("Cannot check Dota process: {e}"))?;
    if !out.status.success(){return Err("Cannot check Dota process; no files changed".into());}
    if String::from_utf8_lossy(&out.stdout).to_ascii_lowercase().contains("dota2.exe"){return Err("Закройте Dota 2 перед установкой или восстановлением".into());}Ok(())
}
#[tauri::command]
fn install_grid(path:String,grid:Value,keep:Option<usize>,test:Option<bool>,custom_root:Option<String>)->Result<storage::InstallResult,String>{let target=allowed_path(Path::new(&path),custom_root.as_deref())?;ensure_dota_closed()?;storage::install_mode(&target,grid,keep.unwrap_or(20),test.unwrap_or(false))}
#[tauri::command]
fn list_backups(path:String,custom_root:Option<String>)->Result<Vec<storage::Backup>,String>{storage::list(&allowed_path(Path::new(&path),custom_root.as_deref())?)}
#[tauri::command]
fn restore_backup(path:String,name:String,keep:Option<usize>,custom_root:Option<String>)->Result<String,String>{let target=allowed_path(Path::new(&path),custom_root.as_deref())?;ensure_dota_closed()?;storage::restore(&target,&name,keep.unwrap_or(20))}
#[tauri::command]
fn read_grid(path:String,custom_root:Option<String>)->Result<String,String>{storage::read_text(&allowed_path(Path::new(&path),custom_root.as_deref())?)}
#[tauri::command]
fn recover_grid(path:String,expected:String,recovered:Value,keep:Option<usize>,custom_root:Option<String>)->Result<String,String>{let target=allowed_path(Path::new(&path),custom_root.as_deref())?;ensure_dota_closed()?;storage::recover(&target,&expected,recovered,keep.unwrap_or(20))}
#[derive(Serialize)]
struct HealthItem{name:String,ok:bool,detail:String}
#[tauri::command]
fn health_check(path:Option<String>,custom_root:Option<String>)->Vec<HealthItem>{
    let roots=steam_roots(custom_root.as_deref());let steam=roots.iter().any(|r|r.join("steam.exe").is_file());
    let dota=roots.iter().any(|r|{
        if r.join("steamapps/appmanifest_570.acf").is_file(){return true;}
        if let Ok(vdf)=fs::read_to_string(r.join("steamapps/libraryfolders.vdf")){for line in vdf.lines(){let parts:Vec<_>=line.split('"').collect();if parts.len()>3&&parts[1]=="path"&&PathBuf::from(parts[3].replace("\\\\","\\")).join("steamapps/appmanifest_570.acf").is_file(){return true;}}}false
    });
    let target=path.as_deref().and_then(|p|allowed_path(Path::new(p),custom_root.as_deref()).ok());
    let account=target.is_some();let cfg=target.as_ref().is_some_and(|p|p.parent().is_some_and(|p|p.is_dir()));
    let json_ok=target.as_ref().is_some_and(|p|storage::read_text(p).ok().and_then(|s|serde_json::from_str::<Value>(&s).ok()).is_some_and(|v|storage::validate_file(&v).is_ok()));
    let writable=target.as_ref().is_some_and(|p|storage::writable(p).is_ok());let backup=target.as_ref().is_some_and(|p|storage::list(p).is_ok())&&writable;
    [("Steam",steam,"steam.exe"),("Dota",dota,"appmanifest_570.acf; Steam libraries"),("Account",account,"выбранный аккаунт"),("CFG",cfg,"существующая папка cfg"),("JSON",json_ok,"структура JSON или новый файл"),("Backup",backup,"доступ к резервным копиям"),("Write Access",writable,"проверка временной записью")].into_iter().map(|(name,ok,detail)|HealthItem{name:name.into(),ok,detail:detail.into()}).collect()
}
fn main(){tauri::Builder::default().invoke_handler(tauri::generate_handler![find_accounts,install_grid,list_backups,restore_backup,read_grid,recover_grid,health_check]).run(tauri::generate_context!()).expect("Tauri startup failed");}
