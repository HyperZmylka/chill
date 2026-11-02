// Chill - automatyczne wykrywanie uruchomionych gier.
// Łączy listę znanych gier z katalogiem bibliotek (Steam, Epic, GOG, Xbox,
// EA, Ubisoft, Battle.net, Riot, itch, Roblox, Minecraft) oraz heurystyką
// opartą na metadanych procesu. Moduł nie zależy od Electrona - ikonę
// dostarcza funkcja readIcon(exePath) przekazana przez proces główny.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const MAX_ICON_LENGTH = 120_000;
const ICON_RETRY_MS = 60_000;
const CATALOG_TTL_MS = 30 * 60 * 1000;
const CATALOG_MAX_INSTALLS = 280;

const KNOWN_GAMES = [
  [/^robloxplayerbeta$|^robloxplayer$/, 'Roblox', 'roblox'],
  [/^minecraft\.windows$|^minecraft$/, 'Minecraft', 'minecraft'],
  [/^javaw?$/, 'Minecraft', 'minecraft', (proc) => /minecraft|modrinth|curseforge|\bftb\b|prism|multimc|technic/i.test(processText(proc))],

  [/^fortniteclient-win64-shipping$/, 'Fortnite', 'epic'],
  [/^valorant-win64-shipping$|^valorant$/, 'VALORANT', 'riot'],
  [/^league of legends$/, 'League of Legends', 'riot'],

  [/^cs2$/, 'Counter-Strike 2', 'steam'],
  [/^csgo$/, 'Counter-Strike: Global Offensive', 'steam'],
  [/^dota2$/, 'Dota 2', 'steam'],
  [/^r5apex(?:_.*)?$/, 'Apex Legends', 'steam'],
  [/^overwatch$/, 'Overwatch 2', 'battlenet'],
  [/^rocketleague$/, 'Rocket League', 'epic'],
  [/^gta5(?:_enhanced)?$|^gtav$/, 'Grand Theft Auto V', 'other'],
  [/^gtaiv$/, 'Grand Theft Auto IV', 'other'],
  [/^rdr2$/, 'Red Dead Redemption 2', 'other'],
  [/^rustclient$/, 'Rust', 'steam'],
  [/^among us$/, 'Among Us', 'other'],
  [/^terraria$/, 'Terraria', 'steam'],
  [/^stardew valley$/, 'Stardew Valley', 'steam'],
  [/^factorio$/, 'Factorio', 'steam'],
  [/^genshinimpact$/, 'Genshin Impact', 'other'],
  [/^starrail$/, 'Honkai: Star Rail', 'other'],
  [/^zenlesszonezero$/, 'Zenless Zone Zero', 'other'],
  [/^bh3$/, 'Honkai Impact 3rd', 'other'],
  [/^eldenring$/, 'Elden Ring', 'steam'],
  [/^nightreign$/, 'Elden Ring Nightreign', 'steam'],
  [/^cyberpunk2077$/, 'Cyberpunk 2077', 'steam'],
  [/^bg3(?:_dx11)?$|^baldursgate3$/, "Baldur's Gate 3", 'steam'],
  [/^palworld(?:-win64-shipping)?$/, 'Palworld', 'steam'],
  [/^hogwartslegacy$/, 'Hogwarts Legacy', 'steam'],
  [/^tslgame$/, 'PUBG: BATTLEGROUNDS', 'steam'],
  [/^escapefromtarkov$/, 'Escape from Tarkov', 'other'],
  [/^wow$|^wowclassic$/, 'World of Warcraft', 'battlenet'],
  [/^diablo iv$/, 'Diablo IV', 'battlenet'],
  [/^diablo iii64$/, 'Diablo III', 'battlenet'],
  [/^heroesofthestorm_x64$/, 'Heroes of the Storm', 'battlenet'],
  [/^sc2_x64$/, 'StarCraft II', 'battlenet'],
  [/^hearthstone$/, 'Hearthstone', 'battlenet'],
  [/^destiny2$/, 'Destiny 2', 'steam'],
  [/^warframe(?:\.x64)?$/, 'Warframe', 'other'],
  [/^pathofexile2$/, 'Path of Exile 2', 'steam'],
  [/^pathofexile(?:_x64)?$/, 'Path of Exile', 'steam'],
  [/^ffxiv_dx11$|^ffxiv$/, 'Final Fantasy XIV', 'other'],
  [/^worldoftanks$/, 'World of Tanks', 'other'],
  [/^wows$/, 'World of Warships', 'other'],
  [/^aces$/, 'War Thunder', 'steam'],
  [/^seaofthieves$/, 'Sea of Thieves', 'xbox'],
  [/^forzahorizon5$/, 'Forza Horizon 5', 'xbox'],
  [/^forzamotorsport$/, 'Forza Motorsport', 'xbox'],
  [/^haloinfinite$/, 'Halo Infinite', 'xbox'],
  [/^aoe4$/, 'Age of Empires IV', 'xbox'],
  [/^aoe2de$/, 'Age of Empires II: Definitive Edition', 'xbox'],
  [/^aoe3de$/, 'Age of Empires III: Definitive Edition', 'xbox'],
  [/^civilizationvi$/, 'Sid Meier\'s Civilization VI', 'steam'],
  [/^civilizationv$/, 'Sid Meier\'s Civilization V', 'steam'],
  [/^hoi4$/, 'Hearts of Iron IV', 'steam'],
  [/^ck3$/, 'Crusader Kings III', 'steam'],
  [/^eu4$/, 'Europa Universalis IV', 'steam'],
  [/^stellaris$/, 'Stellaris', 'steam'],
  [/^victoria3$/, 'Victoria 3', 'steam'],
  [/^rimworldwin64$|^rimworld$/, 'RimWorld', 'steam'],
  [/^valheim$/, 'Valheim', 'steam'],
  [/^vrising$/, 'V Rising', 'steam'],
  [/^7daystodie$/, '7 Days to Die', 'steam'],
  [/^dayz(?:_x64)?$/, 'DayZ', 'steam'],
  [/^shootergame$/, 'ARK: Survival Evolved', 'steam'],
  [/^arkascended$/, 'ARK: Survival Ascended', 'steam'],
  [/^factorygame-win64-shipping$/, 'Satisfactory', 'steam'],
  [/^subnautica$/, 'Subnautica', 'steam'],
  [/^subnauticazerother$/, 'Subnautica: Below Zero', 'steam'],
  [/^nms$/, 'No Man\'s Sky', 'steam'],
  [/^elitedangerous64$/, 'Elite Dangerous', 'steam'],
  [/^starcitizen$/, 'Star Citizen', 'other'],
  [/^flightsimulator$/, 'Microsoft Flight Simulator', 'xbox'],
  [/^eurotrucks2$/, 'Euro Truck Simulator 2', 'steam'],
  [/^amtrucks$/, 'American Truck Simulator', 'steam'],
  [/^beamng\.drive$/, 'BeamNG.drive', 'steam'],
  [/^acs$/, 'Assetto Corsa', 'steam'],
  [/^acc$/, 'Assetto Corsa Competizione', 'steam'],
  [/^iracingsim64(?:dx11)?$/, 'iRacing', 'other'],
  [/^f1_2[0-9]$/, 'F1', 'ea'],
  [/^nba2k\d*$/, 'NBA 2K', 'other'],
  [/^fc2[4-9]$|^fifa2[0-3]$/, 'EA Sports FC', 'ea'],
  [/^efootball$/, 'eFootball', 'other'],
  [/^fallguys_client$/, 'Fall Guys', 'epic'],
  [/^brawlhalla$/, 'Brawlhalla', 'steam'],
  [/^multiversus$/, 'MultiVersus', 'steam'],
  [/^streetfighter6$/, 'Street Fighter 6', 'steam'],
  [/^mortalkombat1$/, 'Mortal Kombat 1', 'steam'],
  [/^tekken8$/, 'Tekken 8', 'steam'],
  [/^ggst$/, 'Guilty Gear: Strive', 'steam'],
  [/^liesofp$/, 'Lies of P', 'steam'],
  [/^b1-win64-shipping$/, 'Black Myth: Wukong', 'steam'],
  [/^ghostoftsushima$/, 'Ghost of Tsushima', 'steam'],
  [/^godofwar$/, 'God of War', 'steam'],
  [/^godofwarragnarok$/, 'God of War Ragnarök', 'steam'],
  [/^horizonzerodawn$/, 'Horizon Zero Dawn', 'steam'],
  [/^tlou-i$/, 'The Last of Us Part I', 'steam'],
  [/^tlou-ii$/, 'The Last of Us Part II', 'steam'],
  [/^spiderman$/, 'Marvel\'s Spider-Man Remastered', 'steam'],
  [/^spiderman2$/, 'Marvel\'s Spider-Man 2', 'steam'],
  [/^spidermanmilesmorales$/, 'Marvel\'s Spider-Man: Miles Morales', 'steam'],
  [/^daysgone$/, 'Days Gone', 'steam'],
  [/^deathstranding(?:dc)?$/, 'Death Stranding', 'steam'],
  [/^detroitbecomehuman$/, 'Detroit: Become Human', 'steam'],
  [/^re4$/, 'Resident Evil 4', 'steam'],
  [/^re8$/, 'Resident Evil Village', 'steam'],
  [/^monsterhunterworld$/, 'Monster Hunter: World', 'steam'],
  [/^monsterhunterrise$/, 'Monster Hunter Rise', 'steam'],
  [/^monsterhunterwilds$/, 'Monster Hunter Wilds', 'steam'],
  [/^dd2$/, 'Dragon\'s Dogma 2', 'steam'],
  [/^darksoulsiii$/, 'Dark Souls III', 'steam'],
  [/^sekiro$/, 'Sekiro: Shadows Die Twice', 'steam'],
  [/^armoredcore6$/, 'Armored Core VI: Fires of Rubicon', 'steam'],
  [/^helldivers2$/, 'Helldivers 2', 'steam'],
  [/^fsd-win64-shipping$/, 'Deep Rock Galactic', 'steam'],
  [/^lethalcompany$/, 'Lethal Company', 'steam'],
  [/^phasmophobia$/, 'Phasmophobia', 'steam'],
  [/^contentwarning$/, 'Content Warning', 'steam'],
  [/^repo$/, 'R.E.P.O.', 'steam'],
  [/^peak$/, 'PEAK', 'steam'],
  [/^balatro$/, 'Balatro', 'steam'],
  [/^hades2$/, 'Hades II', 'steam'],
  [/^hades$/, 'Hades', 'steam'],
  [/^deadcells$/, 'Dead Cells', 'steam'],
  [/^hollow_knight$/, 'Hollow Knight', 'steam'],
  [/^silksong$|^hollowknight_silksong$/, 'Hollow Knight: Silksong', 'steam'],
  [/^cuphead$/, 'Cuphead', 'steam'],
  [/^celeste$/, 'Celeste', 'steam'],
  [/^undertale$/, 'Undertale', 'steam'],
  [/^deltarune$/, 'Deltarune', 'steam'],
  [/^slaythespire$/, 'Slay the Spire', 'steam'],
  [/^vampiresurvivors$/, 'Vampire Survivors', 'steam'],
  [/^brotato$/, 'Brotato', 'steam'],
  [/^riskofrain2$/, 'Risk of Rain 2', 'steam'],
  [/^isaac-ng$/, 'The Binding of Isaac: Rebirth', 'steam'],
  [/^deadlock$/, 'Deadlock', 'steam'],
  [/^left4dead2$/, 'Left 4 Dead 2', 'steam'],
  [/^portal2$/, 'Portal 2', 'steam'],
  [/^hlvr$/, 'Half-Life: Alyx', 'steam'],
  [/^vermintide2$/, 'Warhammer: Vermintide 2', 'steam'],
  [/^darktide$/, 'Warhammer 40,000: Darktide', 'steam'],
  [/^payday2_win32_release$/, 'PAYDAY 2', 'steam'],
  [/^payday3$/, 'PAYDAY 3', 'steam'],
  [/^readynot$|^readyornot$/, 'Ready or Not', 'steam'],
  [/^gtfo$/, 'GTFO', 'steam'],
  [/^rainbowsix(?:_dx11|_vulkan)?$|^rainbowsixsiege$/, 'Rainbow Six Siege', 'ubisoft'],
  [/^thedivision2$/, 'Tom Clancy\'s The Division 2', 'ubisoft'],
  [/^grb$|^ghostreconbreakpoint$/, 'Ghost Recon Breakpoint', 'ubisoft'],
  [/^farcry[3-6]?$|^farcryprimal$|^farcrynewdawn$/, 'Far Cry', 'ubisoft'],
  [/^watchdogs[12]?$|^watchdogslegion$/, 'Watch Dogs', 'ubisoft'],
  [/^forhonor$/, 'For Honor', 'ubisoft'],
  [/^anno1800$/, 'Anno 1800', 'ubisoft'],
  [/^ridersrepublic$/, 'Riders Republic', 'ubisoft'],
  [/^trackmania$/, 'Trackmania', 'ubisoft'],
  [/^acshadows$/, 'Assassin\'s Creed Shadows', 'ubisoft'],
  [/^acodyssey$/, 'Assassin\'s Creed Odyssey', 'ubisoft'],
  [/^acvalhalla$/, 'Assassin\'s Creed Valhalla', 'ubisoft'],
  [/^acorigins$/, 'Assassin\'s Creed Origins', 'ubisoft'],
  [/^acmirage$/, 'Assassin\'s Creed Mirage', 'ubisoft'],
  [/^acsyndicate$/, 'Assassin\'s Creed Syndicate', 'ubisoft'],
  [/^acunity$/, 'Assassin\'s Creed Unity', 'ubisoft'],
  [/^acblackflag$/, 'Assassin\'s Creed IV: Black Flag', 'ubisoft'],
  [/^skullandbones$/, 'Skull and Bones', 'ubisoft'],
  [/^immortalsfenyxrising$/, 'Immortals Fenyx Rising', 'ubisoft'],
  [/^ittakestwo$/, 'It Takes Two', 'ea'],
  [/^awayout$/, 'A Way Out', 'ea'],
  [/^jedisurvivor$/, 'Star Wars Jedi: Survivor', 'ea'],
  [/^starwarsbattlefrontii$/, 'Star Wars Battlefront II', 'ea'],
  [/^squadrons$/, 'Star Wars: Squadrons', 'ea'],
  [/^masseffect(?:1|2|3)?$/, 'Mass Effect', 'ea'],
  [/^dragonage(?:inquisition)?$/, 'Dragon Age', 'ea'],
  [/^bf2042$/, 'Battlefield 2042', 'ea'],
  [/^bf1$/, 'Battlefield 1', 'ea'],
  [/^bf4$/, 'Battlefield 4', 'ea'],
  [/^bfv$/, 'Battlefield V', 'ea'],
  [/^codhq$|^cod$/, 'Call of Duty', 'other'],
  [/^modernwarfare$|^modernwarfare2$|^modernwarfare3$/, 'Call of Duty: Modern Warfare', 'other'],
  [/^blackops[2-6]$/, 'Call of Duty: Black Ops', 'other'],
  [/^ts4_x64$|^ts4$/, 'The Sims 4', 'ea'],
  [/^ts3w$/, 'The Sims 3', 'ea'],
  [/^citiesskylines2$/, 'Cities: Skylines II', 'steam'],
  [/^citiesskylines$/, 'Cities: Skylines', 'steam'],
  [/^theforest$/, 'The Forest', 'steam'],
  [/^sonsoftheforest$/, 'Sons of the Forest', 'steam'],
  [/^greenhell$/, 'Green Hell', 'steam'],
  [/^raft$/, 'Raft', 'steam'],
  [/^scum$/, 'SCUM', 'steam'],
  [/^unturned$/, 'Unturned', 'steam'],
  [/^osu!$/, 'osu!', 'other'],
  [/^geometrydash$/, 'Geometry Dash', 'steam'],
  [/^wuthering ?waves$/, 'Wuthering Waves', 'other'],
  [/^oncehuman$/, 'Once Human', 'steam'],
  [/^marvelrivals$/, 'Marvel Rivals', 'steam'],
  [/^deltaforceclient-win64-shipping$/, 'Delta Force', 'steam'],
  [/^splitfiction$/, 'Split Fiction', 'ea'],
  [/^chainedtogether$/, 'Chained Together', 'steam'],
  [/^schedule i$/, 'Schedule I', 'steam'],
  [/^neworld$|^newworld$/, 'New World', 'steam'],
  [/^lostark$/, 'Lost Ark', 'steam'],
  [/^blackdesert64$/, 'Black Desert', 'other'],
  [/^albion-online$/, 'Albion Online', 'other'],
  [/^rs2client$|^runescape$/, 'RuneScape', 'other'],
  [/^osclient$/, 'Old School RuneScape', 'other'],
  [/^maplestory$/, 'MapleStory', 'other'],
  [/^tl$/, 'Throne and Liberty', 'steam'],
];

