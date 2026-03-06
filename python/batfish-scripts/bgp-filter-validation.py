# --- Script to ensure a BGP policy filters private IP addresses ---
# Assumes a Batfish session (bf) is already initialized

# 1. Define the space of private IP announcements we want to ensure are filtered
private_ips = ["10.0.0.0/8:8-32", "172.16.0.0/12:12-32", "192.168.0.0/16:16-32"]
inbound_routes = BgpRouteConstraints(prefix=private_ips)

# 2. Search for any announcement in that space that is PERMITTED by our policy
#    (Finding a result means we found a violation/bug)
result = bf.q.searchRoutePolicies(
    policies="from_customer",  # Name of the route-map/policy to test
    inputConstraints=inbound_routes,
    action="permit"
).answer().frame()

# 3. Check if any violations were found
if not result.empty:
    print("ERROR: BGP policy 'from_customer' permits private IPs!")
    print(result[['Node', 'Policy_Name', 'Input_Route']])
else:
    print("SUCCESS: BGP policy correctly filters all private IPs.")