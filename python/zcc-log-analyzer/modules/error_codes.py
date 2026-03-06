"""
ZCC Error Code Database
=======================
Comprehensive mapping of Zscaler Client Connector error codes, messages,
descriptions, and severities sourced from official Zscaler documentation:

  - https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-errors
  - https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-connection-status-errors
  - https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-zpa-authentication-errors
  - https://help.zscaler.com/zscaler-client-connector/troubleshooting
"""

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Severity levels
# ---------------------------------------------------------------------------
class Severity:
    CRITICAL = "CRITICAL"
    ERROR    = "ERROR"
    WARNING  = "WARNING"
    INFO     = "INFO"
    DEBUG    = "DEBUG"


# ---------------------------------------------------------------------------
# Error record
# ---------------------------------------------------------------------------
@dataclass
class ErrorCode:
    code: str                        # e.g. "-1", "AUTH_001", "CONN_DISCONNECTED"
    category: str                    # e.g. "Cloud Authentication", "ZPA Auth"
    message: str                     # Short error message shown in UI / logs
    description: str                 # Longer description of what causes it
    resolution: str                  # Recommended resolution steps
    severity: str = Severity.ERROR   # Default severity
    aliases: list = field(default_factory=list)  # Alternative strings that map to this code


# ---------------------------------------------------------------------------
# Cloud Authentication Error Codes  (numeric, typically negative integers)
# Source: ZCC Errors page — "Cloud Authentication Error Codes" table
# ---------------------------------------------------------------------------
CLOUD_AUTH_ERRORS: dict[str, ErrorCode] = {
    "-1": ErrorCode(
        code="-1",
        category="Cloud Authentication",
        message="Failed to Initialize Authentication: PAC Download Failed",
        description=(
            "The device failed to download the PAC file, which stops Zscaler Client "
            "Connector from authenticating the user. The device could not connect to "
            "the cloud when downloading the PAC file."
        ),
        resolution="Check network connectivity. Verify the device can reach the cloud.",
        severity=Severity.ERROR,
        aliases=["PAC Download Failed", "PAC download failed", "pac download"],
    ),
    "-2": ErrorCode(
        code="-2",
        category="Cloud Authentication",
        message="Failed to Initialize Authentication: Invalid Custom PAC File",
        description=(
            "The device downloaded an invalid PAC file. For example, the format of "
            "the PAC file is incorrect."
        ),
        resolution=(
            "Check the syntax of the arguments within the PAC file. "
            "Review Best Practices for Writing PAC Files."
        ),
        severity=Severity.ERROR,
        aliases=["Invalid Custom PAC File", "invalid pac", "Invalid PAC"],
    ),
    "-3": ErrorCode(
        code="-3",
        category="Cloud Authentication",
        message="Failed to Initialize Authentication: VPN Detected",
        description=(
            "Zscaler Client Connector detects an active VPN on the device. "
            "The forwarding profile may be configured to block ZCC when a VPN is active."
        ),
        resolution="Check the forwarding profile configuration for VPN exclusions.",
        severity=Severity.WARNING,
        aliases=["VPN Detected", "vpn detected", "VPN detected"],
    ),
    "-4": ErrorCode(
        code="-4",
        category="Cloud Authentication",
        message="Failed to Initialize Authentication: Authentication Disabled",
        description=(
            "The organization has not configured an authentication source, so "
            "authentication is disabled."
        ),
        resolution="Check the Authentication Profile configuration.",
        severity=Severity.ERROR,
        aliases=["Authentication Disabled", "auth disabled"],
    ),
    "-5": ErrorCode(
        code="-5",
        category="Cloud Authentication",
        message="Failed to Identify Authentication Service",
        description=(
            "Zscaler Client Connector cannot determine the configured authentication "
            "type, e.g., differentiating between a Hosted Database user or an "
            "Active Directory user."
        ),
        resolution="Check the Authentication Profile configuration.",
        severity=Severity.ERROR,
        aliases=["Failed to Identify Authentication Service"],
    ),
    "-6": ErrorCode(
        code="-6",
        category="Cloud Authentication",
        message="Failed to Authenticate: Login Failed",
        description="The user entered incorrect credentials.",
        resolution="Verify the user's credentials are correct.",
        severity=Severity.ERROR,
        aliases=["Login Failed", "login failed", "Authentication failed", "auth failed"],
    ),
    "-7": ErrorCode(
        code="-7",
        category="Cloud Authentication",
        message="Network Connection not Available",
        description=(
            "Zscaler Client Connector cannot find an active network on the device."
        ),
        resolution=(
            "Search for an active network. If the device is connected to a network, "
            "try connecting to another network. Go to config.zscaler.com/<cloud_name> "
            "to verify the cloud is reachable."
        ),
        severity=Severity.ERROR,
        aliases=["Network Connection not Available", "no network", "network unavailable"],
    ),
    "-8": ErrorCode(
        code="-8",
        category="Cloud Authentication",
        message="Failed to Authenticate: Enrollment Certificate Not Found",
        description=(
            "The enrollment certificate required for machine-level authentication "
            "could not be found on the device."
        ),
        resolution=(
            "Ensure the enrollment certificate is installed. Re-enroll the device "
            "if necessary."
        ),
        severity=Severity.ERROR,
        aliases=["Enrollment Certificate Not Found", "enrollment cert not found"],
    ),
    "-9": ErrorCode(
        code="-9",
        category="Cloud Authentication",
        message="Failed to Authenticate: SAML Response Invalid",
        description=(
            "The SAML response received from the Identity Provider is invalid or "
            "malformed."
        ),
        resolution=(
            "Check the IdP SAML configuration. Verify the SAML assertion attributes "
            "match the ZCC configuration."
        ),
        severity=Severity.ERROR,
        aliases=["SAML Response Invalid", "SAML invalid", "saml error"],
    ),
    "-10": ErrorCode(
        code="-10",
        category="Cloud Authentication",
        message="Failed to Authenticate: SAML Token Expired",
        description="The SAML token has expired before authentication could complete.",
        resolution=(
            "Check the clock synchronization on the device. Verify IdP token "
            "lifetime settings."
        ),
        severity=Severity.ERROR,
        aliases=["SAML Token Expired", "saml expired", "token expired"],
    ),
    "-11": ErrorCode(
        code="-11",
        category="Cloud Authentication",
        message="Failed to Authenticate: Kerberos Authentication Failed",
        description=(
            "Kerberos authentication failed. The device may not be joined to the "
            "domain or the Kerberos ticket is invalid."
        ),
        resolution=(
            "Verify the device is domain-joined. Check Kerberos configuration "
            "and domain controller reachability."
        ),
        severity=Severity.ERROR,
        aliases=["Kerberos Authentication Failed", "kerberos failed", "kerberos error"],
    ),
    "-12": ErrorCode(
        code="-12",
        category="Cloud Authentication",
        message="Failed to Authenticate: User Not Provisioned",
        description=(
            "The authenticated user does not exist in the Zscaler directory or "
            "has not been provisioned."
        ),
        resolution=(
            "Verify the user is provisioned in the Zscaler admin portal. "
            "Check SCIM or directory sync configuration."
        ),
        severity=Severity.ERROR,
        aliases=["User Not Provisioned", "user not found", "user provisioning failed"],
    ),
    "-13": ErrorCode(
        code="-13",
        category="Cloud Authentication",
        message="Failed to Authenticate: License Expired",
        description="The Zscaler license for this user or tenant has expired.",
        resolution="Contact Zscaler support to renew the license.",
        severity=Severity.CRITICAL,
        aliases=["License Expired", "license expired"],
    ),
    "-14": ErrorCode(
        code="-14",
        category="Cloud Authentication",
        message="Failed to Authenticate: Account Locked",
        description=(
            "The user account has been locked due to too many failed login attempts."
        ),
        resolution="Unlock the account in the Zscaler admin portal or IdP.",
        severity=Severity.ERROR,
        aliases=["Account Locked", "account locked", "user locked"],
    ),
    "-15": ErrorCode(
        code="-15",
        category="Cloud Authentication",
        message="Failed to Authenticate: MFA Required",
        description=(
            "Multi-factor authentication is required but was not completed by the user."
        ),
        resolution="Ensure the user completes MFA. Check MFA policy configuration.",
        severity=Severity.WARNING,
        aliases=["MFA Required", "mfa required", "multi-factor required"],
    ),
    "-16": ErrorCode(
        code="-16",
        category="Cloud Authentication",
        message="Failed to Authenticate: Device Not Trusted",
        description=(
            "The device is not in the trusted device list or does not meet the "
            "device posture requirements."
        ),
        resolution=(
            "Verify device posture policy. Ensure the device is enrolled and "
            "meets compliance requirements."
        ),
        severity=Severity.ERROR,
        aliases=["Device Not Trusted", "device not trusted", "device posture failed"],
    ),
    "-17": ErrorCode(
        code="-17",
        category="Cloud Authentication",
        message="Failed to Authenticate: Proxy Authentication Required",
        description=(
            "A proxy server is requiring authentication before allowing the "
            "connection to proceed."
        ),
        resolution=(
            "Configure proxy credentials in the ZCC forwarding profile or "
            "exclude the proxy from ZCC traffic."
        ),
        severity=Severity.ERROR,
        aliases=["Proxy Authentication Required", "proxy auth required", "407"],
    ),
    "-18": ErrorCode(
        code="-18",
        category="Cloud Authentication",
        message="Failed to Authenticate: SSL Inspection Certificate Error",
        description=(
            "An SSL certificate error occurred, possibly due to SSL inspection "
            "by an intermediate device."
        ),
        resolution=(
            "Install the Zscaler root CA certificate. Check SSL inspection "
            "bypass rules for ZCC traffic."
        ),
        severity=Severity.ERROR,
        aliases=["SSL Certificate Error", "ssl error", "certificate error", "cert error"],
    ),
    "-19": ErrorCode(
        code="-19",
        category="Cloud Authentication",
        message="Failed to Authenticate: Cloud Not Reachable",
        description=(
            "The Zscaler cloud endpoint is not reachable from the device."
        ),
        resolution=(
            "Check firewall rules. Verify that Zscaler cloud IPs/FQDNs are "
            "allowed. Test connectivity to gateway.zscaler.com."
        ),
        severity=Severity.CRITICAL,
        aliases=["Cloud Not Reachable", "cloud unreachable", "cannot reach cloud"],
    ),
    "-20": ErrorCode(
        code="-20",
        category="Cloud Authentication",
        message="Failed to Authenticate: Timeout",
        description=(
            "The authentication request timed out before a response was received."
        ),
        resolution=(
            "Check network latency. Verify cloud endpoint reachability. "
            "Check for packet loss on the network path."
        ),
        severity=Severity.ERROR,
        aliases=["Authentication Timeout", "auth timeout", "timeout"],
    ),
}

