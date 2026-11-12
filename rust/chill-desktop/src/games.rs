use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use once_cell::sync::Lazy;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

static CURRENT: Lazy<Mutex<Option<Value>>> = Lazy::new(|| Mutex::new(None));

const KNOWN_GAMES: &[(&str, &str, &str)] = &[
    ("robloxplayerbeta.exe", "Roblox", "roblox"),
    ("robloxplayer.exe", "Roblox", "roblox"),
    ("minecraft.windows.exe", "Minecraft", "minecraft"),
    ("minecraft.exe", "Minecraft", "minecraft"),
    ("fortniteclient-win64-shipping.exe", "Fortnite", "epic"),
    ("valorant-win64-shipping.exe", "VALORANT", "riot"),
    ("league of legends.exe", "League of Legends", "riot"),
    ("cs2.exe", "Counter-Strike 2", "steam"),
    ("csgo.exe", "Counter-Strike: Global Offensive", "steam"),
    ("dota2.exe", "Dota 2", "steam"),
    ("r5apex.exe", "Apex Legends", "steam"),
    ("r5apex_dx12.exe", "Apex Legends", "steam"),
    ("overwatch.exe", "Overwatch 2", "battlenet"),
    ("rocketleague.exe", "Rocket League", "epic"),
    ("gta5.exe", "Grand Theft Auto V", "other"),
    ("gta5_enhanced.exe", "Grand Theft Auto V", "other"),
    ("rdr2.exe", "Red Dead Redemption 2", "other"),
    ("rustclient.exe", "Rust", "steam"),
    ("terraria.exe", "Terraria", "steam"),
    ("stardew valley.exe", "Stardew Valley", "steam"),
    ("factorio.exe", "Factorio", "steam"),
    ("genshinimpact.exe", "Genshin Impact", "other"),
    ("starrail.exe", "Honkai: Star Rail", "other"),
    ("zenlesszonezero.exe", "Zenless Zone Zero", "other"),
    ("bh3.exe", "Honkai Impact 3rd", "other"),
    ("eldenring.exe", "Elden Ring", "steam"),
    ("nightreign.exe", "Elden Ring Nightreign", "steam"),
    ("cyberpunk2077.exe", "Cyberpunk 2077", "steam"),
    ("bg3.exe", "Baldur's Gate 3", "steam"),
    ("bg3_dx11.exe", "Baldur's Gate 3", "steam"),
    ("palworld-win64-shipping.exe", "Palworld", "steam"),
    ("hogwartslegacy.exe", "Hogwarts Legacy", "steam"),
    ("tslgame.exe", "PUBG: BATTLEGROUNDS", "steam"),
    ("escapefromtarkov.exe", "Escape from Tarkov", "other"),
    ("wow.exe", "World of Warcraft", "battlenet"),
    ("wowclassic.exe", "World of Warcraft", "battlenet"),
    ("diablo iv.exe", "Diablo IV", "battlenet"),
    ("heroesofthestorm_x64.exe", "Heroes of the Storm", "battlenet"),
    ("sc2_x64.exe", "StarCraft II", "battlenet"),
    ("hearthstone.exe", "Hearthstone", "battlenet"),
    ("destiny2.exe", "Destiny 2", "steam"),
    ("warframe.x64.exe", "Warframe", "other"),
    ("pathofexile2.exe", "Path of Exile 2", "steam"),
    ("pathofexile_x64.exe", "Path of Exile", "steam"),
    ("ffxiv_dx11.exe", "Final Fantasy XIV", "other"),
    ("worldoftanks.exe", "World of Tanks", "other"),
    ("wows.exe", "World of Warships", "other"),
    ("aces.exe", "War Thunder", "steam"),
    ("seaofthieves.exe", "Sea of Thieves", "xbox"),
    ("forzahorizon5.exe", "Forza Horizon 5", "xbox"),
    ("forzamotorsport.exe", "Forza Motorsport", "xbox"),
    ("haloinfinite.exe", "Halo Infinite", "xbox"),
    ("aoe4.exe", "Age of Empires IV", "xbox"),
    ("aoe2de.exe", "Age of Empires II: Definitive Edition", "xbox"),
    ("civilizationvi.exe", "Sid Meier's Civilization VI", "steam"),
    ("hoi4.exe", "Hearts of Iron IV", "steam"),
    ("ck3.exe", "Crusader Kings III", "steam"),
    ("eu4.exe", "Europa Universalis IV", "steam"),
    ("stellaris.exe", "Stellaris", "steam"),
    ("victoria3.exe", "Victoria 3", "steam"),
    ("rimworldwin64.exe", "RimWorld", "steam"),
    ("deep rock galactic.exe", "Deep Rock Galactic", "steam"),
    ("payday3.exe", "PAYDAY 3", "steam"),
    ("satisfactory.exe", "Satisfactory", "steam"),
    ("valheim.exe", "Valheim", "steam"),
    ("7daystodie.exe", "7 Days to Die", "steam"),
    ("dayz_x64.exe", "DayZ", "steam"),
    ("arkascended.exe", "ARK: Survival Ascended", "steam"),
    ("arkshipping.exe", "ARK: Survival Evolved", "steam"),
    ("deadbydaylight-win64-shipping.exe", "Dead by Daylight", "steam"),
    ("rainbowsix.exe", "Rainbow Six Siege", "ubisoft"),
    ("rainbowsix_dx12.exe", "Rainbow Six Siege", "ubisoft"),
    ("farcry6.exe", "Far Cry 6", "ubisoft"),
    ("acvalhalla.exe", "Assassin's Creed Valhalla", "ubisoft"),
    ("thedivision2.exe", "Tom Clancy's The Division 2", "ubisoft"),
    ("bf2042.exe", "Battlefield 2042", "ea"),
    ("fifa23.exe", "FIFA 23", "ea"),
    ("fc24.exe", "EA SPORTS FC 24", "ea"),
    ("fc25.exe", "EA SPORTS FC 25", "ea"),
    ("apex_legends.exe", "Apex Legends", "ea"),
    ("nfsheat.exe", "Need for Speed Heat", "ea"),
    ("witcher3.exe", "The Witcher 3: Wild Hunt", "gog"),
    ("witcher3_dx12.exe", "The Witcher 3: Wild Hunt", "gog"),
    ("cyberpunk2077.exe", "Cyberpunk 2077", "gog"),
    ("baldursgate3.exe", "Baldur's Gate 3", "gog"),
    ("bg3.exe", "Baldur's Gate 3", "gog"),
    ("hades.exe", "Hades", "steam"),
    ("hades2.exe", "Hades II", "steam"),
    ("hollow_knight.exe", "Hollow Knight", "steam"),
    ("cuphead.exe", "Cuphead", "steam"),
    ("among us.exe", "Among Us", "other"),
    ("fallguys_client.exe", "Fall Guys", "epic"),
    ("grandchase.exe", "GrandChase", "other"),
    ("brawlhalla.exe", "Brawlhalla", "steam"),
    ("multiversus.exe", "MultiVersus", "steam"),
    ("smite.exe", "SMITE", "steam"),
    ("tarkov.exe", "Escape from Tarkov", "other"),
    ("division2.exe", "Tom Clancy's The Division 2", "ubisoft"),
    ("gtav.exe", "Grand Theft Auto V", "other"),
];

