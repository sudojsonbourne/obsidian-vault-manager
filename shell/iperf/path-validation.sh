# First, identify the path
echo "=== Path Validation ==="

# Run iperf with TTL tracing (requires root)
sudo iperf3 -c <server_ip> -p 5201 -t 10 --ttl 1 2>/dev/null
sudo iperf3 -c <server_ip> -p 5201 -t 10 --ttl 2 2>/dev/null
# Increment TTL until you reach destination

# Or use traceroute to verify path
traceroute -n <server_ip>

# Then validate performance on that path
iperf3 -c <server_ip> -p 5201 -t 30 -R -f m