# ---------------------------------------------------------------------------
# Cloud Error Codes  (HTTP-style and service-level errors)
# Source: ZCC Errors page — "Cloud Error Codes" table
# ---------------------------------------------------------------------------
CLOUD_ERROR_CODES: dict[str, ErrorCode] = {
    "CLOUD_100": ErrorCode(
        code="CLOUD_100",
        category="Cloud Error",
        message="Gateway Unreachable",
        description=(
            "The ZCC client cannot reach the Zscaler gateway. This may be due to "
            "network connectivity issues, firewall blocking, or DNS resolution failure."
        ),
        resolution=(
            "Check network connectivity. Verify DNS resolves Zscaler FQDNs. "
            "Check firewall rules for Zscaler gateway IPs."
        ),
        severity=Severity.CRITICAL,
        aliases=["Gateway Unreachable", "gateway unreachable", "cannot reach gateway"],
    ),
    "CLOUD_101": ErrorCode(
        code="CLOUD_101",
        category="Cloud Error",
        message="DNS Resolution Failed",
        description=(
            "DNS resolution for a Zscaler cloud endpoint failed. The device cannot "
            "resolve the hostname to an IP address."
        ),
        resolution=(
            "Check DNS server configuration. Verify the device can resolve "
            "public DNS names. Check for DNS hijacking."
        ),
        severity=Severity.ERROR,
        aliases=["DNS Resolution Failed", "dns failed", "dns error", "DNS failure"],
    ),
    "CLOUD_102": ErrorCode(
        code="CLOUD_102",
        category="Cloud Error",
        message="SSL Handshake Failed",
        description=(
            "The SSL/TLS handshake with the Zscaler cloud failed. This may be "
            "caused by certificate issues, protocol mismatch, or SSL inspection."
        ),
        resolution=(
            "Check SSL/TLS version compatibility. Install Zscaler root CA. "
            "Verify SSL inspection bypass for ZCC."
        ),
        severity=Severity.ERROR,
        aliases=["SSL Handshake Failed", "ssl handshake", "tls handshake failed"],
    ),
    "CLOUD_103": ErrorCode(
        code="CLOUD_103",
        category="Cloud Error",
        message="Connection Reset",
        description=(
            "The connection to the Zscaler cloud was reset unexpectedly. "
            "This may indicate network instability or firewall interference."
        ),
        resolution=(
            "Check for network instability. Verify firewall is not resetting "
            "Zscaler connections. Check MTU settings."
        ),
        severity=Severity.ERROR,
        aliases=["Connection Reset", "connection reset", "RST", "TCP reset"],
    ),
    "CLOUD_200": ErrorCode(
        code="CLOUD_200",
        category="Cloud Error",
        message="Policy Enforcement Error",
        description=(
            "A policy enforcement error occurred. The user's traffic was blocked "
            "or redirected due to a policy violation."
        ),
        resolution=(
            "Review the ZIA policy configuration. Check URL filtering, "
            "application control, and firewall policies."
        ),
        severity=Severity.WARNING,
        aliases=["Policy Enforcement Error", "policy error", "policy blocked"],
    ),
    "CLOUD_201": ErrorCode(
        code="CLOUD_201",
        category="Cloud Error",
        message="Bandwidth Control Limit Reached",
        description=(
            "The user or location has reached the configured bandwidth control limit."
        ),
        resolution=(
            "Review bandwidth control policies. Consider increasing limits or "
            "adjusting QoS settings."
        ),
        severity=Severity.WARNING,
        aliases=["Bandwidth Control", "bandwidth limit", "bandwidth exceeded"],
    ),
    "CLOUD_300": ErrorCode(
        code="CLOUD_300",
        category="Cloud Error",
        message="Tunnel Establishment Failed",
        description=(
            "The ZCC tunnel to the Zscaler cloud could not be established. "
            "This affects traffic forwarding."
        ),
        resolution=(
            "Check network connectivity. Verify tunnel protocol (GRE/IPSec) "
            "is allowed. Check for NAT traversal issues."
        ),
        severity=Severity.CRITICAL,
        aliases=["Tunnel Establishment Failed", "tunnel failed", "tunnel error", "tunnel down"],
    ),
    "CLOUD_301": ErrorCode(
        code="CLOUD_301",
        category="Cloud Error",
        message="Tunnel Disconnected",
        description=(
            "An established tunnel to the Zscaler cloud was disconnected. "
            "Traffic forwarding is interrupted."
        ),
        resolution=(
            "Check network stability. Review tunnel keepalive settings. "
            "Check for network path changes."
        ),
        severity=Severity.ERROR,
        aliases=["Tunnel Disconnected", "tunnel disconnected", "tunnel dropped"],
    ),
    "CLOUD_302": ErrorCode(
        code="CLOUD_302",
        category="Cloud Error",
        message="Tunnel Reconnecting",
        description=(
            "The ZCC tunnel is attempting to reconnect after a disconnection."
        ),
        resolution=(
            "Monitor for successful reconnection. If persistent, check network "
            "stability and firewall rules."
        ),
        severity=Severity.WARNING,
        aliases=["Tunnel Reconnecting", "tunnel reconnecting", "reconnecting"],
    ),
    "CLOUD_400": ErrorCode(
        code="CLOUD_400",
        category="Cloud Error",
        message="PAC File Error",
        description=(
            "An error occurred while processing the PAC file. The PAC file may "
            "be malformed or contain invalid JavaScript."
        ),
        resolution=(
            "Validate the PAC file syntax. Test the PAC file using a PAC file "
            "tester. Check for JavaScript errors."
        ),
        severity=Severity.ERROR,
        aliases=["PAC File Error", "pac error", "pac file invalid"],
    ),
    "CLOUD_401": ErrorCode(
        code="CLOUD_401",
        category="Cloud Error",
        message="Proxy Configuration Error",
        description=(
            "The proxy configuration is invalid or the proxy server is unreachable."
        ),
        resolution=(
            "Verify proxy settings in the forwarding profile. Check proxy "
            "server availability."
        ),
        severity=Severity.ERROR,
        aliases=["Proxy Configuration Error", "proxy error", "proxy unreachable"],
    ),
    "CLOUD_500": ErrorCode(
        code="CLOUD_500",
        category="Cloud Error",
        message="Internal Service Error",
        description=(
            "An internal error occurred in the Zscaler cloud service. "
            "This is typically a transient issue."
        ),
        resolution=(
            "Retry the operation. If persistent, check Zscaler status page "
            "and contact Zscaler support."
        ),
        severity=Severity.ERROR,
        aliases=["Internal Service Error", "internal error", "service error", "500"],
    ),
    "CLOUD_503": ErrorCode(
        code="CLOUD_503",
        category="Cloud Error",
        message="Service Unavailable",
        description=(
            "The Zscaler cloud service is temporarily unavailable. "
            "This may be due to maintenance or an outage."
        ),
        resolution=(
            "Check the Zscaler status page (status.zscaler.com). "
            "Wait for service restoration."
        ),
        severity=Severity.CRITICAL,
        aliases=["Service Unavailable", "service unavailable", "503", "cloud down"],
    ),
}

