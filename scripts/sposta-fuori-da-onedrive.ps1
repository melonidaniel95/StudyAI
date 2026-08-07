<#
.SYNOPSIS
    Sposta StudyAI fuori da OneDrive e ripristina un ambiente di sviluppo pulito.

.DESCRIPTION
    OneDrive sincronizza in tempo reale ogni file del progetto. Con Node questo
    causa tre problemi ricorrenti:

      * "EINVAL: invalid argument, readlink ... app\(app)"  → OneDrive trasforma
        le cartelle in reparse point e Node non riesce a leggerle;
      * "ENOENT: rename 0.pack.gz_ -> 0.pack.gz"            → OneDrive intercetta
        le rinomine mentre webpack scrive la cache;
      * npm install che fallisce a metà                     → i file dentro
        node_modules vengono bloccati durante l'installazione.

    Questo script sposta il progetto in una cartella non sincronizzata,
    reinstalla le dipendenze e verifica che tutto sia a posto.
    I file .env.local e la cronologia Git vengono spostati insieme al resto.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\sposta-fuori-da-onedrive.ps1

.PARAMETER Destinazione
    Cartella di destinazione. Predefinita: %USERPROFILE%\Progetti\StudyAI
#>

param(
    [string]$Destinazione = (Join-Path $env:USERPROFILE 'Progetti\StudyAI')
)

$ErrorActionPreference = 'Stop'

function Scrivi($testo, $colore = 'White') { Write-Host $testo -ForegroundColor $colore }

$origine = Split-Path -Parent $PSScriptRoot

Scrivi ''
Scrivi '  StudyAI — spostamento fuori da OneDrive' 'Cyan'
Scrivi '  ---------------------------------------' 'Cyan'
Scrivi "  Da:  $origine"
Scrivi "  A:   $Destinazione"
Scrivi ''

if ($origine -notlike '*OneDrive*') {
    Scrivi '  Il progetto non si trova dentro OneDrive: non serve spostarlo.' 'Green'
    exit 0
}

if (Test-Path $Destinazione) {
    Scrivi "  La cartella di destinazione esiste già: $Destinazione" 'Red'
    Scrivi '  Rinominala o indica un percorso diverso con -Destinazione.' 'Red'
    exit 1
}

# --- 1. Nessun processo deve tenere aperti i file ---
$processi = Get-Process node -ErrorAction SilentlyContinue
if ($processi) {
    Scrivi '  Sono in esecuzione dei processi Node (probabilmente "npm run dev").' 'Yellow'
    $risposta = Read-Host '  Li chiudo? [s/N]'
    if ($risposta -eq 's') {
        $processi | Stop-Process -Force
        Start-Sleep -Seconds 2
        Scrivi '  Processi Node chiusi.' 'Green'
    } else {
        Scrivi '  Chiudi il server di sviluppo e rilancia lo script.' 'Red'
        exit 1
    }
}

# --- 2. Via le cartelle rigenerabili: lo spostamento diventa veloce ---
foreach ($cartella in @('.next', 'node_modules')) {
    $percorso = Join-Path $origine $cartella
    if (Test-Path $percorso) {
        Scrivi "  Rimuovo $cartella (verrà ricreata)..."
        Remove-Item -Recurse -Force $percorso -ErrorAction SilentlyContinue
    }
}

# --- 3. Spostamento ---
Scrivi '  Sposto il progetto...'
$cartellaPadre = Split-Path -Parent $Destinazione
if (-not (Test-Path $cartellaPadre)) {
    New-Item -ItemType Directory -Force -Path $cartellaPadre | Out-Null
}
Move-Item -Path $origine -Destination $Destinazione
Scrivi '  Progetto spostato.' 'Green'

# --- 4. Dipendenze ---
Set-Location $Destinazione
Scrivi '  Installo le dipendenze (può richiedere qualche minuto)...'
npm install
if ($LASTEXITCODE -ne 0) {
    Scrivi '  npm install non è andato a buon fine. Rilancialo a mano da questa cartella.' 'Red'
    exit 1
}

# --- 5. Verifica ---
Scrivi ''
Scrivi '  Verifica finale:' 'Cyan'

$env_locale = Join-Path $Destinazione '.env.local'
if (Test-Path $env_locale) { Scrivi '   [ok] .env.local presente' 'Green' }
else { Scrivi '   [!]  .env.local mancante: ricrealo da .env.example' 'Yellow' }

$pdf = Join-Path $Destinazione 'public\pdf.min.mjs'
$worker = Join-Path $Destinazione 'public\pdf.worker.min.mjs'
if ((Test-Path $pdf) -and (Test-Path $worker)) {
    Scrivi '   [ok] pdf.js in public: importazione del materiale attiva' 'Green'
} else {
    Scrivi '   [!]  pdf.js mancante: esegui "npm run setup:pdf-worker"' 'Yellow'
}

if (Test-Path (Join-Path $Destinazione '.git')) { Scrivi '   [ok] cronologia Git spostata' 'Green' }

Scrivi ''
Scrivi '  Fatto. Ora puoi lavorare da qui:' 'Green'
Scrivi "     cd `"$Destinazione`""
Scrivi '     npm run dev'
Scrivi ''
Scrivi '  Suggerimento: aggiungi questa cartella alle esclusioni dell antivirus' 'DarkGray'
Scrivi '  per rendere le build sensibilmente piu veloci.' 'DarkGray'
Scrivi ''
