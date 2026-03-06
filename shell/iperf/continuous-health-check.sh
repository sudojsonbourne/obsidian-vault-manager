# Continuous ping-like test but with throughput validation
while true; do
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    result=$(iperf3 -c <server_ip> -p 5201 -t 5 -J 2>/dev/null)
    
    # Extract and log key metrics
    bits_per_second=$(echo $result | jq '.end.sum_received.bits_per_second')
    retransmits=$(echo $result | jq '.end.sum_sent.retransmits')
    
    echo "$timestamp | Throughput: $bits_per_second bps | Retransmits: $retransmits"
    sleep 2  # Wait before next test
done > /tmp/iperf-during-change.log

# This requires jq for JSON parsing: sudo apt-get install jq
# What this provides:
# - Real-time throughput monitoring
# - Immediate detection of connectivity drops
# - Retransmission rate monitoring (indicates packet loss)