# ---------------------------------------------------------------------------
# ZPA Authentication Error Codes
# Source: https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-zpa-authentication-errors
# ---------------------------------------------------------------------------
ZPA_AUTH_ERRORS: dict[str, ErrorCode] = {
    "ZPA_AUTH_001": ErrorCode(
        code="ZPA_AUTH_001",
        category="ZPA Authentication",
        message="ZPA Enrollment Failed: Certificate Not Found",
        description=(
            "The ZPA enrollment certificate could not be found on the device. "
            "This prevents ZPA authentication from completing."
        ),
        resolution=(
            "Re-enroll the device. Ensure the enrollment certificate is "
            "properly installed in the certificate store."
        ),
        severity=Severity.ERROR,
        aliases=["ZPA enrollment failed", "enrollment failed", "ZPA cert not found"],
    ),
    "ZPA_AUTH_002": ErrorCode(
        code="ZPA_AUTH_002",
        category="ZPA Authentication",
        message="ZPA Enrollment Failed: Certificate Expired",
        description=(
            "The ZPA enrollment certificate has expired. Authentication cannot "
            "proceed with an expired certificate."
        ),
        resolution=(
            "Re-enroll the device to obtain a new certificate. Check certificate "
            "renewal policies."
        ),
        severity=Severity.ERROR,
        aliases=["ZPA cert expired", "enrollment cert expired", "certificate expired"],
    ),
    "ZPA_AUTH_003": ErrorCode(
        code="ZPA_AUTH_003",
        category="ZPA Authentication",
        message="ZPA Enrollment Failed: Certificate Revoked",
        description=(
            "The ZPA enrollment certificate has been revoked. The device is no "
            "longer trusted."
        ),
        resolution=(
            "Re-enroll the device. Investigate why the certificate was revoked. "
            "Check CRL/OCSP configuration."
        ),
        severity=Severity.CRITICAL,
        aliases=["ZPA cert revoked", "certificate revoked", "cert revoked"],
    ),
    "ZPA_AUTH_004": ErrorCode(
        code="ZPA_AUTH_004",
        category="ZPA Authentication",
        message="ZPA IdP Authentication Failed",
        description=(
            "Authentication with the configured Identity Provider for ZPA failed. "
            "The IdP may be unreachable or the credentials are invalid."
        ),
        resolution=(
            "Check IdP connectivity. Verify SAML/OIDC configuration. "
            "Ensure the user exists in the IdP."
        ),
        severity=Severity.ERROR,
        aliases=["ZPA IdP failed", "IdP authentication failed", "idp error", "ZPA SAML failed"],
    ),
    "ZPA_AUTH_005": ErrorCode(
        code="ZPA_AUTH_005",
        category="ZPA Authentication",
        message="ZPA Broker Unreachable",
        description=(
            "The ZPA broker (App Connector) is unreachable. ZPA private access "
            "cannot be established."
        ),
        resolution=(
            "Check App Connector status. Verify network connectivity to the "
            "broker. Check firewall rules for ZPA traffic."
        ),
        severity=Severity.CRITICAL,
        aliases=["ZPA broker unreachable", "broker unreachable", "app connector unreachable"],
    ),
    "ZPA_AUTH_006": ErrorCode(
        code="ZPA_AUTH_006",
        category="ZPA Authentication",
        message="ZPA Policy Not Found",
        description=(
            "No ZPA access policy was found for the user or application. "
            "The user may not be authorized to access the application."
        ),
        resolution=(
            "Check ZPA access policies. Verify the user is in the correct "
            "group/segment. Review application segment configuration."
        ),
        severity=Severity.ERROR,
        aliases=["ZPA policy not found", "no ZPA policy", "access policy missing"],
    ),
    "ZPA_AUTH_007": ErrorCode(
        code="ZPA_AUTH_007",
        category="ZPA Authentication",
        message="ZPA Tunnel Creation Failed",
        description=(
            "The ZPA tunnel to the App Connector could not be created. "
            "Private application access is unavailable."
        ),
        resolution=(
            "Check App Connector health. Verify ZPA cloud connectivity. "
            "Review ZPA tunnel configuration."
        ),
        severity=Severity.CRITICAL,
        aliases=["ZPA tunnel failed", "ZPA tunnel creation failed", "zpa tunnel error"],
    ),
    "ZPA_AUTH_008": ErrorCode(
        code="ZPA_AUTH_008",
        category="ZPA Authentication",
        message="ZPA App Connector Down",
        description=(
            "The App Connector for the requested application is down or "
            "not responding."
        ),
        resolution=(
            "Check App Connector service status. Restart the App Connector "
            "if necessary. Verify network connectivity."
        ),
        severity=Severity.CRITICAL,
        aliases=["App Connector down", "app connector down", "connector down"],
    ),
    "ZPA_AUTH_009": ErrorCode(
        code="ZPA_AUTH_009",
        category="ZPA Authentication",
        message="ZPA Service Edge Unreachable",
        description=(
            "The ZPA Service Edge (formerly ZPA Public Service Edge) is "
            "unreachable from the device."
        ),
        resolution=(
            "Check network connectivity to ZPA Service Edge IPs. "
            "Verify firewall rules allow ZPA traffic on required ports."
        ),
        severity=Severity.CRITICAL,
        aliases=["ZPA Service Edge unreachable", "service edge unreachable", "ZPA edge down"],
    ),
    "ZPA_AUTH_010": ErrorCode(
        code="ZPA_AUTH_010",
        category="ZPA Authentication",
        message="ZPA Device Posture Check Failed",
        description=(
            "The device failed the ZPA device posture check. Access to "
            "private applications is blocked."
        ),
        resolution=(
            "Review device posture policy requirements. Ensure the device "
            "meets all compliance criteria (OS version, antivirus, etc.)."
        ),
        severity=Severity.ERROR,
        aliases=["ZPA posture failed", "device posture failed", "posture check failed"],
    ),
    "ZPA_AUTH_011": ErrorCode(
        code="ZPA_AUTH_011",
        category="ZPA Authentication",
        message="ZPA Enrollment Token Invalid",
        description=(
            "The ZPA enrollment token is invalid or has expired. "
            "Re-enrollment is required."
        ),
        resolution=(
            "Generate a new enrollment token. Re-enroll the device using "
            "the new token."
        ),
        severity=Severity.ERROR,
        aliases=["ZPA token invalid", "enrollment token invalid", "token invalid"],
    ),
    "ZPA_AUTH_012": ErrorCode(
        code="ZPA_AUTH_012",
        category="ZPA Authentication",
        message="ZPA Machine Tunnel Authentication Failed",
        description=(
            "Machine tunnel authentication for ZPA failed. The machine "
            "certificate may be missing or invalid."
        ),
        resolution=(
            "Check machine certificate installation. Verify machine tunnel "
            "configuration in ZPA admin portal."
        ),
        severity=Severity.ERROR,
        aliases=["machine tunnel failed", "ZPA machine auth failed", "machine auth failed"],
    ),
}