const EXCLUDED_NAMES = new Set([
  'explorer', 'brave', 'chrome', 'msedge', 'firefox', 'opera', 'vivaldi', 'iexplore',
  'discord', 'discordcanary', 'discordptb', 'slack', 'teams', 'ms-teams', 'zoom', 'skype',
  'telegram', 'whatsapp', 'signal', 'element', 'mattermost', 'notion', 'obsidian', 'evernote',
  'spotify', 'vlc', 'wmplayer', 'mpc-hc64', 'mpc-hc', 'mpv', 'potplayermini64', 'foobar2000',
  'aimp', 'musicbee', 'itunes', 'obs64', 'obs32', 'streamlabs', 'medal', 'overwolf',
  'notepad', 'notepad++', 'code', 'devenv', 'idea64', 'pycharm64', 'webstorm64', 'sublime_text',
  'photoshop', 'illustrator', 'figma', 'winword', 'excel', 'powerpnt', 'outlook', 'onenote',
  'acrord32', 'acrobat', 'foxitreader', 'taskmgr', 'mmc', 'regedit', 'cmd', 'powershell',
  'powershell_ise', 'pwsh', 'windowsterminal', 'wt', 'conhost', 'applicationframehost',
  'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'lockapp',
  'systemsettings', 'calculatorapp', 'calculator', 'settings', 'photos', 'mspaint',
  'snippingtool', 'camtasia', 'handbrake', 'audacity', 'gimp', 'blender', 'unity',
  'unrealeditor', 'rider64', 'git-bash', 'githubdesktop', 'docker desktop', 'postman',
  'insomnia', 'steam', 'steamwebhelper', 'epicgameslauncher', 'galaxyclient',
  'riotclientservices', 'riotclientux', 'battle.net', 'origin', 'eadesktop',
  'ubisoftconnect', 'uplay', 'itch', 'minecraftlauncher', 'rockstargameslauncher',
  'socialclub', 'socialclubhelper', 'launcher', 'updater', 'crashpad_handler',
  'crashreporter', 'werfault', 'dllhost', 'rundll32', 'sihost', 'fontdrvhost', 'dwm',
  'csrss', 'winlogon', 'services', 'lsass', 'svchost', 'smss', 'wininit', 'spoolsv',
  'taskhostw', 'ctfmon', 'securityhealthsystray', 'rtkauduservice64', 'nahimic',
  'armourycrate', 'icue', 'logioptionsplus', 'razer synapse', 'msiafterburner', 'rtss',
  'nvidia share', 'nvcontainer', 'amdow', 'radeonsoftware', 'wallpaperengine',
  'wallpaper32', 'wallpaper64', 'opencode', 'ai.opencode.desktop', 'antigravity',
  'cursor', 'windsurf', 'ticktick', 'todoist', 'zalo', 'line', 'hwinfo64', 'cpuz',
  'gpu-z', 'crystaldiskinfo', 'processhacker', 'procexp', 'autoruns', 'everything',
  '7zfm', 'winrar', 'bandizip', 'dropbox', 'onedrive', 'googledrive', 'megasync',
  'backblaze', 'anydesk', 'teamviewer', 'mstsc', 'parsec', 'sunshine', 'moonlight',
  'rustdesk', 'tidal', 'deezer', 'amazon music', 'webviewhost', 'msedgewebview2',
  'electron', 'node', 'python', 'pythonw', 'java', 'javaw', 'msaccess', 'mspub',
  'visio', 'project', 'ssms', 'pgadmin4', 'mysqlworkbench', 'dbeaver', 'xampp-control',
  'wampmanager', 'filezilla', 'winscp', 'putty', 'mobaxterm', 'bitvise', 'wireshark',
  'fiddler', 'charles', 'burp', 'nmap', 'zenmap', 'malwarebytes', 'avastui', 'avgui',
  'kaspersky', 'bitdefender', 'norton', 'mcafee', 'eset', 'ccleaner', 'revo',
  'geekuninstaller', 'driverbooster', 'rufus', 'balenaetcher', 'ventoy', 'virtualbox',
  'vmware', 'vmplayer', 'vmware-vmx', 'qemu-system-x86_64', 'docker', 'wsl', 'wslhost',
  'bash', 'ubuntu', 'debian', 'kali', 'xfce4-terminal', 'gamebar', 'gamebarftserver',
  'xboxgamebarwidgets', 'xboxgamebar', 'nvidia geforce experience', 'geforceexperience',
]);

