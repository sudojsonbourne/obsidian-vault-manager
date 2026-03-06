from pyats import aetest
from genie.testbed import load

class FirewallValidation(aetest.Testcase):
    
    @aetest.setup
    def setup(self, testbed):
        self.testbed = load(testbed)
        self.fw = self.testbed.devices['palo_alto_fw1']
        self.fw.connect()
    
    @aetest.test
    def verify_security_policies(self):
        """Verify no overly permissive rules exist"""
        policies = self.fw.parse('show running security-policy')
        
        risky_rules = []
        for policy in policies.get('policy', []):
            if (policy.get('source', [''])[0] == 'any' and 
                policy.get('destination', [''])[0] == 'any' and
                policy.get('action') == 'allow'):
                risky_rules.append(policy.get('rule-name'))
        
        if risky_rules:
            self.failed(f"Found risky any-any rules: {risky_rules}")
        else:
            self.passed("All security policies are properly scoped")
    
    @aetest.test
    def verify_interface_status(self):
        """Verify critical interfaces are up"""
        interfaces = self.fw.parse('show interface all')
        
        down_interfaces = []
        for intf, data in interfaces.get('interface', {}).items():
            if data.get('oper-state') != 'up' and 'ethernet' in intf.lower():
                down_interfaces.append(intf)
        
        if down_interfaces:
            self.failed(f"Critical interfaces down: {down_interfaces}")
        else:
            self.passed("All critical interfaces operational")
    
    @aetest.cleanup
    def cleanup(self):
        self.fw.disconnect()