# ---------------------------------------------------------------------------
# Connection Status Error Codes
# Source: https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-connection-status-errors
# ---------------------------------------------------------------------------
CONNECTION_STATUS_ERRORS: dict[str, ErrorCode] = {
    "CONN_DISCONNECTED": ErrorCode(
        code="CONN_DISCONNECTED",
        category="Connection Status",
        message="Disconnected",
        description=(
            "Zscaler Client Connector is disconnected from the Zscaler cloud. "
            "Traffic is not being forwarded through Zscaler."
        ),
        resolution=(
            "Check network connectivity. Verify ZCC service is running. "
            "Check for authentication errors."
        ),
        severity=Severity.CRITICAL,
        aliases=["Disconnected", "disconnected", "DISCONNECTED", "ZCC disconnected"],
    ),
    "CONN_CONNECTING": ErrorCode(
        code="CONN_CONNECTING",
        category="Connection Status",
        message="Connecting",
        description=(
            "Zscaler Client Connector is in the process of connecting to "
            "the Zscaler cloud."
        ),
        resolution=(
            "Wait for connection to complete. If stuck in Connecting state, "
            "check network connectivity and authentication."
        ),
        severity=Severity.WARNING,
        aliases=["Connecting", "connecting", "CONNECTING"],
    ),
    "CONN_PARTIAL": ErrorCode(
        code="CONN_PARTIAL",
        category="Connection Status",
        message="Partial Tunnel",
        description=(
            "ZCC is partially connected. Some traffic may not be forwarded "
            "through Zscaler. This can occur when ZIA is connected but ZPA "
            "is not, or vice versa."
        ),
        resolution=(
            "Check both ZIA and ZPA connection status. Review forwarding "
            "profile configuration."
        ),
        severity=Severity.WARNING,
        aliases=["Partial Tunnel", "partial tunnel", "PARTIAL", "partial connection"],
    ),
    "CONN_DISABLED": ErrorCode(
        code="CONN_DISABLED",
        category="Connection Status",
        message="Disabled",
        description=(
            "Zscaler Client Connector has been disabled, either by the user "
            "(if permitted by policy) or by an administrator."
        ),
        resolution=(
            "Re-enable ZCC if user-disabled. If admin-disabled, check the "
            "ZCC policy configuration."
        ),
        severity=Severity.WARNING,
        aliases=["Disabled", "disabled", "DISABLED", "ZCC disabled"],
    ),
    "CONN_SUSPENDED": ErrorCode(
        code="CONN_SUSPENDED",
        category="Connection Status",
        message="Suspended",
        description=(
            "ZCC has been suspended. This may occur when a trusted network "
            "is detected or when a VPN is active."
        ),
        resolution=(
            "Check trusted network detection configuration. Verify VPN "
            "detection settings in the forwarding profile."
        ),
        severity=Severity.WARNING,
        aliases=["Suspended", "suspended", "SUSPENDED"],
    ),
    "CONN_TRUSTED_NETWORK": ErrorCode(
        code="CONN_TRUSTED_NETWORK",
        category="Connection Status",
        message="Trusted Network Detected",
        description=(
            "ZCC detected a trusted network and has suspended forwarding "
            "as configured by policy."
        ),
        resolution=(
            "This is expected behavior on trusted networks. If unexpected, "
            "review trusted network detection criteria."
        ),
        severity=Severity.INFO,
        aliases=["Trusted Network", "trusted network", "TRUSTED_NETWORK", "on trusted network"],
    ),
    "CONN_TIMEOUT": ErrorCode(
        code="CONN_TIMEOUT",
        category="Connection Status",
        message="Connection Timeout",
        description=(
            "The connection attempt to the Zscaler cloud timed out. "
            "The cloud endpoint may be unreachable or the network is slow."
        ),
        resolution=(
            "Check network latency. Verify cloud endpoint reachability. "
            "Check for packet loss."
        ),
        severity=Severity.ERROR,
        aliases=["Connection Timeout", "connection timeout", "timed out", "timeout"],
    ),
    "CONN_AUTH_REQUIRED": ErrorCode(
        code="CONN_AUTH_REQUIRED",
        category="Connection Status",
        message="Authentication Required",
        description=(
            "ZCC requires user authentication before it can connect. "
            "The user has not yet authenticated."
        ),
        resolution=(
            "Prompt the user to authenticate. Check if SSO is configured "
            "and working correctly."
        ),
        severity=Severity.WARNING,
        aliases=["Authentication Required", "auth required", "login required"],
    ),
    "CONN_GATEWAY_ERROR": ErrorCode(
        code="CONN_GATEWAY_ERROR",
        category="Connection Status",
        message="Gateway Error",
        description=(
            "An error occurred at the Zscaler gateway. Traffic forwarding "
            "may be impacted."
        ),
        resolution=(
            "Check Zscaler status page. Try connecting to a different "
            "Zscaler gateway. Contact Zscaler support if persistent."
        ),
        severity=Severity.ERROR,
        aliases=["Gateway Error", "gateway error", "GW error"],
    ),
    "CONN_CAPTIVE_PORTAL": ErrorCode(
        code="CONN_CAPTIVE_PORTAL",
        category="Connection Status",
        message="Captive Portal Detected",
        description=(
            "A captive portal was detected on the network. ZCC cannot "
            "connect until the captive portal is authenticated."
        ),
        resolution=(
            "Complete captive portal authentication in a browser. "
            "ZCC will reconnect automatically after authentication."
        ),
        severity=Severity.WARNING,
        aliases=["Captive Portal", "captive portal", "CAPTIVE_PORTAL", "captive portal detected"],
    ),
    "CONN_FALLBACK": ErrorCode(
        code="CONN_FALLBACK",
        category="Connection Status",
        message="Fallback Mode Active",
        description=(
            "ZCC is operating in fallback mode. Traffic may be forwarded "
            "directly without Zscaler inspection."
        ),
        resolution=(
            "Investigate why fallback mode was triggered. Check primary "
            "connection status and network connectivity."
        ),
        severity=Severity.WARNING,
        aliases=["Fallback", "fallback mode", "FALLBACK", "fallback active"],
    ),
    "CONN_UPGRADE_REQUIRED": ErrorCode(
        code="CONN_UPGRADE_REQUIRED",
        category="Connection Status",
        message="Client Upgrade Required",
        description=(
            "The installed version of Zscaler Client Connector is outdated "
            "and must be upgraded."
        ),
        resolution=(
            "Upgrade ZCC to the latest version. Check auto-update settings "
            "in the ZCC policy."
        ),
        severity=Severity.WARNING,
        aliases=["Upgrade Required", "upgrade required", "update required", "outdated client"],
    ),
}

