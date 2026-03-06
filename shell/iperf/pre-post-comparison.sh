# Run test and compare to baseline
current_result=$(iperf3 -c <server_ip> -p 5201 -t 10 -J)
baseline_result=$(cat /tmp/iperf-client-baseline.json)

# Extract metrics (using jq)
current_bw=$(echo $current_result | jq '.end.sum_received.bits_per_second')
baseline_bw=$(echo $baseline_result | jq '.end.sum_received.bits_per_second')

# Calculate degradation
degradation=$(echo "scale=2; (1 - $current_bw/$baseline_bw) * 100" | bc)
echo "Performance change: $degradation% from baseline"

# Alert if degradation > threshold (e.g., 20%)
if (( $(echo "$degradation > 20" | bc -l) )); then
    echo "WARNING: Performance degradation detected during change!"
fi