const HELPER_NAME_RE = /(?:^|[\s._-])(?:launcher|launch|installer|install|update|updater|patcher|helper|service|setup|bootstrap|crash|crashpad|crashreporter|handler|tray|agent|report|uninstall|uninst|redist|diagnostic|benchmark|server|dedicated|anticheat|anti-cheat|eac|battleye|vgc|vanguard|socialclub|overlay|widget)(?:$|[\s._-])/i;
const EXTRA_HELPER_RE = /^(?:unitycrashhandler\d*|prereqsetup|dxsetup|vcredist(?:_x64|_x86)?|easyanticheat(?:_eos)?|start_protected_game|unins\d*|uninstall|setup|install|launcher|updater|update|crashreporter|ue4prereqsetup|ue5prereqsetup|epicwebhelper|steamwebhelper|vgtray|riotclient|socialclubhelper|rockstarservices|rockstargameslauncher|minecraftlauncher|robloxstudio(?:beta)?|robloxplayerlauncher|battle\.net|galaxyclient|eadesktop|ubisoftconnect|uplay|origin|itch|goggalaxy)$/i;

const GAME_PATH_RE = /(?:steamapps[\\/]common|epic games|gog(?: games| galaxy)?|xboxgames|ea games|electronic arts|ubisoft|riot games|battle\.net|blizzard|roblox(?:player|studio)?|\.minecraft|itch[\\/]apps|\\games\\|\\game\\binaries\\|\\binaries\\win(?:32|64)\\)/i;
const GAME_META_RE = /\b(?:games?|gaming|interactive|entertainment|studios?|productions?)\b/i;
const GAME_PUBLISHER_RE = /\b(?:games?|gaming|interactive|entertainment|studios?|productions?|blizzard|rockstar|bethesda|ubisoft|electronic arts|ea\b|take[- ]?two|2k\b|square enix|bandai namco|capcom|sega|konami|koei|tecmo|nexon|ncsoft|krafton|smilegate|hoyoverse|mihoyo|valve|cd projekt|larian|paradox|focus entertainment|devolver|team17|thq|deep silver|annapurna|raw fury|coffee stain|facepunch|re-logic|mojang|roblox|riot games|epic games|fromsoftware|playstation|sony interactive|microsoft game studios|xbox game studios|warner bros|wb games|private division|prime matter|plaion|garena|level infinite|netease|perfect world|innogames|gameforge|jagex|daybreak|wargaming|gaijin|digital extremes|frontier developments|firaxis|creative assembly|relic entertainment|amplitude studios|stardock|tripwire interactive|klei entertainment|supergiant games|pearl abyss|kakao games|gravity|webzen|wemade|pubg|neowiz|ngames|playkot|my\.games|mail\.ru)\b/i;

