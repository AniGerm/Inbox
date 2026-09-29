# Fax Inbox

Desktop-Inbox für eingehende Fax-PDFs (z. B. Ricoh IM350F).

**Plattformen:** Windows und Ubuntu · **Stack:** Electron + Vite + React + TypeScript · **Format:** nur PDF

## Fire-and-forget Installation (empfohlen)

Ein Befehl: baut die App und richtet sie **richtig** ein.  
Node.js wird **nur zum einmaligen Bauen** gebraucht und bei Bedarf automatisch installiert.  
Die fertige App enthält Electron bereits — **kein Node zur Laufzeit**.

### Ubuntu

```bash
git clone -b cursor/fax-inbox-mvp-df4f https://github.com/AniGerm/Inbox.git
cd Inbox
chmod +x install.sh scripts/install.sh
./install.sh
```

Das Skript:

1. installiert Node.js 22 falls fehlend (NodeSource, benötigt `sudo`)
2. installiert Electron-Systempakete falls nötig
3. baut **AppImage** + **`.deb`**
4. installiert das **`.deb` systemweit** → **„Fax Inbox“ erscheint im Anwendungsmenü** (Büro/Office)
5. kopiert das **AppImage** nach `~/Applications/`
6. startet die App

Danach im Menü nach **Fax Inbox** suchen — oder:

```bash
fax-inbox
# bzw. portable:
~/Applications/Fax-Inbox-*.AppImage
```

### Windows

In **PowerShell**:

```powershell
git clone -b cursor/fax-inbox-mvp-df4f https://github.com/AniGerm/Inbox.git
cd Inbox
.\install.ps1
```

Das Skript:

1. installiert Node.js LTS falls fehlend (`winget`)
2. baut **NSIS-Setup** + portable EXE
3. startet die **Setup-.exe** → Startmenü- und Desktop-Verknüpfung

Ohne Git: auf GitHub → Code → Download ZIP → entpacken → gleiches `install`-Skript.

## Was du bekommst

| OS | Artefakte | Integration |
| --- | --- | --- |
| Ubuntu | `.deb` + `.AppImage` in `release/` | `.deb` → App-Menü; AppImage → `~/Applications` |
| Windows | NSIS Setup + portable `.exe` | Startmenü + Desktop (NSIS) |

## Nur entwickeln (ohne Installation)

```bash
./scripts/setup.sh --dev          # Ubuntu
.\scripts\setup.ps1 -Dev          # Windows
```

## Hinweis

- Branch bis zum Merge: `cursor/fax-inbox-mvp-df4f` (danach reicht `main`).
- Cross-Build (Windows-Installer unter Linux) ist nicht vorgesehen — jeweils auf dem Ziel-OS ausführen.

## Nutzung

1. Faxordner festlegen (Setup oder Zahnrad).
2. PDFs erscheinen im Posteingang (Heute / Gestern / Vorgestern / Später).
3. Systembenachrichtigung bei neuem Fax → Klick öffnet die App beim Fax.
4. Vorschau: Zoom, Anpassen, Drehen · Archivieren · Umbenennen · Drucken · Löschen.

## Nicht im MVP

OCR, E-Mail, Scanordner, TIFF, Cloud-Sync.
