from genie.testbed import load

testbed = load('testbed.yml')
palo = testbed.devices['palo_alto_fw1']
palo.connect()

# Parse security policies
policies = palo.parse('show running security-policy')

# Check for dangerous any-any rules
for policy in policies.get('policy', []):
    src = policy.get('from', '')
    dst = policy.get('to', '')
    source_zone = policy.get('source', [''])[0]
    dest_zone = policy.get('destination', [''])[0]
    action = policy.get('action', '')
    
    if source_zone == 'any' and dest_zone == 'any' and action == 'allow':
        print(f"⚠️  WARNING: Open any-any rule found: {policy.get('rule-name')}")