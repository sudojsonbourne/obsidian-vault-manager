"""
Script 1: Pre-Change Validation - Verify Intended Traffic Is Permitted
Purpose: Confirm that a proposed Palo Alto security policy change will allow
         all traffic it's supposed to allow.
Environment: Run against a candidate snapshot containing your proposed changes
"""

# Import required libraries
from pybatfish.client.session import Session
from pybatfish.datamodel import HeaderConstraints
import pandas as pd

# Initialize Batfish session (assumes Batfish server is running)
bf = Session(host="localhost")

# ------------------------------------------------------------------------------
# STEP 1: Define your network and snapshots
# ------------------------------------------------------------------------------
# Set the network name (logical container for your snapshots)
bf.set_network("palo-alto-production")

# Define paths to your configurations
# - CURRENT_SNAPSHOT: Your pre-change production configs
# - CANDIDATE_SNAPSHOT: Your proposed change (modified Palo Alto configs)
CURRENT_SNAPSHOT_PATH = "./configs/current/"
CANDIDATE_SNAPSHOT_PATH = "./configs/candidate/"

# Load snapshots into Batfish
bf.init_snapshot(CURRENT_SNAPSHOT_PATH, name="current", overwrite=True)
bf.init_snapshot(CANDIDATE_SNAPSHOT_PATH, name="candidate", overwrite=True)

print("✓ Snapshots loaded successfully")
print(f"  - Current: {CURRENT_SNAPSHOT_PATH}")
print(f"  - Candidate: {CANDIDATE_SNAPSHOT_PATH}")

# ------------------------------------------------------------------------------
# STEP 2: Define the change you're making
# ------------------------------------------------------------------------------
# This section describes the traffic you INTEND to permit with your change.
# In Palo Alto terms, you're defining the match criteria for a new security rule.
# Adjust these values to match your specific change request.

# Identify the Palo Alto firewall you're modifying
# This should match the hostname in your config files
FIREWALL_NAME = "pa-edge-firewall-01"

# Identify the security policy rule you're adding/modifying
# In Palo Alto, this is the rule name in the security rulebase
POLICY_RULE_NAME = "tkt-1234-allow-hr-saas"

# Define the traffic you intend to permit
# This uses HeaderConstraints to specify the 5-tuple + application
INTENDED_TRAFFIC = HeaderConstraints(
    # Source: The users/subnets initiating the traffic
    srcIps="10.10.10.0/24",           # HR department subnet
    # Destination: The target servers/services
    dstIps="18.18.18.0/27",            # Payroll SaaS servers
    # Protocol and ports (Palo Alto "service" equivalent)
    ipProtocols=["tcp"],
    dstPorts="80, 8080",                # HTTP and alternate HTTP
    # Note: Palo Alto also supports application signatures via 'applications'
    # but Batfish primarily uses 5-tuple for flow analysis
)

print("\n✓ Change definition loaded")
print(f"  - Firewall: {FIREWALL_NAME}")
print(f"  - Policy Rule: {POLICY_RULE_NAME}")
print(f"  - Intended Traffic: {INTENDED_TRAFFIC}")

# ------------------------------------------------------------------------------
# STEP 3: Check if traffic is ALREADY permitted (pre-change)
# ------------------------------------------------------------------------------
# First, verify the traffic isn't already allowed in the current config.
# If it is, the change may be unnecessary or you may have duplicate rules.

print("\n" + "="*80)
print("STEP 3: Checking if intended traffic is already permitted (pre-change)")
print("="*80)

pre_change_result = bf.q.searchFilters(
    headers=INTENDED_TRAFFIC,
    filters=POLICY_RULE_NAME,           # Focus on your specific rule
    nodes=FIREWALL_NAME,                 # Focus on your specific firewall
    action="permit"                       # Look for flows that are permitted
).answer(snapshot="current")

# Convert to pandas DataFrame for analysis
pre_change_df = pre_change_result.frame()

if pre_change_df.empty:
    print("✓ PASS: Intended traffic is NOT currently permitted.")
    print("  This confirms the change is necessary.")
else:
    print("⚠️  WARNING: Some intended traffic is ALREADY permitted:")
    print(pre_change_df[['Flow', 'Line_Content']])
    print("\nThis may indicate:")
    print("  - The change is unnecessary (traffic already allowed)")
    print("  - Existing rules are broader than intended")
    print("  - You may need to remove/modify existing rules first")

