#!/usr/bin/env bash
# measure-android-start.sh <apk> <label> [runs]
#
# Kaltstart (Prozess neu, Seitencache warm) und Speicher der App im Emulator
# (Messplan in docs/katalog-je-lernsprache-konzept.md, Abschnitt 10).
# Ausgabe nach $OUT_DIR (Vorgabe: measurements/ neben scripts/, gitignored):
#   measure-<label>.txt   je Lauf Startzeit, PSS, Unknown (Hermes-Heap), Code,
#                         dazu die [catalog]-Zeilen aus dem JS-Log; am Ende der Median
#   peak-<label>.txt      Speicher im Sekundentakt während der ersten 5 s eines Starts
#   meminfo/crash/js-<label>.txt  letzter dumpsys-Abzug, Absturz- und JS-Log
set -u
APK=$1; LABEL=$2; RUNS=${3:-12}
ADB="$HOME/Android/Sdk/platform-tools/adb"
PKG=com.thailernbegleiter.app
ACT=$PKG/.MainActivity
DIR=${OUT_DIR:-$(dirname "$0")/../measurements}
mkdir -p "$DIR"; OUT=$DIR/measure-$LABEL.txt
: > "$OUT"
$ADB install -r "$APK" >/dev/null || { echo "install failed"; exit 1; }

catalog_log() { $ADB logcat -d -s 'ReactNativeJS:*' | grep -o '\[catalog\].*' | tr -d '\r' | tr '\n' ' '; }
# "Code:" aus der App-Zusammenfassung (Pss), "Unknown" aus der Tabellenzeile
# (Pss Total; in der Zusammenfassung steht dort nur Rss).
summary_kb() { echo "$1" | awk -v row="$2" '$0 ~ "^ *" row ":" {print $2; exit}'; }
unknown_kb() { echo "$1" | awk '/^ *Unknown /{print $2; exit}'; }

# Erster Start nach Installation: Dex-Optimierung, Datenbank, Kopie aus res/raw.
$ADB shell am force-stop $PKG; sleep 2
$ADB logcat -c
FIRST=$($ADB shell am start -W -n $ACT | tr -d '\r' | awk -F': ' '/TotalTime/{print $2}')
sleep 20
echo "first-start totalTimeMs=$FIRST $(catalog_log)" | tee -a "$OUT"

for i in $(seq 1 "$RUNS"); do
  $ADB shell am force-stop $PKG; sleep 3
  $ADB logcat -c
  T=$($ADB shell am start -W -n $ACT | tr -d '\r' | awk -F': ' '/TotalTime/{print $2}')
  sleep 15
  M=$($ADB shell dumpsys meminfo $PKG | tr -d '\r')
  PSS=$(echo "$M" | awk '/TOTAL PSS:/{print $3; exit}')
  UNK=$(unknown_kb "$M")
  CODE=$(summary_kb "$M" Code)
  echo "run=$i totalTimeMs=$T pssKB=$PSS unknownKB=$UNK codeKB=$CODE $(catalog_log)" | tee -a "$OUT"
done
echo "$M" > "$DIR/meminfo-$LABEL.txt"

# Spitze beim Start: dumpsys im Sekundentakt (ein Abzug dauert selbst ~0,5 s).
$ADB shell am force-stop $PKG; sleep 3
$ADB shell am start -n $ACT >/dev/null
: > "$DIR/peak-$LABEL.txt"
for s in 1 2 3 4 5; do
  P=$($ADB shell dumpsys meminfo $PKG | tr -d '\r')
  echo "t=$s pssKB=$(echo "$P" | awk '/TOTAL PSS:/{print $3; exit}') unknownKB=$(unknown_kb "$P")" >> "$DIR/peak-$LABEL.txt"
  sleep 1
done
$ADB logcat -d -b crash | tail -20 > "$DIR/crash-$LABEL.txt"
$ADB logcat -d -s 'ReactNativeJS:*' | tail -40 > "$DIR/js-$LABEL.txt"

median() { grep '^run=' "$OUT" | grep -o "$1=[0-9]*" | cut -d= -f2 | sort -n | awk '{v[NR]=$1} END {print v[int((NR+1)/2)]}'; }
PEAK=$(grep -o 'pssKB=[0-9]*' "$DIR/peak-$LABEL.txt" | cut -d= -f2 | sort -n | tail -1)
echo "median totalTimeMs=$(median totalTimeMs) pssKB=$(median pssKB) unknownKB=$(median unknownKB) codeKB=$(median codeKB) peakPssKB=$PEAK (n=$RUNS)" | tee -a "$OUT"
