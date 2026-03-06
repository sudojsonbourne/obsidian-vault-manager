# When Palo Alto firewalls operate in Layer 2 or virtual wire mode, you can parse MAC tables:
from genie.testbed import load

# Load testbed and connect
testbed = load('testbed.yml')
palo = testbed.devices['palo_alto_fw1']
palo.connect()

# Parse MAC address table (Palo uses 'show mac all')
mac_table = palo.parse('show mac all')

# Structured output is returned as Python dictionary
for vlan, vlan_data in mac_table['mac_table']['vlans'].items():
    for mac, mac_info in vlan_data['mac_addresses'].items():
        print(f"MAC: {mac} on VLAN {vlan} via {mac_info['interfaces']}")

# This normalizes the Palo Alto output to the same structure you'd get from Cisco or Arista devices