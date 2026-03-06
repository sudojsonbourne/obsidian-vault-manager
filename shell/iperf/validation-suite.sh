#!/bin/bash
# post_change_validation.sh

SERVER_IP="<firewall_IP_or_behind_IP>"
BASELINE_DIR="/tmp/pre_change_baselines"
RESULTS_DIR="/tmp/post_change_results"
mkdir -p $RESULTS_DIR

echo "=== Post-Change Network Validation ==="
date

# Test 1: Basic connectivity and throughput
echo "Test 1: Basic Throughput"
iperf3 -c $SERVER_IP -p 5201 -t 30 -P 4 -J > $RESULTS_DIR/throughput.json

# Test 2: Bidirectional traffic
echo "Test 2: Bidirectional Traffic"
iperf3 -c $SERVER_IP -p 5201 -t 30 --bidir -J > $RESULTS_DIR/bidir.json

# Test 3: UDP performance (if applicable)
echo "Test 3: UDP Performance"
iperf3 -c $SERVER_IP -p 5201 -u -b 100M -t 30 -J > $RESULTS_DIR/udp.json

# Test 4: Connection rate (short flows)
echo "Test 4: Connection Rate"
for i in {1..100}; do
    iperf3 -c $SERVER_IP -p 5201 -n 100K &
done
wait

# Test 5: Multi-port validation (if you changed multiple rules)
echo "Test 5: Multi-Port Validation"
for port in 80 443 8080 8443; do
    echo "  Testing port $port"
    iperf3 -c $SERVER_IP -p $port -t 5 > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "    ✓ Port $port accessible"
    else
        echo "    ✗ Port $port FAILED"
    fi
done

# Compare with baselines
echo ""
echo "=== Comparison with Pre-Change Baselines ==="

if [ -f "$BASELINE_DIR/throughput.json" ]; then
    pre_bw=$(jq '.end.sum_received.bits_per_second' $BASELINE_DIR/throughput.json)
    post_bw=$(jq '.end.sum_received.bits_per_second' $RESULTS_DIR/throughput.json)
    
    change=$(echo "scale=2; ($post_bw - $pre_bw)/$pre_bw * 100" | bc)
    echo "Throughput change: $change%"
    
    if (( $(echo "$change < -10" | bc -l) )); then
        echo "⚠️  WARNING: Significant throughput degradation detected!"
    elif (( $(echo "$change > 10" | bc -l) )); then
        echo "✓ Improvement detected (possible optimization)"
    else
        echo "✓ Throughput within acceptable range"
    fi
fi