# Fax Inbox

Desktop-Inbox für eingehende Fax-PDFs (z. B. Ricoh IM350F).

**Plattformen:** Windows und Ubuntu · **Stack:** Electron + Vite + React + TypeScript · **Format:** nur PDF

## Installation

Ein Install-Skript baut die App und richtet sie ein.  
**Node.js wird nur zum einmaligen Bauen** gebraucht. Die fertige App enthält Electron bereits — **kein Node zur Laufzeit**.

---

### Ubuntu

```bash
git clone https://github.com/AniGerm/Inbox.git
cd Inbox
chmod +x install.sh scripts/install.sh
./install.sh
```

Das Skript:

1. installiert Node.js 22 falls fehlend (NodeSource, benötigt `sudo`)
2. installiert Electron-Systempakete falls nötig
3. baut **AppImage** + **`.deb`**
4. installiert das **`.deb` systemweit** → **„Fax Inbox“** im Anwendungsmenü (Büro/Office)
5. kopiert das **AppImage** nach `~/Applications/`
6. startet die App

Danach im Menü **Fax Inbox** suchen — oder:

```bash
fax-inbox
# bzw. portable:
~/Applications/Fax-Inbox-*.AppImage
```

---

### Windows

**Wichtig:** Immer unter dem **Benutzerordner** arbeiten, nie unter `C:\Windows\System32`.

Richtig: `C:\Users\<DeinName>\Inbox` (= `%USERPROFILE%\Inbox`)

#### Schritt 1 — Node.js + npm (Pflicht)

1. [Node.js LTS](https://nodejs.org/) installieren (enthält **npm**).
2. PowerShell **neu öffnen**.
3. Prüfen:

```powershell
node -v
npm -v
```

Beide Befehle müssen eine Version zeigen (**Node ≥ 20**).

#### Schritt 2 — Frisch nach `%USERPROFILE%` klonen

Falls `git` fehlt: [Git for Windows](https://git-scm.com/download/win), dann PowerShell neu öffnen.

```powershell
cd $env:USERPROFILE
Remove-Item -Recurse -Force .\Inbox -ErrorAction SilentlyContinue
git clone https://github.com/AniGerm/Inbox.git
cd .\Inbox
git checkout main
git pull origin main
dir
```

Nach dem Clone **müssen** im Hauptverzeichnis u. a. stehen:

- `install.cmd`  ← Start hier
- `install.ps1`
- `package.json`
- Ordner `scripts\`, `src\`, `resources\`

Fehlt `install.cmd`:

```powershell
git fetch origin main
git checkout origin/main -- install.cmd install.ps1
dir .\install.cmd
```

**Ohne Git (ZIP):** https://github.com/AniGerm/Inbox/archive/refs/heads/main.zip  
→ entpacken nach `%USERPROFILE%\Inbox` → dort `dir` prüfen (gleiche Dateien).

#### Schritt 3 — Installieren

```powershell
cd $env:USERPROFILE\Inbox
.\install.cmd
```

Alternativen, falls `install.cmd` blockiert wird:

```powershell
.\scripts\install.cmd
# oder:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Das Skript:

1. bricht ab, wenn der Ordner unter `System32` liegt
2. prüft Node.js / npm
3. baut den **NSIS-Setup** nach `release\`
4. startet den **Setup-Assistenten**

Im Assistenten: **Weiter → Installieren → Fertig** durchklicken.  
Danach Startmenü → **„Fax Inbox“**  
Installationspfad typisch: `%LOCALAPPDATA%\Programs\fax-inbox\Fax Inbox.exe`

---

## Was du bekommst

| OS | Artefakte | Integration |
| --- | --- | --- |
| Ubuntu | `.deb` + `.AppImage` in `release/` | `.deb` → App-Menü; AppImage → `~/Applications` |
| Windows | NSIS Setup + portable `.exe` in `release\` | Startmenü + Desktop (NSIS) |

## Nur entwickeln (ohne Installation)

```bash
./scripts/setup.sh --dev          # Ubuntu
.\scripts\setup.ps1 -Dev          # Windows
```

## Hinweis

- Cross-Build (Windows-Installer unter Linux) ist nicht vorgesehen — jeweils auf dem Ziel-OS ausführen.

## Ubuntu: App startet nicht / klicken tut nichts

**Sofort-Fix** (häufigste Ursache — `chrome-sandbox` ohne root/setuid):

```bash
sudo chown root:root "/opt/Fax Inbox/chrome-sandbox"
sudo chmod 4755 "/opt/Fax Inbox/chrome-sandbox"
fax-inbox --no-sandbox
```

1. Im Terminal starten (zeigt Fehler statt still zu sterben):

```bash
fax-inbox --no-sandbox
# oder
ELECTRON_DISABLE_SANDBOX=1 ~/Applications/Fax-Inbox-*.AppImage --no-sandbox
```

2. Log vom Installer/Start prüfen:

```bash
tail -n 80 ~/.local/share/fax-inbox/launch.log
```

3. Neu installieren:

```bash
cd ~/Inbox   # bzw. dein Clone-Pfad
./install.sh
```

Häufige Ursachen: fehlendes `libfuse2` (AppImage), Chromium-Sandbox, oder ein unsichtbarer Hintergrundprozess — `pkill -f fax-inbox` und danach erneut starten.

## Windows: Installer / Build schlägt fehl

| Symptom | Ursache | Lösung |
| --- | --- | --- |
| `git` nicht erkannt | Git fehlt | [Git for Windows](https://git-scm.com/download/win) oder ZIP-Variante |
| ExecutionPolicy / Skripte deaktiviert | PowerShell-Policy | `.\install.cmd` verwenden |
| `MissingEndCurlyBrace` / kaputte Zeichen | veraltetes Skript | `git pull` bzw. frisches ZIP von **main** |
| `StdUtils.nsh` / NSIS-Fehler | Build unter `System32` | nach `%USERPROFILE%\Inbox` verschieben, dort erneut `.\install.cmd` |
| `node` / `npm` nicht erkannt | Node fehlt oder PATH | Schritt 1 — Node LTS, PowerShell neu öffnen |
| Build hängt >20 Min. nach `preload.js` | oft `winCodeSign`-Download / Defender | **Strg+C**, Windows-Defender-Ausschluss für den Projektordner, dann erneut `.\install.cmd` |

## Nutzung

1. Faxordner festlegen (Setup oder Zahnrad).
2. PDFs erscheinen im Posteingang (Heute / Gestern / Vorgestern / Später).
3. Systembenachrichtigung bei neuem Fax → Klick öffnet die App beim Fax.
4. Vorschau: Zoom, Anpassen, Drehen · Archivieren · Umbenennen · Drucken · Löschen.
5. Einstellungen → **Autostart**: startet die App nach dem Anmelden (Windows und Ubuntu).
6. Einstellungen → **Drucken**: Standard ist „PDF im Standardprogramm öffnen“ (zuverlässig). Optional „Direkt drucken (Systemdialog)“ — unter Windows der Windows-Druckdialog.

## Nicht im MVP

OCR, E-Mail, Scanordner, TIFF, Cloud-Sync.
