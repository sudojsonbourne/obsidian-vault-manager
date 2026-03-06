# Test with many short connections (simulates web traffic)
iperf3 -c <server_ip> -p 5201 -n 100K -P 100 -i 1 -f m > /tmp/iperf-conn-rate.log

# What this tests:
# -n 100K: Send only 100KB per connection
# -P 100: Attempt 100 parallel connections
# Validates: Firewall's connection tracking table performance
# Good for: Changes involving NAT, stateful inspection rules