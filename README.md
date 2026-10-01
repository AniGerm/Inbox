# Fax Inbox

Desktop-Inbox für eingehende Fax-PDFs (z. B. Ricoh IM350F).

**Plattformen:** Windows und Ubuntu · **Stack:** Electron + Vite + React + TypeScript · **Format:** nur PDF

## Installation (empfohlen)

Fertige Installer liegen als **GitHub Releases** bereit — **kein Node.js, kein Git, kein Bauen** nötig.

👉 **Releases:** https://github.com/AniGerm/Inbox/releases

### Windows (einfach)

1. Auf der [Releases-Seite](https://github.com/AniGerm/Inbox/releases) die neueste Version öffnen.
2. Unter **Assets** die Datei **`Fax-Inbox-Setup-….exe`** herunterladen (NSIS-Installer).
3. Die `.exe` starten und den Assistenten durchklicken: **Weiter → Installieren → Fertig**.
4. Startmenü → **„Fax Inbox“**  
   Typischer Pfad: `%LOCALAPPDATA%\Programs\fax-inbox\Fax Inbox.exe`

Danach aktualisiert sich die App bei neueren Releases selbst (Hinweis in der App / unter Einstellungen → Updates).  
**Nicht** die portable `.exe` für den Dauerbetrieb nutzen — Auto-Update funktioniert nur mit dem **Setup-Installer**.

### Ubuntu (einfach)

1. Auf der [Releases-Seite](https://github.com/AniGerm/Inbox/releases) die neueste Version öffnen (falls Linux-Artefakte veröffentlicht sind).
2. **`.deb`** herunterladen und installieren, z. B.:

```bash
sudo apt install ./Fax-Inbox-*.deb
# oder:
sudo dpkg -i Fax-Inbox-*.deb
```

3. Im Anwendungsmenü **Fax Inbox** starten — oder `fax-inbox` im Terminal.

Falls nur ein **AppImage** liegt:

```bash
chmod +x Fax-Inbox-*.AppImage
./Fax-Inbox-*.AppImage
```

---

## Installation aus dem Quellcode (optional)

Nur nötig, wenn du selbst bauen willst.  
**Node.js wird nur zum einmaligen Bauen** gebraucht. Die fertige App enthält Electron bereits — **kein Node zur Laufzeit**.

### Ubuntu — selbst bauen

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

### Windows — selbst bauen

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

| OS | Artefakte (Release / Build) | Integration |
| --- | --- | --- |
| Windows | `Fax-Inbox-Setup-….exe` (NSIS) auf [Releases](https://github.com/AniGerm/Inbox/releases) | Startmenü + Desktop; **Auto-Update** |
| Ubuntu | `.deb` + `.AppImage` (wenn im Release oder lokal gebaut) | `.deb` → App-Menü; AppImage → portable |

> **Hinweis Auto-Update:** Nur der **NSIS-Installer** von GitHub Releases unterstützt Updates (`latest.yml` + `.blockmap`). Portable-Builds aktualisieren sich nicht selbst.

## Release veröffentlichen (Maintainer)

Fertige Windows-Installer werden als **GitHub Release** abgelegt (empfohlen für alle Nutzer).

1. Version in `package.json` erhöhen (z. B. `0.3.0`).
2. Committen und nach `main` pushen.
3. Tag setzen und pushen — **muss** zur `package.json`-Version passen:

```bash
git tag v0.3.0
git push origin v0.3.0
# oder: git push --tags
```

Die Action `.github/workflows/release.yml` baut den Windows-NSIS-Installer und hängt ihn an das Release (`Fax-Inbox-Setup-….exe`, `latest.yml`, `.blockmap`).

Alternativ lokal bauen und manuell hochladen:

```powershell
npm run dist:win
# Artefakte unter .\release\ → als Release-Assets hochladen
```

Die installierte App prüft beim Start (nach ~10 s) und alle 4 Stunden auf Updates; Installation nur nach Bestätigung und nie während eines Druckvorgangs.

## Nur entwickeln (ohne Installation)

```bash
./scripts/setup.sh --dev          # Ubuntu
.\scripts\setup.ps1 -Dev          # Windows
```

## Hinweis

- Cross-Build (Windows-Installer unter Linux) ist nicht vorgesehen — Windows-Installer auf Windows bauen (oder die GitHub Action nutzen).

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

3. Neu installieren — bevorzugt die `.deb` vom [Release](https://github.com/AniGerm/Inbox/releases), oder:

```bash
cd ~/Inbox   # bzw. dein Clone-Pfad
./install.sh
```

Häufige Ursachen: fehlendes `libfuse2` (AppImage), Chromium-Sandbox, oder ein unsichtbarer Hintergrundprozess — `pkill -f fax-inbox` und danach erneut starten.

## Windows: Installer / Build schlägt fehl

| Symptom | Ursache | Lösung |
| --- | --- | --- |
| Windows Defender / SmartScreen | unsignierte Setup-`.exe` | „Weitere Informationen“ → trotzdem ausführen; oder Ausschluss setzen |
| `git` nicht erkannt (nur Self-Build) | Git fehlt | [Git for Windows](https://git-scm.com/download/win) oder ZIP-Variante |
| ExecutionPolicy / Skripte deaktiviert | PowerShell-Policy | Release-`.exe` nutzen oder `.\install.cmd` |
| `MissingEndCurlyBrace` / kaputte Zeichen | veraltetes Skript | `git pull` bzw. frisches ZIP von **main** |
| `StdUtils.nsh` / NSIS-Fehler | Build unter `System32` | nach `%USERPROFILE%\Inbox` verschieben, dort erneut `.\install.cmd` |
| `node` / `npm` nicht erkannt | Node fehlt oder PATH | Self-Build Schritt 1 — oder einfach die Release-`.exe` nehmen |
| Build hängt >20 Min. nach `preload.js` | oft `winCodeSign`-Download / Defender | **Strg+C**, Defender-Ausschluss, erneut — oder Release herunterladen |

## Nutzung

1. Faxordner festlegen (Setup oder Zahnrad).
2. PDFs erscheinen im Posteingang (Heute / Gestern / Vorgestern / Später).
3. Systembenachrichtigung bei neuem Fax → Klick öffnet die App beim Fax.
4. Vorschau: Zoom, Anpassen, Drehen · Archivieren · Umbenennen · Drucken · Löschen.
5. Einstellungen → **Autostart**: startet die App nach dem Anmelden (Windows und Ubuntu).
6. **Drucken**: Standard „PDF im Standardprogramm“. Unter Windows optional „Direkt auf festen Drucker“ (Drucker, Duplex, Farbe, Kopien in den Einstellungen — ohne Dialog).
7. **Updates** (Windows, Setup-Installation): Hinweisbanner bzw. Einstellungen → Updates; kein Neustart ohne Bestätigung.

## Nicht im MVP

OCR, E-Mail, Scanordner, TIFF, Cloud-Sync.
