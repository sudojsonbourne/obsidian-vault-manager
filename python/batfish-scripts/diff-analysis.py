
# --- Script to validate a change that costs out a core router (core1) ---
# Assumes 'base_snapshot' (before change) and 'change_snapshot' (after change) are initialized
# The most powerful use case for Batfish is validating the impact of a change before it's deployed. 
# This often involves a differential analysis between a "before" snapshot and an "after" snapshot 

# 1. In the 'after' snapshot, search for any traffic that still transits the router we tried to cost out
answer = bf.q.reachability(
    pathConstraints=PathConstraints(
        startLocation="@enter(/border/[GigabitEthernet0/0])", # Traffic entering from outside
        transitLocations="core1"),                            # Must go through core1
    headers=HeaderConstraints(dstIps="/host/"),               # Destined for internal hosts
    actions="SUCCESS,FAILURE"                                  # Check both successful and failed flows
).answer(snapshot="change_snapshot")

# 2. If the answer is empty, no traffic uses core1. This verifies the primary intent of the change.
if answer.frame().empty:
    print("PASS: No traffic is routed through core1 after the change.")
else:
    print("FAIL: Traffic still uses core1 after the change.")
    # Optionally, use differential reachability to find any new failures caused by the change
    diff_answer = bf.q.differentialReachability(
        headers=HeaderConstraints(dstIps="/host/")
    ).answer().frame()
    print("Flows that changed status (e.g., succeeded before, fail after):")
    print(diff_answer)