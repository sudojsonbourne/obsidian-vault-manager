# --- Script to validate NTP server configurations ---
# Assumes a Batfish session (bf) is already initialized

# 1. Extract NTP Servers for all routers (e.g., those with 'border' in their name)
node_props = bf.q.nodeProperties(
    nodes="/border/", 
    properties="NTP_Servers"
).answer().frame()

# 2. Define your reference set of allowed/correct NTP servers
reference_ntp_servers = set(["23.23.23.23"])

# 3. Find nodes that have no NTP server in common with the reference set (violators)
ns_violators = node_props[node_props["NTP_Servers"].apply(
    lambda x: len(reference_ntp_servers.intersection(set(x))) == 0
)]

# 4. Print or log the violators
print("Nodes with non-compliant NTP servers:")
print(ns_violators)