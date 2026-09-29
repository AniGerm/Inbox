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

**Wichtig:** Das Projekt **nicht** unter `C:\Windows\System32` ablegen.  
Dort schlägt der Installer fehl (`StdUtils.nsh` / NSIS wegen WOW64).  
Richtig z. B.: `C:\Users\<DeinName>\Inbox`

#### Schritt 1 — Node.js + npm (Pflicht)

1. [Node.js LTS](https://nodejs.org/) herunterladen und installieren (enthält **npm**).
2. PowerShell **schließen und neu öffnen**.
3. Prüfen:

```powershell
node -v
npm -v
```

Beide Befehle müssen eine Version zeigen (**Node ≥ 20**).

#### Schritt 2 — Projekt holen

**Variante A — mit Git** (empfohlen):  
Falls `git` fehlt: zuerst [Git for Windows](https://git-scm.com/download/win) installieren, PowerShell neu öffnen.

```powershell
cd $env:USERPROFILE
git clone https://github.com/AniGerm/Inbox.git
cd Inbox
```

**Variante B — ohne Git (ZIP):**

1. ZIP laden: https://github.com/AniGerm/Inbox/archive/refs/heads/main.zip
2. Entpacken nach z. B. `C:\Users\<DeinName>\Inbox`
3. In diesen Ordner wechseln:

```powershell
cd $env:USERPROFILE\Inbox
# bzw. der entpackte Ordnername, z. B. Inbox-main
```

#### Schritt 3 — Bauen & installieren

Im Projektordner (nicht System32):

```powershell
.\install.cmd
```

`install.cmd` umgeht die PowerShell-ExecutionPolicy.  
Alternativ:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

Das Skript:

1. prüft Node.js / npm (Fallback: `winget`, falls Node fehlt)
2. baut **NSIS-Setup** + portable EXE nach `release\`
3. startet die **Setup-.exe** → Einträge in **Startmenü** und optional **Desktop**

Danach **Fax Inbox** im Startmenü öffnen.

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

## Nutzung

1. Faxordner festlegen (Setup oder Zahnrad).
2. PDFs erscheinen im Posteingang (Heute / Gestern / Vorgestern / Später).
3. Systembenachrichtigung bei neuem Fax → Klick öffnet die App beim Fax.
4. Vorschau: Zoom, Anpassen, Drehen · Archivieren · Umbenennen · Drucken · Löschen.
5. Einstellungen → **Autostart**: startet die App nach dem Anmelden (Windows und Ubuntu).

## Nicht im MVP

OCR, E-Mail, Scanordner, TIFF, Cloud-Sync.