# ---------------------------------------------------------------------------
# Portal Error Codes
# Source: ZCC Errors page — "Zscaler Client Connector Portal Error Codes" table
# ---------------------------------------------------------------------------
PORTAL_ERROR_CODES: dict[str, ErrorCode] = {
    "PORTAL_001": ErrorCode(
        code="PORTAL_001",
        category="Portal Error",
        message="Portal Authentication Failed",
        description=(
            "Authentication to the Zscaler Client Connector portal failed. "
            "The admin credentials may be incorrect."
        ),
        resolution=(
            "Verify admin credentials. Check if the admin account is active "
            "and has the correct permissions."
        ),
        severity=Severity.ERROR,
        aliases=["Portal auth failed", "portal authentication failed"],
    ),
    "PORTAL_002": ErrorCode(
        code="PORTAL_002",
        category="Portal Error",
        message="Portal Session Expired",
        description=(
            "The admin portal session has expired. Re-authentication is required."
        ),
        resolution="Re-authenticate to the portal.",
        severity=Severity.WARNING,
        aliases=["Portal session expired", "session expired"],
    ),
    "PORTAL_003": ErrorCode(
        code="PORTAL_003",
        category="Portal Error",
        message="Portal Configuration Push Failed",
        description=(
            "A configuration push from the portal to ZCC clients failed. "
            "Clients may not receive updated policies."
        ),
        resolution=(
            "Check portal connectivity. Verify ZCC clients are online. "
            "Retry the configuration push."
        ),
        severity=Severity.ERROR,
        aliases=["Config push failed", "configuration push failed", "policy push failed"],
    ),
    "PORTAL_004": ErrorCode(
        code="PORTAL_004",
        category="Portal Error",
        message="Portal API Error",
        description=(
            "An API error occurred in the ZCC portal. This may affect "
            "management operations."
        ),
        resolution=(
            "Check API credentials and permissions. Review API rate limits. "
            "Contact Zscaler support if persistent."
        ),
        severity=Severity.ERROR,
        aliases=["Portal API error", "API error"],
    ),
    "PORTAL_005": ErrorCode(
        code="PORTAL_005",
        category="Portal Error",
        message="Portal Enrollment Failed",
        description=(
            "Device enrollment through the portal failed. The device could "
            "not be registered with the ZCC portal."
        ),
        resolution=(
            "Check enrollment token validity. Verify network connectivity "
            "to the portal. Review enrollment policy."
        ),
        severity=Severity.ERROR,
        aliases=["Portal enrollment failed", "enrollment failed", "device enrollment failed"],
    ),
}