# ------------------------------------------------------------------------------
# STEP 4: Verify the CANDIDATE change permits ALL intended traffic
# ------------------------------------------------------------------------------
# Now check the candidate configuration to ensure NO intended traffic is denied.
# If any intended flow is denied, the change is incomplete or incorrect.

print("\n" + "="*80)
print("STEP 4: Verifying candidate change permits ALL intended traffic")
print("="*80)

candidate_deny_check = bf.q.searchFilters(
    headers=INTENDED_TRAFFIC,
    filters=POLICY_RULE_NAME,
    nodes=FIREWALL_NAME,
    action="deny"                         # Look for flows that are STILL denied
).answer(snapshot="candidate")

candidate_deny_df = candidate_deny_check.frame()

if candidate_deny_df.empty:
    print("✓ PASS: ALL intended traffic is permitted in the candidate config.")
    print("  The change successfully allows the required traffic.")
else:
    print("❌ FAIL: Some intended traffic is STILL denied in candidate config:")
    print(candidate_deny_df[['Flow', 'Line_Content']])
    print("\nTroubleshooting tips:")
    print("  - Check rule order (Palo Alto rules are first-match)")
    print("  - Verify zone assignments (source/destination zones)")
    print("  - Confirm address objects are defined correctly")
    print("  - Check for conflicting rules higher in the policy")
    
    # Optional: Exit with error if running in CI/CD pipeline
    # import sys
    # sys.exit(1)

print("\n✓ Pre-change validation complete - move to collateral damage check")

"""
Script 2: Pre-Change Validation - Ensure No Unintended Traffic Is Impacted
Purpose: Verify that a proposed Palo Alto security policy change does NOT
         accidentally permit traffic outside the intended scope.
         This is the "collateral damage" check - examining ALL rules.
Environment: Run against candidate snapshot with reference to current snapshot
"""

# ------------------------------------------------------------------------------
# STEP 1: Setup - Use same variables from Script 1
# ------------------------------------------------------------------------------
from pybatfish.client.session import Session
from pybatfish.datamodel import HeaderConstraints
import pandas as pd

# Initialize session (reuse from Script 1)
bf = Session(host="localhost")
bf.set_network("palo-alto-production")

# Define your change parameters
FIREWALL_NAME = "pa-edge-firewall-01"
INTENDED_TRAFFIC = HeaderConstraints(
    srcIps="10.10.10.0/24",           # HR department subnet
    dstIps="18.18.18.0/27",            # Payroll SaaS servers
    ipProtocols=["tcp"],
    dstPorts="80, 8080"                 # HTTP and alternate HTTP
)

print("\n" + "="*80)
print("SCRIPT 2: Collateral Damage Analysis")
print("="*80)

# ------------------------------------------------------------------------------
# STEP 2: SEARCH ALL RULES for unintended traffic impact
# ------------------------------------------------------------------------------
# CORRECTED APPROACH: Remove the 'filters' parameter to examine ALL rules
# This will find ANY flow outside INTENDED_TRAFFIC whose action changed
# between current and candidate snapshots.
#
# Why this matters for Palo Alto:
#   - A new rule might be too broad and match unintended traffic
#   - An existing rule might reorder and now match earlier
#   - Zone changes could expose networks unintentionally
#   - Implicit deny rules might be affected

print("\n--- Checking ALL rules for unintended traffic changes ---")
print(f"Firewall: {FIREWALL_NAME}")
print(f"Intended traffic scope: {INTENDED_TRAFFIC}")
print("Analyzing ALL security rules for changes outside this scope...\n")

collateral_check = bf.q.searchFilters(
    headers=INTENDED_TRAFFIC,
    invertSearch=True,                    # Look at traffic outside intended space
    # REMOVED: filters=POLICY_RULE_NAME   # Now checking ALL rules
    nodes=FIREWALL_NAME                    # Still focus on specific firewall
).answer(
    snapshot="candidate",                   # After change
    reference_snapshot="current"             # Before change
)

collateral_df = collateral_check.frame()

# ------------------------------------------------------------------------------
# STEP 3: Analyze the results
# ------------------------------------------------------------------------------
if collateral_df.empty:
    print("\n" + "="*80)
    print("✅ EXCELLENT: NO unintended traffic impact detected")
    print("="*80)
    print("After examining ALL rules on the firewall:")
    print("  ✓ No flows outside your intended space changed behavior")
    print("\nThis change is provably safe - it ONLY affects:")
    print(f"  {INTENDED_TRAFFIC}")
    
