#!/bin/bash
BASE="https://buildersclaw.vercel.app"
SECRET="buildersclaw-test-2026"
HID="e3f36f45-4dab-454f-a5d1-f70afd432cdb"

jp() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }

seed() {
  curl -s -X POST "$BASE/api/v1/seed-test" \
    -H "Content-Type: application/json" \
    -H "x-seed-secret: $SECRET" \
    -d "$1"
}

reg() {
  local name=$1 display=$2
  local res=$(curl -s -X POST "$BASE/api/v1/agents/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"display_name\":\"$display\",\"model\":\"gemini\"}")
  local key=$(echo "$res" | jp "['data']['agent']['api_key']")
  local aid=$(echo "$res" | jp "['data']['agent']['id']")
  # Credits
  curl -s -X POST "$BASE/api/v1/balance/test-credit" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $key" \
    -d "{\"secret\":\"$SECRET\",\"amount_usd\":5}" > /dev/null
  echo "$key|$aid"
}

add_member() {
  local team_id=$1 agent_id=$2 leader_id=$3 role=$4 share=$5
  seed "{\"action\":\"add_member\",\"team_id\":\"$team_id\",\"agent_id\":\"$agent_id\",\"leader_id\":\"$leader_id\",\"role\":\"$role\",\"share_pct\":$share}"
}

echo "Using hackathon: $HID"
echo ""

TS=$(date +%s)

echo "═══ 1. REGISTER AGENTS ═══"
# Team Alpha agents
A1=$(reg "alpha_ceo_$TS" "Alpha CEO"); A1_KEY=${A1%%|*}; A1_ID=${A1##*|}; echo "  Alpha CEO: $A1_ID"
A2=$(reg "alpha_fe_$TS" "Alpha Frontend"); A2_KEY=${A2%%|*}; A2_ID=${A2##*|}; echo "  Alpha Frontend: $A2_ID"
A3=$(reg "alpha_ux_$TS" "Alpha UX"); A3_KEY=${A3%%|*}; A3_ID=${A3##*|}; echo "  Alpha UX: $A3_ID"

# Team Beta agents
B1=$(reg "beta_boss_$TS" "Beta Boss"); B1_KEY=${B1%%|*}; B1_ID=${B1##*|}; echo "  Beta Boss: $B1_ID"
B2=$(reg "beta_eng_$TS" "Beta Engineer"); B2_KEY=${B2%%|*}; B2_ID=${B2##*|}; echo "  Beta Engineer: $B2_ID"

# Team Gamma agents (full team of 4)
G1=$(reg "gamma_pm_$TS" "Gamma PM"); G1_KEY=${G1%%|*}; G1_ID=${G1##*|}; echo "  Gamma PM: $G1_ID"
G2=$(reg "gamma_fe_$TS" "Gamma Frontend"); G2_KEY=${G2%%|*}; G2_ID=${G2##*|}; echo "  Gamma Frontend: $G2_ID"
G3=$(reg "gamma_be_$TS" "Gamma Backend"); G3_KEY=${G3%%|*}; G3_ID=${G3##*|}; echo "  Gamma Backend: $G3_ID"
G4=$(reg "gamma_qa_$TS" "Gamma QA"); G4_KEY=${G4%%|*}; G4_ID=${G4##*|}; echo "  Gamma QA: $G4_ID"

# Solo
S1=$(reg "solo_ace_$TS" "Solo Ace"); S1_KEY=${S1%%|*}; S1_ID=${S1##*|}; echo "  Solo Ace: $S1_ID"

echo ""
echo "═══ 2. CREATE TEAMS ═══"
T1=$(curl -s -X POST "$BASE/api/v1/hackathons/$HID/join" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $A1_KEY" \
  -d '{"name":"Team Alpha","color":"#00ffaa"}' | jp "['data']['team']['id']")
echo "  Team Alpha: $T1"

T2=$(curl -s -X POST "$BASE/api/v1/hackathons/$HID/join" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $B1_KEY" \
  -d '{"name":"Team Beta","color":"#ff6b6b"}' | jp "['data']['team']['id']")
echo "  Team Beta: $T2"

T3=$(curl -s -X POST "$BASE/api/v1/hackathons/$HID/join" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $G1_KEY" \
  -d '{"name":"Team Gamma","color":"#ffd93d"}' | jp "['data']['team']['id']")
echo "  Team Gamma: $T3"

T4=$(curl -s -X POST "$BASE/api/v1/hackathons/$HID/join" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $S1_KEY" \
  -d '{"name":"Lone Wolf","color":"#a29bfe"}' | jp "['data']['team']['id']")
echo "  Lone Wolf: $T4"

echo ""
echo "═══ 3. ADD TEAM MEMBERS (via seed-test) ═══"
# Alpha: lead (65%) + frontend (20%) + ux (15%)
echo -n "  Alpha +Frontend (20%): "; add_member "$T1" "$A2_ID" "$A1_ID" "frontend" 20 | jp "['data']['ok']"
echo -n "  Alpha +UX (15%): "; add_member "$T1" "$A3_ID" "$A1_ID" "designer" 15 | jp "['data']['ok']"

# Beta: lead (75%) + engineer (25%)
echo -n "  Beta +Engineer (25%): "; add_member "$T2" "$B2_ID" "$B1_ID" "backend" 25 | jp "['data']['ok']"

# Gamma: lead (55%) + frontend (20%) + backend (15%) + qa (10%)
echo -n "  Gamma +Frontend (20%): "; add_member "$T3" "$G2_ID" "$G1_ID" "frontend" 20 | jp "['data']['ok']"
echo -n "  Gamma +Backend (15%): "; add_member "$T3" "$G3_ID" "$G1_ID" "backend" 15 | jp "['data']['ok']"
echo -n "  Gamma +QA (10%): "; add_member "$T3" "$G4_ID" "$G1_ID" "qa" 10 | jp "['data']['ok']"

echo ""
echo "═══ 4. VERIFY ═══"
curl -s "$BASE/api/v1/hackathons/$HID/judge" | python3 -c "
import sys,json
data=json.load(sys.stdin)
for t in data.get('data',[]):
    print(f\"  {t['team_name']}: {len(t['members'])} members\")
    for m in t['members']:
        print(f\"    - {m.get('agent_display_name',m.get('agent_name','?'))} ({m.get('role','?')}, {m.get('revenue_share_pct','?')}%)\")
"

echo ""
echo "═══ DONE ═══"
echo "View: $BASE/hackathons/$HID"
