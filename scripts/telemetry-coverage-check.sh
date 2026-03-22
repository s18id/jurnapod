#!/bin/bash
# Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
# Ownership: Ahmad Faruk (Signal18 ID)

# Telemetry Coverage Quality Gate Script
# Epic 11: Operational Trust and Scale Readiness
# 
# This script checks that all critical flows have required telemetry instrumentation.
# It blocks releases if any critical path is missing telemetry.
#
# Usage:
#   ./scripts/telemetry-coverage-check.sh [--fix] [--verbose]
#
# Options:
#   --fix      Create GitHub issue for missing telemetry
#   --verbose  Show detailed output
#
# Exit codes:
#   0 - All telemetry requirements met
#   1 - Missing telemetry detected (release blocked)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ISSUE_TITLE_PREFIX="[TELEMETRY-GAP]"
REPO_TOKEN="${GITHUB_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Flags
FIX_MODE=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --fix)
            FIX_MODE=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Telemetry requirements per flow
# These match the quality_gate specification in the story
declare -A TELEMETRY_REQUIREMENTS=(
    ["payment_capture"]="request_id_header,latency_histogram,error_counter_with_class,company_id_label"
    ["offline_local_commit"]="client_tx_id_present,commit_latency_histogram,success_counter,company_id_label"
    ["sync_replay_idempotency"]="client_tx_id_dedup_check,sync_latency_histogram,duplicate_counter"
    ["pos_to_gl_posting"]="journal_batch_id,posting_latency_histogram,accuracy_counter"
    ["trial_balance"]="report_latency_histogram,company_id_label"
    ["general_ledger"]="report_latency_histogram,company_id_label"
)

# Critical flows
CRITICAL_FLOWS=(
    "payment_capture"
    "offline_local_commit"
    "sync_replay_idempotency"
    "pos_to_gl_posting"
    "trial_balance"
    "general_ledger"
)

# Counter for missing telemetry
MISSING_COUNT=0
MISSING_TELEMETRY=()

log_info() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${NC}$1"
    fi
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if telemetry instrumentation exists in source code
check_telemetry_instrumentation() {
    local flow_name="$1"
    local required="$2"
    local missing=()

    # Split required items by comma
    IFS=',' read -ra REQUIRED_ITEMS <<< "$required"

    for item in "${REQUIRED_ITEMS[@]}"; do
        local found=false

        case "$item" in
            request_id_header)
                # Check for request_id generation in middleware or correlation-id.ts
                if grep -rq "request_id\|requestId\|x-request-id" "$PROJECT_ROOT/apps/api/src/middleware" 2>/dev/null || \
                   grep -rq "request_id\|requestId" "$PROJECT_ROOT/apps/api/src/lib/correlation-id.ts" 2>/dev/null; then
                    found=true
                fi
                ;;
            client_tx_id_present|client_tx_id_dedup_check)
                # Check for client_tx_id handling
                if grep -rq "client_tx_id\|clientTxId\|x-client-tx-id" "$PROJECT_ROOT/apps/api/src" 2>/dev/null; then
                    found=true
                fi
                ;;
            journal_batch_id)
                # Check for journal_batch_id handling
                if grep -rq "journal_batch_id\|journalBatchId" "$PROJECT_ROOT/apps/api/src" 2>/dev/null; then
                    found=true
                fi
                ;;
            latency_histogram|commit_latency_histogram|sync_latency_histogram|posting_latency_histogram|report_latency_histogram)
                # Check for histogram metric patterns
                if grep -rq "histogram_quantile\|_bucket\[|latency_seconds" "$PROJECT_ROOT/packages/telemetry" 2>/dev/null || \
                   grep -rq "latency.*bucket\|histogram" "$PROJECT_ROOT/_bmad-output/implementation-artifacts/alerts" 2>/dev/null; then
                    found=true
                fi
                ;;
            error_counter_with_class|error_counter|errors_total)
                # Check for error counter patterns
                if grep -rq "errors_total\|error_counter\|error_class" "$PROJECT_ROOT/packages/telemetry" 2>/dev/null || \
                   grep -rq "_errors_total" "$PROJECT_ROOT/_bmad-output/implementation-artifacts" 2>/dev/null; then
                    found=true
                fi
                ;;
            success_counter)
                # Check for success counter patterns
                if grep -rq "success_total\|success_counter\|_total" "$PROJECT_ROOT/_bmad-output/implementation-artifacts" 2>/dev/null; then
                    found=true
                fi
                ;;
            duplicate_counter)
                # Check for duplicate counter patterns
                if grep -rq "duplicates_total\|duplicate_counter" "$PROJECT_ROOT/_bmad-output/implementation-artifacts" 2>/dev/null; then
                    found=true
                fi
                ;;
            accuracy_counter)
                # Check for accuracy counter patterns
                if grep -rq "accuracy\|drift" "$PROJECT_ROOT/packages/telemetry" 2>/dev/null; then
                    found=true
                fi
                ;;
            company_id_label)
                # Check for company_id label in telemetry package
                if grep -rq "company_id\|companyId" "$PROJECT_ROOT/packages/telemetry" 2>/dev/null; then
                    found=true
                fi
                ;;
            *)
                log_warning "Unknown telemetry requirement: $item"
                ;;
        esac

        if [ "$found" = false ]; then
            missing+=("$item")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        return 1
    fi
    return 0
}