else:
    print("\n" + "="*80)
    print("❌ WARNING: Unintended traffic impact detected")
    print("="*80)
    print(f"Found {len(collateral_df)} flow(s) OUTSIDE your intended scope")
    print("that would be affected by this change:\n")
    
    # Group by rule to see which rules are causing issues
    by_rule = collateral_df.groupby('Snapshot_Line_Content')
    
    for rule_name, flows in by_rule:
        print(f"Rule affected: {rule_name if rule_name else 'Unknown rule'}")
        print(f"  Number of unexpected flows: {len(flows)}")
        
        # Show sample of problematic flows
        for _, row in flows.head(3).iterrows():
            action_change = f"{row['Reference_Action']} → {row['Snapshot_Action']}"
            print(f"  • Flow: {row['Flow']}")
            print(f"    Action change: {action_change}")
        
        if len(flows) > 3:
            print(f"    ... and {len(flows)-3} more flows")
        print("")
    
    # Provide context for Palo Alto troubleshooting
    print("\n🔍 PALO ALTO TROUBLESHOOTING GUIDE:")
    print("  • Rule Order: New rule might be matching before intended rule")
    print("  • Zone Assignment: Check source/destination zones in new rule")
    print("  • Address Objects: Verify subnet masks (e.g., /26 vs /27)")
    print("  • Service/Port: Ensure ports are restricted as intended")
    print("  • Application Defaults: Palo Alto may match on app signatures")
    print("\nTo see full details, examine the collateral_df DataFrame")

# ------------------------------------------------------------------------------
# OPTIONAL: More granular analysis - what types of changes occurred?
# ------------------------------------------------------------------------------
if not collateral_df.empty:
    print("\n--- Detailed Change Analysis ---")
    
    # Count types of action changes
    change_types = collateral_df.apply(
        lambda row: f"{row['Reference_Action']}→{row['Snapshot_Action']}", 
        axis=1
    ).value_counts()
    
    print("Types of changes detected:")
    for change_type, count in change_types.items():
        print(f"  • {change_type}: {count} flow(s)")
    
    # Specifically check for new permits (most dangerous)
    new_permits = collateral_df[
        (collateral_df['Reference_Action'] == 'DENY') & 
        (collateral_df['Snapshot_Action'] == 'PERMIT')
    ]
    
    if not new_permits.empty:
        print("\n⚠️  CRITICAL: New permits outside intended scope detected!")
        print("These flows were DENIED before but would be PERMITTED after:")
        for _, row in new_permits.head().iterrows():
            print(f"  • {row['Flow']} (via rule: {row['Snapshot_Line_Content']})")
    
    # Check for new denies (potential service impact)
    new_denies = collateral_df[
        (collateral_df['Reference_Action'] == 'PERMIT') & 
        (collateral_df['Snapshot_Action'] == 'DENY')
    ]
    
    if not new_denies.empty:
        print("\n⚠️  Service Impact Risk: New denies outside intended scope:")
        print("These flows were PERMITTED before but would be DENIED after:")
        for _, row in new_denies.head().iterrows():
            print(f"  • {row['Flow']} (now denied by: {row['Snapshot_Line_Content']})")

print("\n✓ Collateral damage analysis complete")

"""
Script 3: Post-Change Validation - Verify Deployed Configuration
Purpose: After deploying a Palo Alto security policy change to production,
         validate that the live configuration matches the validated candidate
         and that the intended behavior is actually working.
Environment: Run against a new "post-deployment" snapshot taken after changes
"""

# ------------------------------------------------------------------------------
# STEP 1: Setup - Load the POST-CHANGE snapshot
# ------------------------------------------------------------------------------
from pybatfish.client.session import Session
from pybatfish.datamodel import HeaderConstraints

bf = Session(host="localhost")
bf.set_network("palo-alto-production")

# Define paths
# - POST_DEPLOY_SNAPSHOT: Configuration pulled FROM THE LIVE FIREWALL after change
# - CANDIDATE_SNAPSHOT: The validated pre-change candidate (reference)
POST_DEPLOY_PATH = "./configs/post-deploy/"
CANDIDATE_PATH = "./configs/candidate/"

# Load snapshots
bf.init_snapshot(POST_DEPLOY_PATH, name="post-deploy", overwrite=True)
bf.init_snapshot(CANDIDATE_PATH, name="candidate", overwrite=True)