const NON_GAME_TITLE_RE = /^(?:new tab|nowa karta|settings|ustawienia|task manager|menedżer zadań|file explorer|eksplorator plików|visual studio|discord|spotify|netflix|youtube|twitch|chrome|edge|firefox|brave|opera|vivaldi|whatsapp|telegram|signal|slack|teams|zoom|skype|obs|streamlabs|medal|overwolf|steam|epic games|gog galaxy|ea app|ubisoft connect|battle\.net|riot client|minecraft launcher|rockstar games launcher|open code|antigravity|cursor|windsurf)/i;

const SKIP_DIRS = new Set([
  'content', 'engine', 'redist', 'redistributables', '_commonredist', 'commonredist',
  'support', 'tools', 'sdk', 'docs', 'doc', 'help', 'uninstall', 'crashreport',
  'crashpad', 'diagnostics', 'thirdparty', 'third_party', 'third-party', 'directx',
  'dotnet', 'vcredist', 'editor', 'server', 'dedicated', 'benchmark', 'mods', 'modding',
  'workshop', 'screenshots', 'saves', 'savegames', 'logs', 'cache', 'temp', 'tmp',
  'backup', 'backups', 'symbols', 'pdb', 'installers', 'installer', 'redist64',
  'redist32', 'dotnetframework', 'directxredist', 'prerequisites', 'prereqs',
]);

