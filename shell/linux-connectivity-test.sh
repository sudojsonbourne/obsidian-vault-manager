#!/bin/bash
# =============================================================================
# connectivity_test.sh
# Description: Tests network connectivity to multiple hosts over various ports
#              and protocols using only tools available on a standard Ubuntu
#              installation (bash, ping, curl, nc/netcat, openssl).
# Usage:       chmod +x connectivity_test.sh && ./connectivity_test.sh
# =============================================================================

# ---------- Colour helpers (fallback gracefully if tput is absent) ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------- Globals ---------------------------------------------------------
FAILED_TESTS=()
PASS_COUNT=0
FAIL_COUNT=0
TIMEOUT=5          # seconds to wait per test

# ---------- Helper: print a section banner ----------------------------------
banner() {
    echo ""
    echo -e "${CYAN}${BOLD}=================================================================${RESET}"
    echo -e "${CYAN}${BOLD}  $1${RESET}"
    echo -e "${CYAN}${BOLD}=================================================================${RESET}"
}

# ---------- Helper: record result -------------------------------------------
record_result() {
    local label="$1"
    local status="$2"   # PASS | FAIL
    local detail="$3"

    if [[ "$status" == "PASS" ]]; then
        echo -e "  ${GREEN}[PASS]${RESET} ${label} — ${detail}"
        (( PASS_COUNT++ ))
    else
        echo -e "  ${RED}[FAIL]${RESET} ${label} — ${detail}"
        FAILED_TESTS+=("$label :: $detail")
        (( FAIL_COUNT++ ))
    fi
}

# =============================================================================
# TEST FUNCTIONS
# =============================================================================

# --- 1. ICMP Ping -----------------------------------------------------------
test_icmp_ping() {
    local host="$1"
    local label="ICMP PING → ${host}"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    if ping -c 3 -W "$TIMEOUT" "$host" &>/dev/null; then
        local rtt
        rtt=$(ping -c 3 -W "$TIMEOUT" "$host" 2>/dev/null \
              | awk -F'/' '/rtt|round-trip/{print $5}')
        record_result "$label" "PASS" "avg RTT ${rtt}ms"
    else
        record_result "$label" "FAIL" "host unreachable or packet loss 100%"
    fi
}

# --- 2. TCP port check (via /dev/tcp) ----------------------------------------
test_tcp_port() {
    local host="$1"
    local port="$2"
    local service="$3"
    local label="TCP ${service} (port ${port}) → ${host}"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    # bash built-in /dev/tcp — no extra tools required
    if (echo >/dev/tcp/"$host"/"$port") 2>/dev/null &
       PID=$!
       sleep "$TIMEOUT" &
       SPID=$!
       wait -n 2>/dev/null   # bash ≥ 4.3
       STATUS=$?
       kill $PID $SPID 2>/dev/null
       wait $PID $SPID 2>/dev/null
       [[ $STATUS -eq 0 ]]; then
        record_result "$label" "PASS" "TCP connection established"
    else
        # fallback: try with plain wait loop
        (echo >/dev/tcp/"$host"/"$port") 2>/dev/null
        if [[ $? -eq 0 ]]; then
            record_result "$label" "PASS" "TCP connection established"
        else
            record_result "$label" "FAIL" "connection refused or timed out"
        fi
    fi
}

# Cleaner TCP test using bash timeout built-in approach
test_tcp() {
    local host="$1"
    local port="$2"
    local service="$3"
    local label="TCP ${service} (port ${port}) → ${host}"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    # Use bash /dev/tcp with a timeout subshell
    local result
    result=$(timeout "$TIMEOUT" bash -c "echo >/dev/tcp/${host}/${port}" 2>&1)
    local rc=$?

    if [[ $rc -eq 0 ]]; then
        record_result "$label" "PASS" "TCP connection established"
    elif [[ $rc -eq 124 ]]; then
        record_result "$label" "FAIL" "connection timed out after ${TIMEOUT}s"
    else
        record_result "$label" "FAIL" "connection refused (rc=${rc})"
    fi
}