# Create GitHub issue for missing telemetry
create_github_issue() {
    local flow_name="$1"
    local missing_items="$2"

    if [ -z "$REPO_TOKEN" ]; then
        log_warning "GITHUB_TOKEN not set, skipping issue creation"
        return 0
    fi

    local title="$ISSUE_TITLE_PREFIX Missing telemetry for $flow_name"
    
    # Escape special characters for JSON
    local escaped_items=$(echo "$missing_items" | sed 's/"/\\"/g' | tr ',' '\n')
    local checklist_items=""
    while IFS= read -r item; do
        checklist_items="$checklist_items
        \"- [ ] $item\""
    done <<< "$escaped_items"
    
    # Get repo name from git remote
    local repo_url=$(git remote get-url origin 2>/dev/null || echo "")
    local repo_name=$(echo "$repo_url" | sed 's/.*github.com[:/]\(.*\)\.git/\1/' | sed 's/\.git$//')
    
    if [ -z "$repo_name" ]; then
        log_warning "Could not determine repo name, skipping issue creation"
        return 0
    fi

    # Build required items checklist for JSON
    local required_checklist=""
    IFS=',' read -ra ITEMS <<< "$missing_items"
    for item in "${ITEMS[@]}"; do
        if [ -n "$required_checklist" ]; then
            required_checklist="$required_checklist,"
        fi
        required_checklist="$required_checklist\"- [ ] $(echo "$item" | sed 's/"/\\"/g')\""
    done

    # Create JSON payload
    local json_payload=$(cat <<JSONEOF
{
  "title": "$(echo "$title" | sed 's/"/\\"/g')",
  "body": "## Telemetry Coverage Gap Detected\n\n**Flow:** \`$flow_name\`\n**Missing Telemetry:** \`$missing_items\`\n**Date:** $(date -u +%Y-%m-%d)\n\n### Required Items\n$required_checklist\n\n### Action Required\nThis is a release-blocking defect. All critical flows must have 100% telemetry coverage before release.\n\n---\n*Auto-generated by telemetry-coverage-check.sh*",
  "labels": ["telemetry", "release-blocker"]
}
JSONEOF
)

    local response
    response=$(curl -s -X POST \
        -H "Authorization: token $REPO_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        -H "Content-Type: application/json" \
        "https://api.github.com/repos/${repo_name}/issues" \
        -d "$json_payload")

    if echo "$response" | grep -q '"number"'; then
        local issue_number=$(echo "$response" | grep -o '"number": [0-9]*' | head -1 | cut -d':' -f2 | tr -d ' ')
        log_info "Created GitHub issue #${issue_number}"
    else
        log_warning "Failed to create GitHub issue: $response"
    fi
}