const MAX_CACHE = 160;

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function processBase(name) {
  return normalizeText(name).replace(/\.exe$/i, '').toLowerCase();
}

function processText(proc) {
  return [proc?.name, proc?.path, proc?.title, proc?.company, proc?.description, proc?.product]
    .filter(Boolean)
    .join(' ');
}

function isHelperName(base) {
  if (HELPER_NAME_RE.test(base) || EXTRA_HELPER_RE.test(base)) return true;
  // Nazwy typu "GameLauncher", "MyGameUpdater" - narzędzia towarzyszące, nie gra.
  return /(?:launcher|installer|updater|patcher|helper|bootstrap)$/i.test(base);
}

function isKnownNoiseName(name) {
  const text = normalizeText(name).toLowerCase();
  if (!text) return true;
  if (text.length < 2 || /^[\d._-]+$/.test(text)) return true;
  if (/[\\/]/.test(text)) return true;
  const noise = /^(?:steam|epic games|gog galaxy|ea app|ubisoft connect|battle\.net|riot client|xbox|microsoft visual|windows|directx|vcredist|\.net|java|python|node\.?js|obs|discord|slack|teams|zoom|spotify|chrome|firefox|microsoft edge|brave browser|opera browser|vivaldi|visual studio code|visual studio|photoshop|illustrator|microsoft office|adobe|unity|unreal engine|godot|blender|audacity|vlc|7-zip|winrar|notepad|steamworks|easyanticheat|battleye|rockstar games launcher|social club|minecraft launcher|unreal engine 4|unreal engine 5|epic online services|webview2|runtime|redistributable|update|updater|installer|uninstall)(?:\s|$|[-_.:])/i;
  return noise.test(text);
}

function cleanGameName(value) {
  let text = normalizeText(value)
    .replace(/[\u2122\u00ae\u00a9]/g, '')
    .replace(/\s*[-–—]\s*(?:steam|epic games|gog(?: galaxy)?|ea app|ubisoft connect|battle\.net|riot client|xbox)\s*$/i, '')
    .replace(/\s*\((?:not responding|tm|r)\)\s*$/gi, '')
    .replace(/\s+(?:with medal)\s*$/i, '')
    .replace(/\s*[\(\[]\s*v?\d+(?:\.\d+)+\s*[\)\]]\s*$/i, '')
    .trim();
  if (text.length > 64) text = text.slice(0, 64).trim();
  return text;
}