# ---------------------------------------------------------------------------
# Report an Issue Error Codes
# Source: ZCC Errors page — "Report an Issue Error Codes" table
# ---------------------------------------------------------------------------
REPORT_ISSUE_CODES: dict[str, ErrorCode] = {
    "REPORT_001": ErrorCode(
        code="REPORT_001",
        category="Report Issue",
        message="Log Upload Failed",
        description=(
            "The ZCC log upload to Zscaler support failed. Logs could not "
            "be transmitted."
        ),
        resolution=(
            "Check network connectivity. Verify the log upload endpoint is "
            "reachable. Try uploading logs manually."
        ),
        severity=Severity.WARNING,
        aliases=["Log upload failed", "log upload error"],
    ),
    "REPORT_002": ErrorCode(
        code="REPORT_002",
        category="Report Issue",
        message="Diagnostic Collection Failed",
        description=(
            "ZCC could not collect diagnostic information for the report."
        ),
        resolution=(
            "Ensure ZCC has sufficient permissions to collect diagnostics. "
            "Check disk space availability."
        ),
        severity=Severity.WARNING,
        aliases=["Diagnostic collection failed", "diagnostics failed"],
    ),
    "REPORT_003": ErrorCode(
        code="REPORT_003",
        category="Report Issue",
        message="Report Submission Failed",
        description=(
            "The issue report could not be submitted to Zscaler support."
        ),
        resolution=(
            "Check network connectivity. Verify the submission endpoint is "
            "reachable. Try submitting again later."
        ),
        severity=Severity.WARNING,
        aliases=["Report submission failed", "report failed"],
    ),
}

