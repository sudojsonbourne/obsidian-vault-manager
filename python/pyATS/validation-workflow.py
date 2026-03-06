#
#
# Step 1: Take Pre-Change Snapshot
#
#

from genie.testbed import load
import datetime
import os

testbed = load('testbed.yml')

# Create timestamped snapshot directory
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
snapshot_dir = f"snapshots/pre_change_{timestamp}"
os.makedirs(snapshot_dir, exist_ok=True)

# Commands to capture for Palo Alto
palo_commands = [
    'show system info',
    'show running security-policy',
    'show running nat-policy',
    'show interface all',
    'show routing route'
]

# Connect and capture
palo = testbed.devices['palo_alto_fw1']
palo.connect()

for cmd in palo_commands:
    output = palo.execute(cmd)
    filename = cmd.replace(' ', '_') + '.txt'
    with open(f"{snapshot_dir}/palo_alto_fw1/{filename}", 'w') as f:
        f.write(output)

#
#
# Step 2L Take Post-Change Snapshot and Compare
#
#

# After change, take post snapshot similarly...
# Then use pyATS diff to compare

from genie.utils.diff import Diff

# Parse both snapshots (using Genie parsers for structured comparison)
pre_parse = palo.parse('show running security-policy', output=pre_change_output)
post_parse = palo.parse('show running security-policy', output=post_change_output)

# Generate diff
diff = Diff(pre_parse, post_parse, exclude=['counters', 'timestamp'])
diff.findDiff()

if diff.diffs:
    print("⚠️  Changes detected:")
    print(diff.diffs)
else:
    print("✓ No changes detected - validation passed")

#
#
# Handling Unsupported Commands with Custom Parsers
#
#

from genie.metaparser import MetaParser
import re

class PaloAltoSessionStatsParser(MetaParser):
    """Custom parser for 'show session stats' on Palo Alto"""
    
    cli_command = 'show session stats'
    
    schema = {
        'active_sessions': int,
        'tcp_sessions': int,
        'udp_sessions': int,
        'icmp_sessions': int,
        'max_sessions': int
    }
    
    def cli(self, output=None):
        if output is None:
            output = self.device.execute(self.cli_command)
        
        ret = {}
        for line in output.splitlines():
            # Parse lines like: "Active sessions: 1245"
            m = re.match(r'Active sessions:\s*(\d+)', line)
            if m:
                ret['active_sessions'] = int(m.group(1))
            
            m = re.match(r'TCP sessions:\s*(\d+)', line)
            if m:
                ret['tcp_sessions'] = int(m.group(1))
            
            # Add more patterns as needed...
        
        return ret

# Usage
parser = PaloAltoSessionStatsParser(device=palo)
stats = parser.cli()
print(f"Active sessions: {stats['active_sessions']}")