function prettifyProcessName(value) {
  let text = normalizeText(value)
    .replace(/-(?:win32|win64)-shipping.*$/i, '')
    .replace(/_x64$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function matchKnownProcess(proc) {
  const base = processBase(proc?.name);
  if (!base) return null;
  for (const [re, name, platform, guard] of KNOWN_GAMES) {
    if (!re.test(base)) continue;
    if (!name) return null;
    if (guard && !guard(proc)) continue;
    return { name, platform: platform || 'other' };
  }
  return null;
}

function scoreHeuristic(proc, base = processBase(proc?.name)) {
  const file = String(proc?.path || '');
  const hay = processText(proc);
  let score = 0;
  if (GAME_PATH_RE.test(file)) score += 4;
  if (GAME_META_RE.test(hay)) score += 2;
  if (/-win(?:32|64)-shipping(?:\.exe)?$/i.test(base)) score += 3;
  if (/\\binaries\\(?:win32|win64)\\/i.test(file)) score += 2;
  if (/\\bin\\(?:x64|x86)\\/i.test(file)) score += 1;
  if (proc?.title && !NON_GAME_TITLE_RE.test(proc.title) && !/^(?:untitled|bez nazwy|program|okno|window)/i.test(proc.title)) score += 1;
  if (proc?.description && GAME_META_RE.test(proc.description)) score += 1;
  if (proc?.company && GAME_META_RE.test(proc.company)) score += 1;
  if (file && /^(?:c:\\program files|c:\\program files \(x86\)|d:\\program files)/i.test(file) && !GAME_PATH_RE.test(file)) score -= 1;
  if (file && /\\appdata\\local\\programs\\/i.test(file) && !GAME_PATH_RE.test(file)) score -= 2;
  return score;
}

function pickHeuristicName(proc, base) {
  const title = cleanGameName(proc?.title);
  const product = cleanGameName(proc?.product);
  const description = cleanGameName(proc?.description);
  const generic = /^(?:game|games|application|app|client|launcher|unknown|untitled|window|program|player|test|dx11|dx12|shipping|main|start|run|play)$/i;
  const usable = (value) => Boolean(value)
    && value.length >= 2
    && value.length <= 60
    && !generic.test(value)
    && !/^(?:untitled|bez nazwy|program|okno|window)/i.test(value)
    && !NON_GAME_TITLE_RE.test(value);
  if (usable(title)) return title;
  if (usable(product)) return product;
  if (usable(description)) return description;
  return prettifyProcessName(base) || 'Gra';
}

function platformFromPath(file) {
  const text = String(file || '').toLowerCase();
  if (text.includes('steamapps')) return 'steam';
  if (text.includes('epic games')) return 'epic';
  if (text.includes('gog')) return 'gog';
  if (text.includes('xboxgames')) return 'xbox';
  if (text.includes('ea games') || text.includes('electronic arts')) return 'ea';
  if (text.includes('ubisoft')) return 'ubisoft';
  if (text.includes('riot games')) return 'riot';
  if (text.includes('roblox')) return 'roblox';
  if (text.includes('.minecraft')) return 'minecraft';
  if (text.includes('battle.net') || text.includes('blizzard')) return 'battlenet';
  if (text.includes('itch')) return 'itch';
  return 'other';
}

function parsePsDate(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '');
  const m = /^\/Date\((\d+)\)\/$/.exec(text);
  if (m) return Number(m[1]);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeIcon(value) {
  const text = String(value || '');
  if (!text || text.length > MAX_ICON_LENGTH) return '';
  return /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(text) ? text : '';
}

function runPowerShell(script, timeout = 15_000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout, maxBuffer: 8e6 },
      (err, stdout) => resolve(err ? '' : String(stdout || '')),
    );
  });
}

async function listWindowsProcesses() {
  const script = [
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    "$ErrorActionPreference = 'SilentlyContinue'",
    'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id, ProcessName, Path, MainWindowTitle, MainWindowHandle, Company, Description, Product, StartTime | ConvertTo-Json -Compress -Depth 2',
  ].join('; ');
  const text = (await runPowerShell(script)).trim();
  if (!text) return [];
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : [data];
  const out = [];
  for (const item of list) {
    if (!item || !item.ProcessName) continue;
    const handle = Number(item.MainWindowHandle) || 0;
    if (!handle) continue;
    out.push({
      id: Number(item.Id) || 0,
      name: String(item.ProcessName || ''),
      path: String(item.Path || ''),
      title: normalizeText(item.MainWindowTitle),
      company: normalizeText(item.Company),
      description: normalizeText(item.Description),
      product: normalizeText(item.Product),
      start: parsePsDate(item.StartTime),
      handle,
    });
  }
  return out;
}

function listUnixProcesses() {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'comm='], { maxBuffer: 8e6 }, (err, stdout) => {
      if (err) return resolve([]);
      const out = String(stdout || '').split(/\r?\n/)
        .map((line) => line.trim().split('/').pop())
        .filter(Boolean)
        .map((name, index) => ({ id: index + 1, name, path: '', title: '', company: '', description: '', product: '', start: 0, handle: 1 }));
      resolve(out);
    });
  });
}

function escapeVdf(value) {
  return String(value || '').replace(/\\\\/g, '\\').replace(/\\"/g, '"');
}

function parseSteamLibraryFolders(text) {
  const paths = new Set();
  for (const match of String(text || '').matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/gi)) {
    const value = escapeVdf(match[1]);
    if (value) paths.add(value);
  }
  return [...paths];
}

function parseAcf(text) {
  const out = {};
  const source = String(text || '');
  for (const key of ['name', 'installdir', 'appid']) {
    const match = new RegExp(`"${key}"\\s+"((?:[^"\\\\]|\\\\.)*)"`, 'i').exec(source);
    if (match) out[key] = escapeVdf(match[1]);
  }
  return out;
}

function parseRegEntries(text) {
  const entries = [];
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^HKEY_/i.test(line.trim())) {
      current = {};
      entries.push(current);
      continue;
    }
    const match = /^\s{2,}(.+?)\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\s+(.*)$/i.exec(line);
    if (match && current) current[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return entries;
}

function displayIconPath(value) {
  const text = normalizeText(value);
  if (!text) return '';
  const quoted = /^"([^"]+\.exe)"/i.exec(text);
  if (quoted) return quoted[1];
  const plain = /^(.+?\.exe)(?:,|$)/i.exec(text);
  return plain ? plain[1].trim() : '';
}