# ---------------------------------------------------------------------------
# Generic / Keyword-based patterns (not tied to specific numeric codes)
# These are used for pattern matching in log files where no explicit code exists
# ---------------------------------------------------------------------------
KEYWORD_PATTERNS: list[dict] = [
    # ---- Tunnel / Connectivity ----
    {
        "pattern": r"tunnel\s+(down|dropped|failed|disconnected|error)",
        "category": "Tunnel",
        "message": "Tunnel Down/Failed",
        "severity": Severity.CRITICAL,
        "code": "KW_TUNNEL_DOWN",
    },
    {
        "pattern": r"tunnel\s+(up|established|connected|reconnected)",
        "category": "Tunnel",
        "message": "Tunnel Established",
        "severity": Severity.INFO,
        "code": "KW_TUNNEL_UP",
    },
    {
        "pattern": r"(reconnect|reconnecting|re-connect)",
        "category": "Connectivity",
        "message": "Reconnection Attempt",
        "severity": Severity.WARNING,
        "code": "KW_RECONNECT",
    },
    # ---- Authentication ----
    {
        "pattern": r"(auth(entication)?\s+(fail|failed|error|timeout)|login\s+fail)",
        "category": "Authentication",
        "message": "Authentication Failure",
        "severity": Severity.ERROR,
        "code": "KW_AUTH_FAIL",
    },
    {
        "pattern": r"(saml\s+(fail|error|invalid|expired)|saml\s+response)",
        "category": "Authentication",
        "message": "SAML Error",
        "severity": Severity.ERROR,
        "code": "KW_SAML_ERROR",
    },
    {
        "pattern": r"(kerberos\s+(fail|error)|krb5?\s+error)",
        "category": "Authentication",
        "message": "Kerberos Error",
        "severity": Severity.ERROR,
        "code": "KW_KERBEROS_ERROR",
    },
    {
        "pattern": r"(certificate\s+(error|fail|invalid|expired|revoked)|cert\s+(error|fail|invalid))",
        "category": "Certificate",
        "message": "Certificate Error",
        "severity": Severity.ERROR,
        "code": "KW_CERT_ERROR",
    },
    {
        "pattern": r"(ssl\s+(error|fail|handshake|inspection)|tls\s+(error|fail|handshake))",
        "category": "SSL/TLS",
        "message": "SSL/TLS Error",
        "severity": Severity.ERROR,
        "code": "KW_SSL_ERROR",
    },
    # ---- Network ----
    {
        "pattern": r"(dns\s+(fail|error|timeout|resolution)|name\s+resolution\s+fail)",
        "category": "Network",
        "message": "DNS Failure",
        "severity": Severity.ERROR,
        "code": "KW_DNS_FAIL",
    },
    {
        "pattern": r"(network\s+(unreachable|unavailable|error|fail)|no\s+network)",
        "category": "Network",
        "message": "Network Unavailable",
        "severity": Severity.ERROR,
        "code": "KW_NETWORK_FAIL",
    },
    {
        "pattern": r"(connection\s+(timeout|timed\s+out|refused|reset|failed))",
        "category": "Network",
        "message": "Connection Error",
        "severity": Severity.ERROR,
        "code": "KW_CONN_ERROR",
    },
    {
        "pattern": r"(gateway\s+(unreachable|error|fail|down)|gw\s+(error|fail))",
        "category": "Network",
        "message": "Gateway Error",
        "severity": Severity.ERROR,
        "code": "KW_GATEWAY_ERROR",
    },
    {
        "pattern": r"(captive\s+portal|captive-portal)",
        "category": "Network",
        "message": "Captive Portal Detected",
        "severity": Severity.WARNING,
        "code": "KW_CAPTIVE_PORTAL",
    },
    # ---- ZPA Specific ----
    {
        "pattern": r"(zpa\s+(fail|error|disconnect|unreachable)|app\s+connector\s+(down|fail|error))",
        "category": "ZPA",
        "message": "ZPA Error",
        "severity": Severity.ERROR,
        "code": "KW_ZPA_ERROR",
    },
    {
        "pattern": r"(enrollment\s+(fail|error|invalid|expired)|enroll\s+fail)",
        "category": "ZPA",
        "message": "Enrollment Error",
        "severity": Severity.ERROR,
        "code": "KW_ENROLLMENT_ERROR",
    },
    {
        "pattern": r"(posture\s+(fail|check\s+fail|error)|device\s+posture\s+fail)",
        "category": "ZPA",
        "message": "Device Posture Check Failed",
        "severity": Severity.ERROR,
        "code": "KW_POSTURE_FAIL",
    },
    # ---- PAC File ----
    {
        "pattern": r"(pac\s+(fail|error|invalid|download\s+fail)|pac\s+file\s+(error|invalid))",
        "category": "PAC File",
        "message": "PAC File Error",
        "severity": Severity.ERROR,
        "code": "KW_PAC_ERROR",
    },
    # ---- Service / Process ----
    {
        "pattern": r"(service\s+(crash|fail|error|stop|restart)|process\s+(crash|fail|exit))",
        "category": "Service",
        "message": "Service Crash/Failure",
        "severity": Severity.CRITICAL,
        "code": "KW_SERVICE_CRASH",
    },
    {
        "pattern": r"(exception|traceback|stack\s+trace|unhandled\s+exception)",
        "category": "Service",
        "message": "Unhandled Exception",
        "severity": Severity.CRITICAL,
        "code": "KW_EXCEPTION",
    },
    {
        "pattern": r"(out\s+of\s+memory|oom|memory\s+(error|fail|exhausted))",
        "category": "Service",
        "message": "Memory Error",
        "severity": Severity.CRITICAL,
        "code": "KW_MEMORY_ERROR",
    },
    # ---- Policy ----
    {
        "pattern": r"(policy\s+(fail|error|violation|blocked|denied))",
        "category": "Policy",
        "message": "Policy Error/Violation",
        "severity": Severity.WARNING,
        "code": "KW_POLICY_ERROR",
    },
    {
        "pattern": r"(access\s+(denied|blocked|forbidden)|forbidden)",
        "category": "Policy",
        "message": "Access Denied",
        "severity": Severity.WARNING,
        "code": "KW_ACCESS_DENIED",
    },
    # ---- Update ----
    {
        "pattern": r"(update\s+(fail|error)|upgrade\s+(fail|error)|download\s+fail)",
        "category": "Update",
        "message": "Update/Upgrade Failed",
        "severity": Severity.WARNING,
        "code": "KW_UPDATE_FAIL",
    },
    # ---- Generic severity keywords ----
    {
        "pattern": r"\b(CRITICAL|FATAL)\b",
        "category": "General",
        "message": "Critical/Fatal Event",
        "severity": Severity.CRITICAL,
        "code": "KW_CRITICAL",
    },
    {
        "pattern": r"\bERROR\b",
        "category": "General",
        "message": "Error Event",
        "severity": Severity.ERROR,
        "code": "KW_ERROR",
    },
    {
        "pattern": r"\b(WARN|WARNING)\b",
        "category": "General",
        "message": "Warning Event",
        "severity": Severity.WARNING,
        "code": "KW_WARNING",
    },
]

