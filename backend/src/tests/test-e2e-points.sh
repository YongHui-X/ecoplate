#!/bin/bash
# E2E Test: Points & Streaks System via API
# Run: bash backend/src/tests/test-e2e-points.sh

BASE="http://localhost:3000/api/v1"
PASS=0
FAIL=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $label ($actual)"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label — expected $expected, got $actual"
    FAIL=$((FAIL+1))
  fi
}

# Login
echo "Logging in as alice@demo.com..."
LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@demo.com","password":"demo123"}')
TOKEN=$(echo "$LOGIN" | python -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "Login failed: $LOGIN"
  exit 1
fi
AUTH="Authorization: Bearer $TOKEN"
echo "Logged in."
echo ""
echo "============================================================"
echo "  E2E TEST: Points & Streaks System"
echo "============================================================"

# TEST 1: Initial state
echo ""
echo "--- TEST 1: Initial state (fresh seed) ---"
P=$(curl -s "$BASE/gamification/points" -H "$AUTH")
TOTAL=$(echo "$P" | python -c "import sys,json; print(json.load(sys.stdin)['points']['total'])")
STREAK=$(echo "$P" | python -c "import sys,json; print(json.load(sys.stdin)['points']['currentStreak'])")
check "Initial total points = 0" "$TOTAL" "0"
check "Initial streak = 0" "$STREAK" "0"

# TEST 2: Consume product -> +5 pts, streak = 1
echo ""
echo "--- TEST 2: Consume product -> +5 pts, streak = 1 ---"
C=$(curl -s -X POST "$BASE/myfridge/products/1/consume" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"action":"consumed"}')
AWD=$(echo "$C" | python -c "import sys,json; print(json.load(sys.stdin)['pointsAwarded'])")
NT=$(echo "$C" | python -c "import sys,json; print(json.load(sys.stdin)['newTotal'])")
check "Consumed: pointsAwarded = 5" "$AWD" "5"
check "Consumed: newTotal = 5" "$NT" "5"
P=$(curl -s "$BASE/gamification/points" -H "$AUTH")
STREAK=$(echo "$P" | python -c "import sys,json; print(json.load(sys.stdin)['points']['currentStreak'])")
check "Streak after first consume = 1" "$STREAK" "1"

# TEST 3: Second consume same day -> +5 more, streak stays 1
echo ""
echo "--- TEST 3: Second consume same day -> +5 more, streak stays 1 ---"
ADD=$(curl -s -X POST "$BASE/myfridge/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Test Banana","category":"produce","quantity":1}')
PID=$(echo "$ADD" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
C2=$(curl -s -X POST "$BASE/myfridge/products/$PID/consume" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"action":"consumed"}')
NT2=$(echo "$C2" | python -c "import sys,json; print(json.load(sys.stdin)['newTotal'])")
check "Second consume: newTotal = 10" "$NT2" "10"
P=$(curl -s "$BASE/gamification/points" -H "$AUTH")
STREAK=$(echo "$P" | python -c "import sys,json; print(json.load(sys.stdin)['points']['currentStreak'])")
check "Streak same day still 1" "$STREAK" "1"

# TEST 4: Waste product -> -3 pts, streak = 0
echo ""
echo "--- TEST 4: Waste product -> -3 pts, streak = 0 ---"
ADD=$(curl -s -X POST "$BASE/myfridge/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Test Lettuce","category":"produce","quantity":1}')
PID=$(echo "$ADD" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
W=$(curl -s -X POST "$BASE/myfridge/products/$PID/consume" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"action":"wasted"}')
AWD=$(echo "$W" | python -c "import sys,json; print(json.load(sys.stdin)['pointsAwarded'])")
NT=$(echo "$W" | python -c "import sys,json; print(json.load(sys.stdin)['newTotal'])")
check "Wasted: pointsAwarded = -3" "$AWD" "-3"
check "Wasted: newTotal = 7" "$NT" "7"
P=$(curl -s "$BASE/gamification/points" -H "$AUTH")
STREAK=$(echo "$P" | python -c "import sys,json; print(json.load(sys.stdin)['points']['currentStreak'])")
check "Streak after waste = 0" "$STREAK" "0"

# TEST 5: Share product -> +10 pts, streak = 1 (recover)
echo ""
echo "--- TEST 5: Share product -> +10 pts, streak = 1 (recover from waste) ---"
ADD=$(curl -s -X POST "$BASE/myfridge/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Test Rice","category":"grains","quantity":1}')
PID=$(echo "$ADD" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
S=$(curl -s -X POST "$BASE/myfridge/products/$PID/consume" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"action":"shared"}')
AWD=$(echo "$S" | python -c "import sys,json; print(json.load(sys.stdin)['pointsAwarded'])")
NT=$(echo "$S" | python -c "import sys,json; print(json.load(sys.stdin)['newTotal'])")
check "Shared: pointsAwarded = 10" "$AWD" "10"
check "Shared: newTotal = 17" "$NT" "17"
P=$(curl -s "$BASE/gamification/points" -H "$AUTH")
STREAK=$(echo "$P" | python -c "import sys,json; print(json.load(sys.stdin)['points']['currentStreak'])")
check "Streak after share = 1" "$STREAK" "1"

# TEST 6: Sell product -> +8 pts
echo ""
echo "--- TEST 6: Sell product -> +8 pts ---"
ADD=$(curl -s -X POST "$BASE/myfridge/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Test Eggs","category":"dairy","quantity":1}')
PID=$(echo "$ADD" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
SL=$(curl -s -X POST "$BASE/myfridge/products/$PID/consume" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"action":"sold"}')
AWD=$(echo "$SL" | python -c "import sys,json; print(json.load(sys.stdin)['pointsAwarded'])")
NT=$(echo "$SL" | python -c "import sys,json; print(json.load(sys.stdin)['newTotal'])")
check "Sold: pointsAwarded = 8" "$AWD" "8"
check "Sold: newTotal = 25" "$NT" "25"

# TEST 7: Points floor at 0 (can't go negative)
echo ""
echo "--- TEST 7: Points floor at 0 ---"
DB_PATH="$(dirname "$0")/../../ecoplate.db"
sqlite3 "$DB_PATH" "UPDATE user_points SET total_points = 1 WHERE user_id = 1;"
ADD=$(curl -s -X POST "$BASE/myfridge/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Floor Test Item","category":"produce","quantity":1}')
PID=$(echo "$ADD" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
W2=$(curl -s -X POST "$BASE/myfridge/products/$PID/consume" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"action":"wasted"}')
NT=$(echo "$W2" | python -c "import sys,json; print(json.load(sys.stdin)['newTotal'])")
check "Floor: 1 + (-3) = 0 not -2" "$NT" "0"

# TEST 8: Metrics endpoint
echo ""
echo "--- TEST 8: Metrics endpoint ---"
M=$(curl -s "$BASE/gamification/metrics" -H "$AUTH")
echo "  Response: $M"
HC=$(echo "$M" | python -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'totalItemsConsumed' in d else 'no')")
HW=$(echo "$M" | python -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'totalItemsWasted' in d else 'no')")
HR=$(echo "$M" | python -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'wasteReductionRate' in d else 'no')")
HC2=$(echo "$M" | python -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'estimatedCo2Saved' in d else 'no')")
check "Metrics has totalItemsConsumed" "$HC" "yes"
check "Metrics has totalItemsWasted" "$HW" "yes"
check "Metrics has wasteReductionRate" "$HR" "yes"
check "Metrics has estimatedCo2Saved" "$HC2" "yes"

# TEST 9: Leaderboard endpoint
echo ""
echo "--- TEST 9: Leaderboard endpoint ---"
L=$(curl -s "$BASE/gamification/leaderboard" -H "$AUTH")
echo "  Response: $L"
HAS=$(echo "$L" | python -c "import sys,json; d=json.load(sys.stdin); print('yes' if isinstance(d, list) and len(d)>0 and 'rank' in d[0] else 'no')")
check "Leaderboard returns ranked users" "$HAS" "yes"

# TEST 10: Dashboard endpoint
echo ""
echo "--- TEST 10: Dashboard endpoint ---"
D=$(curl -s "$BASE/gamification/dashboard" -H "$AUTH")
echo "  Response: $D"
HAS=$(echo "$D" | python -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'gamification' in d and 'points' in d['gamification'] and 'streak' in d['gamification'] else 'no')")
check "Dashboard has gamification.points and streak" "$HAS" "yes"

# Summary
echo ""
echo "============================================================"
echo "  Results: $PASS passed, $FAIL failed out of $((PASS+FAIL))"
echo "============================================================"
if [ "$FAIL" -gt 0 ]; then
  echo "  Some tests FAILED."
  exit 1
else
  echo "  All tests PASSED!"
fi