# --- 3. UDP port check (via nc/netcat) ---------------------------------------
test_udp() {
    local host="$1"
    local port="$2"
    local service="$3"
    local label="UDP ${service} (port ${port}) → ${host}"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    # nc (netcat) ships with Ubuntu by default (netcat-openbsd)
    if command -v nc &>/dev/null; then
        # Send empty packet; nc -uz exits 0 if no ICMP Port Unreachable received
        nc -uz -w "$TIMEOUT" "$host" "$port" &>/dev/null
        local rc=$?
        if [[ $rc -eq 0 ]]; then
            record_result "$label" "PASS" "no ICMP unreachable (port likely open/filtered)"
        else
            record_result "$label" "FAIL" "ICMP unreachable received (port closed)"
        fi
    else
        record_result "$label" "FAIL" "nc (netcat) not found — cannot test UDP"
    fi
}

# --- 4. HTTP/HTTPS via curl --------------------------------------------------
test_http() {
    local url="$1"
    local label="HTTP GET → ${url}"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    if ! command -v curl &>/dev/null; then
        record_result "$label" "FAIL" "curl not found"
        return
    fi

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
                     --max-time "$TIMEOUT" \
                     --connect-timeout "$TIMEOUT" \
                     "$url" 2>/dev/null)
    local rc=$?

    if [[ $rc -eq 0 && "$http_code" =~ ^[2345][0-9]{2}$ ]]; then
        record_result "$label" "PASS" "HTTP response code ${http_code}"
    elif [[ $rc -eq 28 ]]; then
        record_result "$label" "FAIL" "connection timed out after ${TIMEOUT}s"
    elif [[ $rc -eq 7 ]]; then
        record_result "$label" "FAIL" "failed to connect (rc=7)"
    else
        record_result "$label" "FAIL" "curl error rc=${rc}, HTTP code=${http_code}"
    fi
}

# --- 5. HTTPS (TLS) certificate + connectivity check ------------------------
test_https_tls() {
    local host="$1"
    local port="${2:-443}"
    local label="HTTPS/TLS (port ${port}) → ${host}"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    if ! command -v curl &>/dev/null; then
        record_result "$label" "FAIL" "curl not found"
        return
    fi

    local http_code
    # -k to skip cert validation (we're testing connectivity, not cert validity)
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" \
                     --max-time "$TIMEOUT" \
                     --connect-timeout "$TIMEOUT" \
                     "https://${host}:${port}/" 2>/dev/null)
    local rc=$?

    if [[ $rc -eq 0 && "$http_code" =~ ^[2345][0-9]{2}$ ]]; then
        record_result "$label" "PASS" "TLS handshake successful, HTTP ${http_code}"
    elif [[ $rc -eq 28 ]]; then
        record_result "$label" "FAIL" "connection timed out after ${TIMEOUT}s"
    else
        record_result "$label" "FAIL" "curl error rc=${rc}"
    fi
}

# --- 6. DNS query (via host/dig/nslookup) ------------------------------------
test_dns() {
    local server="$1"
    local query="${2:-google.com}"
    local label="DNS query to ${server} for '${query}'"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    if command -v dig &>/dev/null; then
        local result
        result=$(dig @"$server" "$query" +short +time="$TIMEOUT" +tries=1 2>/dev/null)
        if [[ -n "$result" ]]; then
            record_result "$label" "PASS" "resolved → $(echo "$result" | head -1)"
        else
            record_result "$label" "FAIL" "no response from DNS server ${server}"
        fi
    elif command -v nslookup &>/dev/null; then
        local result
        result=$(timeout "$TIMEOUT" nslookup "$query" "$server" 2>/dev/null \
                 | awk '/^Address:/{if(NR>2)print $2}' | head -1)
        if [[ -n "$result" ]]; then
            record_result "$label" "PASS" "resolved → ${result}"
        else
            record_result "$label" "FAIL" "no response from DNS server ${server}"
        fi
    elif command -v host &>/dev/null; then
        local result
        result=$(timeout "$TIMEOUT" host -W "$TIMEOUT" "$query" "$server" 2>/dev/null \
                 | grep "has address" | head -1)
        if [[ -n "$result" ]]; then
            record_result "$label" "PASS" "resolved → ${result}"
        else
            record_result "$label" "FAIL" "no response from DNS server ${server}"
        fi
    else
        record_result "$label" "FAIL" "no DNS query tool found (dig/nslookup/host)"
    fi
}