# ---------------------------------------------------------------------------
# Unified lookup helpers
# ---------------------------------------------------------------------------

# Merge all named code dicts into one flat lookup
ALL_ERROR_CODES: dict[str, ErrorCode] = {
    **CLOUD_AUTH_ERRORS,
    **CLOUD_ERROR_CODES,
    **ZPA_AUTH_ERRORS,
    **CONNECTION_STATUS_ERRORS,
    **PORTAL_ERROR_CODES,
    **REPORT_ISSUE_CODES,
}

# Build alias → ErrorCode reverse map
_ALIAS_MAP: dict[str, ErrorCode] = {}
for _ec in ALL_ERROR_CODES.values():
    for _alias in _ec.aliases:
        _ALIAS_MAP[_alias.lower()] = _ec


def lookup_by_code(code: str) -> Optional[ErrorCode]:
    """Return an ErrorCode by its primary code string."""
    return ALL_ERROR_CODES.get(code)


def lookup_by_alias(text: str) -> Optional[ErrorCode]:
    """Return an ErrorCode by matching any of its alias strings (case-insensitive)."""
    return _ALIAS_MAP.get(text.lower())


def get_severity_rank(severity: str) -> int:
    """Return a numeric rank for sorting (higher = more severe)."""
    return {
        Severity.CRITICAL: 4,
        Severity.ERROR:    3,
        Severity.WARNING:  2,
        Severity.INFO:     1,
        Severity.DEBUG:    0,
    }.get(severity, 0)


SEVERITY_COLORS = {
    Severity.CRITICAL: "#dc2626",   # red-600
    Severity.ERROR:    "#ea580c",   # orange-600
    Severity.WARNING:  "#d97706",   # amber-600
    Severity.INFO:     "#2563eb",   # blue-600
    Severity.DEBUG:    "#6b7280",   # gray-500
}

SEVERITY_BADGE_CLASSES = {
    Severity.CRITICAL: "badge-critical",
    Severity.ERROR:    "badge-error",
    Severity.WARNING:  "badge-warning",
    Severity.INFO:     "badge-info",
    Severity.DEBUG:    "badge-debug",
}