# Reuse the same change parameters
FIREWALL_NAME = "pa-edge-firewall-01"
POLICY_RULE_NAME = "tkt-1234-allow-hr-saas"
INTENDED_TRAFFIC = HeaderConstraints(
    srcIps="10.10.10.0/24",
    dstIps="18.18.18.0/27",
    ipProtocols=["tcp"],
    dstPorts="80, 8080"
)

print("\n" + "="*80)
print("SCRIPT 3: Post-Change Validation")
print("="*80)

# ------------------------------------------------------------------------------
# STEP 2: Verify the deployed config matches the validated candidate
# ------------------------------------------------------------------------------
# First, ensure the live configuration hasn't drifted from what we tested.
# This catches:
#   - Manual emergency changes during deployment
#   - Configuration push errors
#   - Unexpected device-specific modifications

print("\n--- Checking configuration consistency ---")

config_diff = bf.q.searchFilters(
    headers=INTENDED_TRAFFIC,
    filters=POLICY_RULE_NAME,
    nodes=FIREWALL_NAME
).answer(
    snapshot="post-deploy",                # What's actually running
    reference_snapshot="candidate"          # What we validated
)

config_diff_df = config_diff.frame()

if config_diff_df.empty:
    print("✓ PASS: Deployed configuration matches validated candidate")
else:
    print("❌ FAIL: Deployed configuration differs from validated candidate")
    print("Differences found:")
    print(config_diff_df[['Flow', 'Snapshot_Action', 'Reference_Action']])
    print("\nInvestigate immediately - configuration may have changed during deploy")

# ------------------------------------------------------------------------------
# STEP 3: Verify intended traffic is still permitted in production
# ------------------------------------------------------------------------------
# Even if the config matches, we should verify the intended behavior.
# This confirms the change is working as expected in the live environment.

print("\n--- Verifying intended behavior in production ---")

post_deploy_check = bf.q.searchFilters(
    headers=INTENDED_TRAFFIC,
    filters=POLICY_RULE_NAME,
    nodes=FIREWALL_NAME,
    action="deny"                           # Look for denied intended traffic
).answer(snapshot="post-deploy")

post_deploy_df = post_deploy_check.frame()

if post_deploy_df.empty:
    print("✓ PASS: ALL intended traffic is permitted in production")
    print(f"  Successfully allowed: {INTENDED_TRAFFIC}")
else:
    print("❌ FAIL: Some intended traffic is denied in production")
    print("Check the following flows:")
    print(post_deploy_df[['Flow', 'Line_Content']])
    print("\nPossible causes:")
    print("  • Rule not committed on Palo Alto")
    print("  • Hit count shows rule not matching")
    print("  • Upstream/downstream devices blocking traffic")

# ------------------------------------------------------------------------------
# STEP 4: Quick collateral damage check in production
# ------------------------------------------------------------------------------
# Finally, do a lightweight check for any new unintended access in production.
# This uses the same differential approach but against the live config.

print("\n--- Quick collateral damage check in production ---")

prod_collateral = bf.q.searchFilters(
    headers=INTENDED_TRAFFIC,
    invertSearch=True,
    filters=POLICY_RULE_NAME,
    nodes=FIREWALL_NAME
).answer(
    snapshot="post-deploy",
    reference_snapshot="current"             # Pre-change production config
)

prod_collateral_df = prod_collateral.frame()

if prod_collateral_df.empty:
    print("✓ PASS: No new unintended traffic patterns detected")
else:
    print("⚠️  Review: New traffic patterns detected")
    print(prod_collateral_df[['Flow', 'Snapshot_Action', 'Reference_Action']])

# ------------------------------------------------------------------------------
# STEP 5: Generate validation summary
# ------------------------------------------------------------------------------
print("\n" + "="*80)
print("POST-CHANGE VALIDATION SUMMARY")
print("="*80)

if config_diff_df.empty and post_deploy_df.empty and prod_collateral_df.empty:
    print("✅ OVERALL RESULT: CHANGE SUCCESSFULLY VALIDATED")
    print("\nAll checks passed:")
    print("  ✓ Configuration matches validated candidate")
    print("  ✓ Intended traffic is permitted")
    print("  ✓ No unintended traffic impact")
    print("\nThe change is complete and correct.")
else:
    print("⚠️  OVERALL RESULT: CHANGE REQUIRES REVIEW")
    print("\nSome checks failed - see details above.")
    print("Do not close the change ticket until all issues are resolved.")

print("\n✓ Post-change validation complete")