echo "=============================================="
echo "Jurnapod Telemetry Coverage Quality Gate"
echo "=============================================="
echo ""

# Check telemetry package exists
if [ ! -d "$PROJECT_ROOT/packages/telemetry" ]; then
    log_error "Telemetry package not found at packages/telemetry"
    log_error "This is required for SLO instrumentation"
    exit 1
fi
log_success "Telemetry package found"

# Check SLO configuration exists
if [ ! -f "$PROJECT_ROOT/_bmad-output/implementation-artifacts/slo/slo-config.yaml" ]; then
    log_error "SLO configuration not found"
    exit 1
fi
log_success "SLO configuration found"

# Check alert rules exist
if [ ! -f "$PROJECT_ROOT/_bmad-output/implementation-artifacts/alerts/prometheus-alerts.yaml" ]; then
    log_error "Alert rules not found"
    exit 1
fi
log_success "Alert rules found"

# Check dashboard configurations exist
if [ ! -d "$PROJECT_ROOT/_bmad-output/implementation-artifacts/dashboards" ]; then
    log_error "Dashboard configurations not found"
    exit 1
fi
log_success "Dashboard configurations found"

# Check telemetry middleware exists
if [ ! -f "$PROJECT_ROOT/apps/api/src/middleware/telemetry.ts" ]; then
    log_error "Telemetry middleware not found at apps/api/src/middleware/telemetry.ts"
    MISSING_COUNT=$((MISSING_COUNT + 1))
    MISSING_TELEMETRY+=("API middleware: telemetry.ts")
else
    log_success "Telemetry middleware found"
fi

echo ""
echo "----------------------------------------------"
echo "Checking Critical Flow Telemetry Coverage"
echo "----------------------------------------------"
echo ""

# Check each critical flow
ALL_PASSED=true
for flow in "${CRITICAL_FLOWS[@]}"; do
    required="${TELEMETRY_REQUIREMENTS[$flow]}"
    log_info "Checking $flow (requires: $required)..."

    if check_telemetry_instrumentation "$flow" "$required"; then
        log_success "  $flow: All telemetry present"
    else
        log_error "  $flow: Missing telemetry"
        ALL_PASSED=false
        MISSING_COUNT=$((MISSING_COUNT + 1))
        MISSING_TELEMETRY+=("$flow: missing requirements")
        
        if [ "$FIX_MODE" = true ]; then
            create_github_issue "$flow" "$required"
        fi
    fi
done

echo ""
echo "----------------------------------------------"
echo "Summary"
echo "----------------------------------------------"

if [ "$ALL_PASSED" = true ]; then
    log_success "All telemetry coverage checks passed!"
    echo ""
    echo "Coverage: 100% (${#CRITICAL_FLOWS[@]}/${#CRITICAL_FLOWS[@]} flows)"
    echo ""
    echo "Quality Gate: PASSED"
    exit 0
else
    log_error "Telemetry coverage check failed!"
    echo ""
    log_error "Coverage: $((100 - MISSING_COUNT * 100 / ${#CRITICAL_FLOWS[@]}))% ($(( ${#CRITICAL_FLOWS[@]} - MISSING_COUNT ))/${#CRITICAL_FLOWS[@]} flows)"
    echo ""
    echo "Missing Telemetry:"
    for item in "${MISSING_TELEMETRY[@]}"; do
        echo "  - $item"
    done
    echo ""
    log_error "Quality Gate: BLOCKED"
    echo ""
    echo "Please add the missing telemetry instrumentation before releasing."
    if [ "$FIX_MODE" = false ]; then
        echo ""
        echo "To auto-create GitHub issues for missing telemetry, run with --fix"
    fi
    exit 1
fi
