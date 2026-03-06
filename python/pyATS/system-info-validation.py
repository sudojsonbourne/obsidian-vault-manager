# Parse system info (Genie normalizes this across vendors)
system_info = palo.parse('show system info')

# Access structured data
hostname = system_info.get('hostname', 'unknown')
model = system_info.get('model', 'unknown')
sw_version = system_info.get('sw-version', 'unknown')

print(f"Firewall: {hostname} ({model}) running PAN-OS {sw_version}")