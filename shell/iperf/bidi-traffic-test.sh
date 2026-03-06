# Test traffic flow in both directions
iperf3 -c <server_ip> -p 5201 -t 30 --bidir -f m > /tmp/iperf-bidir-baseline.log

# Firewalls often handle traffic differently in each direction, making bidirectional testing crucial. 
# This test simulates real-world scenarios where users upload and download data simultaneously, 
# such as video conferencing or cloud storage synchronization. 
# This is especially important for firewalls that must track bidirectional connections.
# By validating the firewall's ability to manage symmetric traffic patterns, we can ensure that it 
# effectively tracks connections and maintains performance under typical usage conditions. 

# What this tests:
# --bidir: Tests upload AND download simultaneously
# Validates: Firewall's ability to handle symmetric traffic patterns
# Critical for: Stateful firewalls that track connections
