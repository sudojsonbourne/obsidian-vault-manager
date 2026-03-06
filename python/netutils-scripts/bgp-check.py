import ipaddress
from netutils.ip import is_ip_within  # Hypothetical import

def validate_bgp_route(bgp_routes_output, expected_prefix, expected_next_hop):
    """
    A simple validator to check if a specific prefix with the correct
    next-hop exists in a 'show ip bgp' output.
    """
    # This is a simplified parsing example.
    for line in bgp_routes_output.splitlines():
        if expected_prefix in line and expected_next_hop in line:
            if ">" in line:  # '>' indicates the best path
                print(f"PASS: Found expected route {expected_prefix} via {expected_next_hop}")
                return True
    print(f"FAIL: Could not find expected route {expected_prefix} via {expected_next_hop}")
    return False

# --- Example usage ---
# post_change_bgp_output = netmiko_connection.send_command("show ip bgp")
# validate_bgp_route(post_change_bgp_output, "192.0.2.0/24", "10.0.0.1")