pub fn current() -> Option<Value> {
    CURRENT.lock().ok().and_then(|value| value.clone())
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut title = String::new();
        let mut platform = String::new();

        loop {
            let found = tokio::task::spawn_blocking(detect).await.ok().flatten();
            match found {
                Some((next_title, next_platform)) => {
                    if title != next_title || platform != next_platform {
                        title = next_title;
                        platform = next_platform;
                        let since = now_ms();
                        let value = json!({
                            "name": title,
                            "playing": title,
                            "platform": platform,
                            "playingPlatform": platform,
                            "icon": "",
                            "playingIcon": "",
                            "since": since,
                            "playingSince": since,
                        });
                        if let Ok(mut current) = CURRENT.lock() {
                            *current = Some(value.clone());
                        }
                        let _ = app.emit("chill://activity", value);
                    }
                }
                None => {
                    if !title.is_empty() {
                        title.clear();
                        platform.clear();
                        if let Ok(mut current) = CURRENT.lock() {
                            *current = None;
                        }
                        let _ = app.emit("chill://activity", Value::Null);
                    }
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

fn detect() -> Option<(String, String)> {
    let output = Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let name = line
            .split("\",\"")
            .next()
            .unwrap_or("")
            .trim_matches('"')
            .trim()
            .to_lowercase();
        if name.is_empty() {
            continue;
        }
        if let Some((_, title, platform)) = KNOWN_GAMES
            .iter()
            .find(|(process, _, _)| *process == name)
        {
            return Some(((*title).to_string(), (*platform).to_string()));
        }
    }
    None
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
