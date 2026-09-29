# Fax Inbox

Desktop-Inbox für eingehende Fax-PDFs (z. B. Ricoh IM350F). Überwacht den Faxordner, zeigt neue Dateien mit Badge und Benachrichtigung, Vorschau, Drucken und Löschen.

**Plattformen:** Windows und Ubuntu · **Stack:** Electron, Vite, React, TypeScript · **Format:** nur PDF

## Einfach installieren (empfohlen)

Es gibt Setup-Skripte, die **Node/npm prüfen**, fehlende Hinweise ausgeben und **`npm install`** ausführen.

### Ubuntu / Linux

```bash
git clone https://github.com/AniGerm/Inbox.git
cd Inbox
./scripts/setup.sh
npm run dev
```

Optional:

```bash
./scripts/setup.sh --dev      # Setup + App starten
./scripts/setup.sh --build    # Setup + Linux-Installer (AppImage + .deb) nach release/
```

Danach dauerhaft installieren (nach `--build` oder `npm run dist:linux`):

- **AppImage:** Datei in `release/` ausführbar machen und doppelklicken  
  `chmod +x release/Fax*.AppImage && ./release/Fax*.AppImage`
- **deb:** `sudo apt install ./release/fax-inbox_*.deb`

Falls das Skript Electron-Systempakete bemängelt:

```bash
sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0
```

### Windows

In **PowerShell** im Repo:

```powershell
git clone https://github.com/AniGerm/Inbox.git
cd Inbox
.\scripts\setup.ps1
npm run dev
```

Optional:

```powershell
.\scripts\setup.ps1 -Dev     # Setup + App starten
.\scripts\setup.ps1 -Build   # Setup + Windows-Installer (NSIS + portable) nach release\
```

Installer: in `release\` die **Setup-.exe** (NSIS) ausführen oder die **portable .exe** starten.

> Node.js LTS (≥ 20) muss vorher drauf sein: https://nodejs.org/ oder `winget install OpenJS.NodeJS.LTS`

### Was die Skripte prüfen

| Check | setup.sh | setup.ps1 |
| --- | --- | --- |
| Node.js ≥ 20 | ja | ja |
| npm vorhanden | ja | ja |
| `npm install` | ja | ja |
| Linux Electron-Libs (Hinweis) | ja | — |
| Display-Session (Hinweis) | ja | — |
| Installer bauen | `--build` | `-Build` |

**Nicht** automatisch: systemweite Node-Installation (dafür sudo/winget nötig) und Cross-Build (Windows-Installer auf Ubuntu braucht Wine).

## Entwicklung (ohne Skript)

```bash
npm install
npm run dev
```

## Build

```bash
npm run dist          # Host-OS-Targets
npm run dist:win      # Windows NSIS + portable
npm run dist:linux    # AppImage + deb
```

Artefakte: `release/`.

## Nutzung

1. Faxordner festlegen (Setup oder Zahnrad → Einstellungen).
2. Neue PDFs erscheinen im **Posteingang**, gruppiert nach **Heute / Gestern / Vorgestern / Später**.
3. Klick öffnet die Vorschau und markiert als gelesen.
4. Bei neuer Datei: **Systembenachrichtigung** (Windows-Toast / Ubuntu-Notification). Klick oder **App öffnen** bringt dich direkt zum neuen Fax.
5. **Archivieren** → `Faxordner/Archiv/` · **Umbenennen** ändert den Dateinamen.
6. Vorschau: Zoom (+/−), **Anpassen**, **Drehen**.
7. **Drucken** / **Löschen** (Löschen mit Bestätigung).
8. Tray zeigt Ungelesen-Anzahl.

### Tastatur

| Taste | Aktion |
| --- | --- |
| ↑ / ↓ | Liste navigieren |
| Entf | Löschen (mit Bestätigung) |
| Strg+P | Drucken |
| Strg+R | Umbenennen |

Ungelesen-Status: `userData/inbox-state.json`.

## Nicht im MVP

OCR, E-Mail-Weiterleitung, Scanordner, TIFF, Cloud-Sync.
