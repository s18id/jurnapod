#!/bin/bash
# Run all integration tests and show quick pass/fail summary

echo "============================================="
echo "Running All Integration Tests"
echo "============================================="
echo ""

total_pass=0
total_fail=0
total_tests=0

for f in apps/api/tests/integration/*.test.mjs; do
    filename=$(basename "$f")
    result=$(npm run test:single "$f" 2>&1)
    
    tests=$(echo "$result" | grep "^# tests" | awk '{print $3}')
    pass=$(echo "$result" | grep "^# pass" | awk '{print $3}')
    fail=$(echo "$result" | grep "^# fail" | awk '{print $3}')
    
    # Handle if values are empty
    tests=${tests:-0}
    pass=${pass:-0}
    fail=${fail:-0}
    
    total_tests=$((total_tests + tests))
    total_pass=$((total_pass + pass))
    total_fail=$((total_fail + fail))
    
    if [ "$fail" -gt 0 ]; then
        status="❌ FAIL"
    else
        status="✅ PASS"
    fi
    
    printf "%-50s %s ( %d/%d )\n" "$filename" "$status" "$pass" "$tests"
done

echo ""
echo "============================================="
echo "Total: $total_pass passed, $total_fail failed out of $total_tests tests"
echo "============================================="
