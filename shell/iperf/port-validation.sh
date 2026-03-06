# Test specific TCP ports
iperf3 -c <server_ip> -p 8080 -t 10  # Custom port
iperf3 -c <server_ip> -p 443 -t 10   # HTTPS port
iperf3 -c <server_ip> -p 53 -t 10    # DNS port

# Test UDP (important for VoIP, VPN, DNS)
iperf3 -c <server_ip> -p 5001 -u -b 10M -t 10

# Parameters explained:
# -u: UDP mode (often treated differently by firewalls)
# -b 10M: Target bandwidth for UDP test
# Validates: Specific service ports after ACL/rule changes