# --- 7. SSH banner check (TCP 22) --------------------------------------------
test_ssh_banner() {
    local host="$1"
    local label="SSH banner (port 22) → ${host}"
    echo -e "\n  ${YELLOW}►${RESET} Testing: ${label}"

    if command -v nc &>/dev/null; then
        local banner
        banner=$(echo "" | nc -w "$TIMEOUT" "$host" 22 2>/dev/null | head -1)
        if echo "$banner" | grep -qi "ssh"; then
            record_result "$label" "PASS" "banner: ${banner}"
        else
            record_result "$label" "FAIL" "no SSH banner received"
        fi
    else
        # Fallback: plain TCP check
        timeout "$TIMEOUT" bash -c "echo >/dev/tcp/${host}/22" 2>/dev/null
        if [[ $? -eq 0 ]]; then
            record_result "$label" "PASS" "TCP port 22 open (banner not retrieved)"
        else
            record_result "$label" "FAIL" "TCP port 22 unreachable"
        fi
    fi
}

# =============================================================================
# MAIN — Define your test targets below
# =============================================================================
# All IPs are in the 10.2.3.0/24 placeholder range.
# Replace with your actual hosts/services before running.

banner "CONNECTIVITY TEST SUITE — $(date '+%Y-%m-%d %H:%M:%S')"

echo ""
echo -e "  Timeout per test  : ${TIMEOUT}s"
echo -e "  Target network    : 10.2.3.0/24 (placeholder IPs)"
echo ""

# ── Section 1: ICMP Ping ────────────────────────────────────────────────────
banner "1 · ICMP PING TESTS"
test_icmp_ping "10.2.3.1"    # Default gateway / router
test_icmp_ping "10.2.3.10"   # Host 2
test_icmp_ping "10.2.3.20"   # Host 3
test_icmp_ping "10.2.3.254"  # Firewall / edge device

# ── Section 2: TCP Tests ────────────────────────────────────────────────────
banner "2 · TCP PORT TESTS"
test_tcp "10.2.3.10"  80   "HTTP"
test_tcp "10.2.3.10"  443  "HTTPS"
test_tcp "10.2.3.20"  22   "SSH"
test_tcp "10.2.3.30"  3306 "MySQL"
test_tcp "10.2.3.40"  5432 "PostgreSQL"
test_tcp "10.2.3.50"  8080 "HTTP-ALT"
test_tcp "10.2.3.60"  21   "FTP"
test_tcp "10.2.3.60"  25   "SMTP"

# ── Section 3: UDP Tests ────────────────────────────────────────────────────
banner "3 · UDP PORT TESTS"
test_udp "10.2.3.1"   53  "DNS"
test_udp "10.2.3.1"   67  "DHCP"
test_udp "10.2.3.70"  161 "SNMP"
test_udp "10.2.3.70"  514 "Syslog"
test_udp "10.2.3.80"  123 "NTP"

# ── Section 4: HTTP Application Tests ───────────────────────────────────────
banner "4 · HTTP / HTTPS APPLICATION TESTS"
test_http  "http://10.2.3.10/"
test_http  "http://10.2.3.10:8080/health"
test_https_tls "10.2.3.10" 443
test_https_tls "10.2.3.90" 8443

# ── Section 5: DNS Resolution Tests ─────────────────────────────────────────
banner "5 · DNS RESOLUTION TESTS"
test_dns "10.2.3.1"   "example.com"
test_dns "10.2.3.100" "internal.domain.local"

# ── Section 6: SSH Banner Tests ──────────────────────────────────────────────
banner "6 · SSH BANNER / PORT TESTS"
test_ssh_banner "10.2.3.20"
test_ssh_banner "10.2.3.30"

# =============================================================================
# SUMMARY
# =============================================================================
banner "TEST SUMMARY"
echo ""
echo -e "  ${GREEN}${BOLD}PASSED : ${PASS_COUNT}${RESET}"
echo -e "  ${RED}${BOLD}FAILED : ${FAIL_COUNT}${RESET}"
TOTAL=$(( PASS_COUNT + FAIL_COUNT ))
echo -e "  ${BOLD}TOTAL  : ${TOTAL}${RESET}"

if [[ ${#FAILED_TESTS[@]} -eq 0 ]]; then
    echo ""
    echo -e "  ${GREEN}${BOLD}✔  All tests passed!${RESET}"
else
    echo ""
    echo -e "  ${RED}${BOLD}✘  Failed Tests:${RESET}"
    for entry in "${FAILED_TESTS[@]}"; do
        echo -e "     ${RED}•${RESET} ${entry}"
    done
fi

echo ""
echo -e "${CYAN}${BOLD}=================================================================${RESET}"
echo ""
