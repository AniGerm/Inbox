# Fax Inbox

Desktop-Inbox für eingehende Fax-PDFs (z. B. Ricoh IM350F). Überwacht den Faxordner, zeigt neue Dateien mit Badge und Benachrichtigung, Vorschau, Drucken und Löschen.

**Plattformen:** Windows und Ubuntu · **Stack:** Electron, Vite, React, TypeScript · **Format:** nur PDF

## Voraussetzungen

- Node.js 20+ (empfohlen 22)
- npm 10+

## Entwicklung

```bash
npm install
npm run dev
```

Beim ersten Start den Faxordner wählen. Die App läuft mit Hot-Reload über Vite.

## Build

Alle Targets (je nach Host-OS eingeschränkt):

```bash
npm run dist
```

Nur Windows (NSIS + portable):

```bash
npm run dist:win
```

Nur Linux (AppImage + deb):

```bash
npm run dist:linux
```

Artefakte liegen unter `release/`.

> Windows-Installer unter Linux bauen erfordert `wine` (optional). Auf Windows können Linux-Targets mit Docker/`electron-builder` gebaut werden; am zuverlässigsten ist der jeweilige Host.

## Nutzung

1. Faxordner festlegen (Setup oder Zahnrad → Einstellungen).
2. Neue PDFs erscheinen im **Posteingang** (neueste zuerst), ungelesen mit Punkt.
3. Klick öffnet die Vorschau und markiert als gelesen.
4. **Archivieren** verschiebt die Datei nach `Faxordner/Archiv/` · **Umbenennen** ändert den Dateinamen.
5. In der Vorschau: Zoom (+/−), **Anpassen** (Seitenbreite), **Drehen**.
6. **Drucken** öffnet den Systemdruckdialog · **Löschen** fragt nach.
7. Tray-Icon zeigt ungelesene Anzahl; Klick öffnet das Fenster.

### Tastatur

| Taste | Aktion |
| --- | --- |
| ↑ / ↓ | Liste navigieren |
| Entf | Löschen (mit Bestätigung) |
| Strg+P | Drucken |
| Strg+R | Umbenennen |

### Einstellungen

- Faxordner-Pfad
- Benachrichtigungen an/aus
- Autostart (Windows / Ubuntu)

Ungelesen-Status liegt in `userData/inbox-state.json`.

## Nicht im MVP

OCR, E-Mail-Weiterleitung, Scanordner, TIFF, Cloud-Sync.