function runReg(query, timeout = 12_000) {
  return new Promise((resolve) => {
    execFile('reg', ['query', query, '/s'], { windowsHide: true, timeout, maxBuffer: 24e6 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

async function listSubdirs(root, limit = 80) {
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name.toLowerCase()) && !isKnownNoiseName(entry.name))
    .slice(0, limit)
    .map((entry) => path.join(root, entry.name));
}

function normalizeDir(dir) {
  if (!dir) return '';
  try {
    return path.resolve(String(dir).replace(/^"|"$/g, '').trim());
  } catch {
    return '';
  }
}

async function isDirectory(dir) {
  try {
    return (await fsp.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

function createGameDetector(options = {}) {
  const readIcon = typeof options.readIcon === 'function' ? options.readIcon : null;
  const processProvider = typeof options.processProvider === 'function'
    ? options.processProvider
    : (process.platform === 'win32' ? listWindowsProcesses : listUnixProcesses);
  const extraInstalls = Array.isArray(options.extraInstalls) ? options.extraInstalls : [];

  let catalog = { dirs: [] };
  let catalogAt = 0;
  let refreshing = false;
  let iconCache = new Map();
  let disposed = false;

  function ensureCatalog() {
    if (disposed || refreshing) return;
    if (catalogAt && Date.now() - catalogAt < CATALOG_TTL_MS) return;
    void refreshCatalog();
  }

  async function addInstall(target, install) {
    const dir = normalizeDir(install?.dir);
    const name = cleanGameName(install?.name);
    if (!dir || !name || isKnownNoiseName(name)) return;
    if (!(await isDirectory(dir))) return;
    target.dirs.push({ dir, lower: dir.toLowerCase().replace(/[\\/]+$/, ''), name, platform: install.platform || platformFromPath(dir) });
  }

  async function buildCatalog() {
    const next = { dirs: [] };
    const installs = [];
    const seen = new Set();
    const addInstallItem = (item) => {
      const dir = normalizeDir(item?.dir);
      const name = cleanGameName(item?.name);
      if (!dir || !name || isKnownNoiseName(name)) return;
      const key = `${dir.toLowerCase()}|${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      installs.push({ ...item, dir, name });
    };

    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFiles86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const steamRoots = new Set([
      path.join(programFiles, 'Steam'),
      path.join(programFiles86, 'Steam'),
      path.join(local, 'Steam'),
      'C:\\Steam',
      'D:\\Steam',
    ]);
    const steamReg = await new Promise((resolve) => {
      execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 8000, maxBuffer: 2e6 }, (err, stdout) => {
        if (err) return resolve('');
        const match = /SteamPath\s+REG_SZ\s+(.+)/i.exec(String(stdout || ''));
        resolve(match ? match[1].trim() : '');
      });
    });
    if (steamReg) steamRoots.add(steamReg);

    const steamLibraries = new Set();
    for (const root of steamRoots) {
      const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
      try {
        const text = await fsp.readFile(vdf, 'utf8');
        for (const library of parseSteamLibraryFolders(text)) steamLibraries.add(library);
      } catch { /* brak biblioteki */ }
      steamLibraries.add(root);
    }

    for (const library of steamLibraries) {
      const appsDir = path.join(library, 'steamapps');
      let entries;
      try {
        entries = await fsp.readdir(appsDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !/^appmanifest_\d+\.acf$/i.test(entry.name)) continue;
        try {
          const text = await fsp.readFile(path.join(appsDir, entry.name), 'utf8');
          const acf = parseAcf(text);
          if (!acf.name || !acf.installdir) continue;
          if (isKnownNoiseName(acf.name)) continue;
          addInstallItem({ dir: path.join(appsDir, 'common', acf.installdir), name: acf.name, platform: 'steam' });
        } catch { /* pomijamy uszkodzony manifest */ }
      }
    }

    const epicManifestDirs = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'),
      path.join(local, 'EpicGamesLauncher', 'Data', 'Manifests'),
    ];
    for (const manifestDir of epicManifestDirs) {
      let entries;
      try {
        entries = await fsp.readdir(manifestDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !/\.item$/i.test(entry.name)) continue;
        try {
          const data = JSON.parse(await fsp.readFile(path.join(manifestDir, entry.name), 'utf8'));
          const name = data.DisplayName || data.AppName || data.MandatoryAppFolderName;
          if (!name || !data.InstallLocation) continue;
          addInstallItem({
            dir: data.InstallLocation,
            name,
            platform: 'epic',
            exe: data.LaunchExecutable || data.Executable || '',
          });
        } catch { /* pomijamy uszkodzony manifest */ }
      }
    }

    try {
      const launcherInstalled = JSON.parse(await fsp.readFile(
        path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
        'utf8',
      ));
      for (const item of Array.isArray(launcherInstalled.InstallationList) ? launcherInstalled.InstallationList : []) {
        if (!item.InstallLocation || !item.AppName) continue;
        addInstallItem({
          dir: item.InstallLocation,
          name: prettifyProcessName(item.AppName),
          platform: 'epic',
        });
      }
    } catch { /* brak listy Epic */ }

    for (const root of [
      path.join(programFiles, 'Epic Games'),
      path.join(programFiles86, 'Epic Games'),
    ]) {
      for (const dir of await listSubdirs(root)) {
        addInstallItem({ dir, name: path.basename(dir), platform: 'epic' });
      }
    }

    for (const root of [
      path.join(programFiles, 'EA Games'),
      path.join(programFiles86, 'EA Games'),
      path.join(programFiles, 'Electronic Arts'),
      path.join(programFiles86, 'Electronic Arts'),
    ]) {
      for (const dir of await listSubdirs(root)) {
        addInstallItem({ dir, name: path.basename(dir), platform: 'ea' });
      }
    }

    for (const root of [
      path.join(programFiles, 'Ubisoft', 'Ubisoft Game Launcher', 'games'),
      path.join(programFiles86, 'Ubisoft', 'Ubisoft Game Launcher', 'games'),
    ]) {
      for (const dir of await listSubdirs(root)) {
        addInstallItem({ dir, name: path.basename(dir), platform: 'ubisoft' });
      }
    }

    for (const root of [
      'C:\\XboxGames',
      'C:\\Riot Games',
      'C:\\GOG Games',
      'C:\\Games',
      path.join(programFiles86, 'GOG Galaxy', 'Games'),
      path.join(programFiles, 'GOG Galaxy', 'Games'),
      path.join(local, 'itch', 'apps'),
      path.join(roaming, 'itch', 'apps'),
    ]) {
      const platform = platformFromPath(root);
      for (const dir of await listSubdirs(root)) {
        addInstallItem({ dir, name: path.basename(dir), platform });
      }
    }

    for (const root of [
      path.join(local, 'Roblox', 'Versions'),
      path.join(local, 'Fishstrap', 'Versions'),
    ]) {
      for (const dir of await listSubdirs(root)) {
        addInstallItem({
          dir,
          name: 'Roblox',
          platform: 'roblox',
          exe: path.join(dir, 'RobloxPlayerBeta.exe'),
        });
      }
    }

    for (const root of [
      path.join(programFiles, 'Rockstar Games'),
      path.join(programFiles86, 'Rockstar Games'),
    ]) {
      for (const dir of await listSubdirs(root)) {
        addInstallItem({ dir, name: path.basename(dir), platform: 'other' });
      }
    }

    const uninstallQueries = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];
    const regTexts = await Promise.all(uninstallQueries.map((key) => runReg(key)));
    for (const text of regTexts) {
      for (const entry of parseRegEntries(text)) {
        const name = cleanGameName(entry.displayname);
        if (!name || isKnownNoiseName(name)) continue;
        const publisher = normalizeText(entry.publisher);
        const dir = normalizeDir(entry.installlocation);
        const icon = displayIconPath(entry.displayicon);
        const gamesPath = GAME_PATH_RE.test(dir) || GAME_PATH_RE.test(icon);
        if (!GAME_PUBLISHER_RE.test(publisher) && !gamesPath) continue;
        if (!dir && !icon) continue;
        const installDir = dir || (icon ? path.dirname(icon) : '');
        addInstallItem({
          dir: installDir,
          name,
          platform: platformFromPath(installDir || icon),
        });
      }
    }

    for (const item of extraInstalls) addInstallItem(item);

    const limited = installs.slice(0, CATALOG_MAX_INSTALLS);
    for (const item of limited) await addInstall(next, item);
    next.dirs.sort((a, b) => b.lower.length - a.lower.length);
    if (!disposed) {
      catalog = next;
      catalogAt = Date.now();
    }
  }

  async function refreshCatalog() {
    if (refreshing || disposed) return;
    refreshing = true;
    try {
      await buildCatalog();
    } catch (err) {
      console.error('[game-detect] Nie udało się zbudować katalogu gier:', err?.message || err);
    } finally {
      refreshing = false;
    }
  }

  function findCatalogEntry(procPath) {
    if (!procPath) return null;
    const full = normalizeDir(procPath);
    if (!full) return null;
    const lower = full.toLowerCase();
    for (const dir of catalog.dirs) {
      if (lower === dir.lower || lower.startsWith(`${dir.lower}\\`)) return dir;
    }
    return null;
  }

  function resolveGame(proc) {
    const base = processBase(proc?.name);
    if (!base || isHelperName(base)) return null;

    const catalogEntry = findCatalogEntry(proc.path);
    if (catalogEntry) {
      const name = cleanGameName(catalogEntry.name);
      if (name) {
        return {
          name,
          platform: catalogEntry.platform || platformFromPath(proc.path),
          exe: proc.path || '',
          priority: 100,
          title: proc.title || '',
          start: proc.start || 0,
        };
      }
    }

    const known = matchKnownProcess(proc);
    if (known) {
      return {
        name: known.name,
        platform: known.platform,
        exe: proc.path || '',
        priority: 90,
        title: proc.title || '',
        start: proc.start || 0,
      };
    }

    if (EXCLUDED_NAMES.has(base)) return null;
    if (proc.path && /^[a-z]:\\windows\\/i.test(proc.path)) return null;
    if (proc.path && /\\windowsapps\\/i.test(proc.path) && !/minecraft|roblox|xboxgames/i.test(proc.path)) return null;
    if (proc.title && NON_GAME_TITLE_RE.test(proc.title)) return null;

    const score = scoreHeuristic(proc, base);
    if (score < 3) return null;
    return {
      name: pickHeuristicName(proc, base),
      platform: platformFromPath(proc.path),
      exe: proc.path || '',
      priority: 10 + score,
      title: proc.title || '',
      start: proc.start || 0,
    };
  }

  function cacheGet(key) {
    const entry = iconCache.get(key);
    if (!entry) return undefined;
    if (!entry.value && Date.now() - entry.at > ICON_RETRY_MS) {
      iconCache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function cacheSet(key, value) {
    if (iconCache.size >= MAX_CACHE) {
      const first = iconCache.keys().next().value;
      if (first) iconCache.delete(first);
    }
    iconCache.set(key, { value, at: Date.now() });
  }

  async function iconFor(exe) {
    if (!readIcon || !exe) return '';
    const key = normalizeDir(exe) || exe;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    let value = '';
    try {
      value = sanitizeIcon(await readIcon(exe));
    } catch {
      value = '';
    }
    cacheSet(key, value);
    return value;
  }

  async function detect() {
    if (disposed) return null;
    ensureCatalog();
    let processes = [];
    try {
      processes = await processProvider();
    } catch {
      processes = [];
    }
    if (!Array.isArray(processes) || !processes.length) return null;

    const candidates = [];
    const seenNames = new Set();
    for (const proc of processes) {
      const resolved = resolveGame(proc);
      if (!resolved) continue;
      const nameKey = resolved.name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);
      candidates.push(resolved);
    }
    if (!candidates.length) return null;

    candidates.sort((a, b) => b.priority - a.priority
      || Number(Boolean(b.title)) - Number(Boolean(a.title))
      || (b.start || 0) - (a.start || 0)
      || a.name.localeCompare(b.name));

    let best = candidates[0];
    let bestIcon = await iconFor(best.exe);
    if (!bestIcon) {
      for (const candidate of candidates.slice(1).filter((item) => item.name === best.name)) {
        const icon = await iconFor(candidate.exe);
        if (icon) {
          best = candidate;
          bestIcon = icon;
          break;
        }
      }
    }

    return {
      name: best.name,
      icon: bestIcon,
      exe: best.exe,
      platform: best.platform || 'other',
    };
  }

  function dispose() {
    disposed = true;
    catalog = { dirs: [] };
    iconCache = new Map();
  }

  return {
    detect,
    refreshCatalog,
    warmup: ensureCatalog,
    dispose,
  };
}

module.exports = {
  createGameDetector,
  __test: {
    cleanGameName,
    prettifyProcessName,
    matchKnownProcess,
    scoreHeuristic,
    pickHeuristicName,
    platformFromPath,
    parseSteamLibraryFolders,
    parseAcf,
    parseRegEntries,
    displayIconPath,
    sanitizeIcon,
    isHelperName,
    isKnownNoiseName,
  },
};
