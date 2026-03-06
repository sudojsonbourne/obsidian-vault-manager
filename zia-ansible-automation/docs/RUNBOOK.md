# ZIA Ansible Automation — Production Runbook

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [HashiCorp Vault Configuration](#hashicorp-vault-configuration)
4. [Day 1: Bulk Location Onboarding](#day-1-bulk-location-onboarding)
5. [Day 2: Ongoing Operations](#day-2-ongoing-operations)
6. [Domain Blocking Operations](#domain-blocking-operations)
7. [Safety Controls Reference](#safety-controls-reference)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [CI/CD Integration](#cicd-integration)
10. [GitOps Workflow](#gitops-workflow)
11. [Multi-Tenant Operations](#multi-tenant-operations)
12. [Extending to ZPA](#extending-to-zpa)
13. [Scalability Notes](#scalability-notes)

---

## Architecture Overview

```
zia-ansible-automation/
├── site.yml                    # Master playbook (all resources)
├── onboard_locations.yml       # Day 1: bulk onboarding
├── teardown_locations.yml      # Destructive: location removal
├── block_malicious_domains.yml # Security: domain blocking
├── validate_only.yml           # Read-only: pre-flight checks
│
├── inventories/
│   ├── production/             # Production ZIA tenants
│   └── staging/                # Staging/test ZIA tenants
│
├── group_vars/all/             # Global variables
│   ├── vault_config.yml        # Vault connection settings
│   ├── zia_defaults.yml        # ZIA API defaults
│   └── logging.yml             # Logging configuration
│
├── vars/
│   ├── locations/              # Location data files
│   │   ├── bulk_locations.yml  # 100+ location definitions
│   │   ├── sub_locations.yml   # Sub-location definitions
│   │   └── gre_tunnels.yml     # GRE tunnel definitions
│   ├── domains/
│   │   └── malicious_domains.yml
│   └── tenants/
│       └── tenant_map.yml      # Multi-tenant configuration
│
├── roles/
│   ├── common/                 # Vault auth, preflight, logging
│   ├── zscaler_zia_locations/  # Location CRUD
│   ├── zscaler_zia_sub_locations/
│   ├── zscaler_zia_gre_tunnels/
│   └── zscaler_zia_domain_blocking/
│
└── molecule/                   # Unit testing
```

### Role Dependency Chain
```
common (Vault auth + preflight)
  └── zscaler_zia_locations
        └── zscaler_zia_sub_locations
              └── zscaler_zia_gre_tunnels
                    └── zscaler_zia_domain_blocking
```

---

## Prerequisites & Setup

### 1. Install Dependencies

```bash
# Install Ansible (2.14+)
pip install ansible>=2.14

# Install required Python packages
pip install hvac netaddr jmespath

# Install Ansible collections
cd zia-ansible-automation
ansible-galaxy collection install -r requirements.yml

# Install Molecule for testing
pip install molecule molecule-plugins ansible-lint yamllint
```

### 2. Verify Installation

```bash
ansible --version          # Should be 2.14+
ansible-galaxy collection list | grep zscaler
ansible-galaxy collection list | grep hashi_vault
```

### 3. Configure Environment Variables

```bash
# HashiCorp Vault (required)
export VAULT_ADDR=https://vault.corp.example.com:8200
export VAULT_TOKEN=<your-vault-token>

# For CI/CD (AppRole auth — recommended over token)
export VAULT_ROLE_ID=<your-role-id>
export VAULT_SECRET_ID=<your-secret-id>

# Optional: operator identity for audit logs
export ANSIBLE_OPERATOR=john.doe@corp.example.com
```

---

## HashiCorp Vault Configuration

### Store ZIA Credentials

```bash
# Enable KV v2 secrets engine (if not already enabled)
vault secrets enable -path=secret kv-v2

# Store US Primary tenant credentials
vault kv put secret/zia/us_primary/credentials \
  api_key="your-zia-api-key" \
  username="admin@corp.zscaler.net" \
  password="your-zia-password"

# Store EU tenant credentials
vault kv put secret/zia/eu_primary/credentials \
  api_key="your-eu-zia-api-key" \
  username="admin@corp-eu.zscaler.net" \
  password="your-eu-zia-password"

# Verify credentials are stored
vault kv get secret/zia/us_primary/credentials
```

### Vault Policy for ZIA Automation

```hcl
# vault-policy-zia-automation.hcl
# Apply with: vault policy write zia-automation vault-policy-zia-automation.hcl

path "secret/data/zia/*" {
  capabilities = ["read"]
}

path "secret/metadata/zia/*" {
  capabilities = ["list", "read"]
}
```

### AppRole Setup (CI/CD)

```bash
# Enable AppRole auth
vault auth enable approle

# Create role with the ZIA policy
vault write auth/approle/role/zia-automation \
  token_policies="zia-automation" \
  token_ttl=1h \
  token_max_ttl=4h

# Get Role ID (store in CI/CD as VAULT_ROLE_ID)
vault read auth/approle/role/zia-automation/role-id

# Generate Secret ID (rotate regularly)
vault write -f auth/approle/role/zia-automation/secret-id
```

---

## Day 1: Bulk Location Onboarding

### Step 1: Define Locations

Edit `vars/locations/bulk_locations.yml`:

```yaml
zia_locations:
  - name: "NYC-HQ-01"
    state: present
    country: "UNITED_STATES"
    tz: "US/Eastern"
    ip_addresses:
      - "203.0.113.10"
    profile: "CORPORATE"
    auth_required: true
    tags: ["us-east", "hq"]
```

### Step 2: Validate Configuration (Read-Only)

```bash
# Always validate before deploying
ansible-playbook -i inventories/production validate_only.yml
```

### Step 3: Dry Run (Check Mode)

```bash
# Preview all changes without making them
ansible-playbook -i inventories/production onboard_locations.yml \
  --check --diff
```

### Step 4: Deploy to Staging First

```bash
ansible-playbook -i inventories/staging onboard_locations.yml
```

### Step 5: Deploy to Production

```bash
# With change ticket (required if change_management_enabled=true)
ansible-playbook -i inventories/production onboard_locations.yml \
  --extra-vars "change_ticket=CHG0001234"
```

### Step 6: Verify Deployment

```bash
# Run validation against live ZIA to confirm
ansible-playbook -i inventories/production validate_only.yml
```

---

## Day 2: Ongoing Operations

### Update a Location

1. Edit the location in `vars/locations/bulk_locations.yml`
2. Run check mode: `ansible-playbook -i inventories/production onboard_locations.yml --check --diff`
3. Apply: `ansible-playbook -i inventories/production onboard_locations.yml`

### Delete a Location

```bash
# 1. Mark location as absent in bulk_locations.yml:
#    state: absent

# 2. Preview deletion (ALWAYS do this first):
ansible-playbook -i inventories/production teardown_locations.yml \
  --check --diff --extra-vars "force=true"

# 3. Execute deletion:
ansible-playbook -i inventories/production teardown_locations.yml \
  --extra-vars "force=true change_ticket=CHG0001234"
```

### Target a Single Location

```bash
# Onboard only one location (useful for testing):
ansible-playbook -i inventories/production onboard_locations.yml \
  --extra-vars "target_location=NYC-HQ-01"

# Onboard a specific region:
ansible-playbook -i inventories/production onboard_locations.yml \
  --extra-vars "location_filter_tag=us-east"
```

---

## Domain Blocking Operations

### Block Domains from File

```bash
# Edit vars/domains/malicious_domains.yml, then:
ansible-playbook -i inventories/production block_malicious_domains.yml
```

### Emergency Domain Block (CLI)

```bash
# Block immediately via CLI (incident response):
ansible-playbook -i inventories/production block_malicious_domains.yml \
  --extra-vars "domains_to_block=['ransomware-c2.com','phishing-kit.net']"
```

### Preview Domain Blocks

```bash
ansible-playbook -i inventories/production block_malicious_domains.yml --check
```

---

## Safety Controls Reference

| Control | Default | Override |
|---------|---------|----------|
| `force` | `false` | `--extra-vars "force=true"` |
| `max_bulk_delete` | `5` | `--extra-vars "max_bulk_delete=10"` |
| `soft_delete_enabled` | `true` | `--extra-vars "soft_delete_enabled=false"` |
| `zia_auto_activate` | `true` | `--extra-vars "zia_auto_activate=false"` |
| `change_management_enabled` | `false` | Set in group_vars |
| `--check` | Off | `--check` flag |
| `--diff` | Off | `--diff` flag |

### Check Mode Usage

```bash
# Always run check mode before production changes:
ansible-playbook -i inventories/production site.yml --check --diff

# Check mode shows:
# - What WOULD be created/updated/deleted
# - Diff of configuration changes
# - Validation results
# - No actual API calls to ZIA
```

---

## Troubleshooting Guide

### Vault Connection Failures

```bash
# Test Vault connectivity:
vault status

# Test credential retrieval:
vault kv get secret/zia/us_primary/credentials

# Check environment variables:
echo $VAULT_ADDR
echo $VAULT_TOKEN  # Should not be empty

# Run with verbose output:
ansible-playbook -i inventories/production validate_only.yml -vvv
```

### ZIA API Failures

```bash
# Increase verbosity to see API responses:
ansible-playbook -i inventories/production onboard_locations.yml -vvv

# Check ZIA activation status manually:
# Log into ZIA admin portal → Administration → Activation

# Common issues:
# - Invalid API key: regenerate in ZIA admin portal
# - Rate limiting: increase zia_api_rate_limit_delay
# - Network connectivity: check firewall rules to ZIA cloud
```

### Location Validation Failures

```bash
# Run validation only to see all errors at once:
ansible-playbook -i inventories/production validate_only.yml

# Common validation errors:
# - Name pattern mismatch: check location_name_pattern in zia_defaults.yml
# - Invalid IP: must be public IPv4 (not RFC 1918)
# - Missing required field: check bulk_locations.yml for all required keys
```

### Sub-Location Parent Not Found

```bash
# This means the parent location doesn't exist in ZIA yet.
# Solution: run location onboarding first:
ansible-playbook -i inventories/production onboard_locations.yml --tags locations

# Then run sub-locations:
ansible-playbook -i inventories/production onboard_locations.yml --tags sub-locations
```

---

## CI/CD Integration

### GitLab CI Example

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - test
  - deploy-staging
  - deploy-production

variables:
  VAULT_ADDR: "https://vault.corp.example.com:8200"

validate:
  stage: validate
  script:
    - pip install ansible ansible-lint yamllint
    - ansible-galaxy collection install -r requirements.yml
    - ansible-lint
    - yamllint .
    - ansible-playbook validate_only.yml --syntax-check

molecule-test:
  stage: test
  script:
    - pip install molecule molecule-plugins
    - molecule test

deploy-staging:
  stage: deploy-staging
  environment: staging
  script:
    - ansible-playbook -i inventories/staging onboard_locations.yml
  only:
    - main

deploy-production:
  stage: deploy-production
  environment: production
  when: manual  # Require manual approval
  script:
    - ansible-playbook -i inventories/production onboard_locations.yml \
        --extra-vars "change_ticket=$CHANGE_TICKET"
  only:
    - main
```

### GitHub Actions Example

```yaml
# .github/workflows/zia-deploy.yml
name: ZIA Automation

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: pip install ansible ansible-lint yamllint molecule
      - name: Lint
        run: ansible-lint && yamllint .
      - name: Molecule test
        run: molecule test
        env:
          VAULT_ADDR: ${{ secrets.VAULT_ADDR }}
          VAULT_TOKEN: ${{ secrets.VAULT_TOKEN }}

  deploy-staging:
    needs: validate
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to staging
        run: ansible-playbook -i inventories/staging onboard_locations.yml
        env:
          VAULT_ADDR: ${{ secrets.VAULT_ADDR }}
          VAULT_ROLE_ID: ${{ secrets.VAULT_ROLE_ID }}
          VAULT_SECRET_ID: ${{ secrets.VAULT_SECRET_ID }}
```

---

## GitOps Workflow

### Branch Strategy

```
main          → Production deployments (protected, requires PR)
staging       → Staging deployments (auto-deploy on push)
feature/*     → Feature branches (run validate + molecule only)
hotfix/*      → Emergency fixes (fast-track to production)
```

### Pull Request Workflow

1. Create feature branch: `git checkout -b feature/add-london-locations`
2. Edit `vars/locations/bulk_locations.yml`
3. Run local validation: `ansible-playbook validate_only.yml --check`
4. Push and create PR
5. CI runs: lint → molecule → staging deploy → diff preview
6. Reviewer approves PR
7. Merge to main → auto-deploy to staging
8. Manual approval → deploy to production

### GitOps Principles Applied

- **Declarative**: All ZIA state is defined in YAML files
- **Versioned**: All changes tracked in git with full history
- **Automated**: CI/CD applies changes automatically
- **Auditable**: Every change has a git commit, PR, and audit log entry

---

## Multi-Tenant Operations

### Run Against All Tenants

```bash
# Deploy to all tenants (serial=1 by default):
ansible-playbook -i inventories/production site.yml
```

### Run Against Specific Tenant

```bash
# US Primary only:
ansible-playbook -i inventories/production site.yml \
  --limit zia_tenant_us_primary

# EU tenants only:
ansible-playbook -i inventories/production site.yml \
  --limit zia_tenants_eu
```

### Adding a New Tenant

1. Add credentials to Vault:
   ```bash
   vault kv put secret/zia/new_tenant/credentials \
     api_key="..." username="..." password="..."
   ```

2. Add to inventory (`inventories/production/hosts.yml`):
   ```yaml
   zia_tenant_new:
     vault_zia_path: "secret/zia/new_tenant/credentials"
     zia_cloud: "zscaler"
   ```

3. Add to tenant map (`vars/tenants/tenant_map.yml`)

4. Create location file: `vars/locations/bulk_locations_new_tenant.yml`

5. Test: `ansible-playbook -i inventories/production validate_only.yml --limit zia_tenant_new`

---

## Extending to ZPA

The framework is designed to extend to Zscaler Private Access (ZPA).

### Adding ZPA Support

1. Add ZPA collection to `requirements.yml`:
   ```yaml
   - name: zscaler.zpacloud
     version: ">=1.0.0"
   ```

2. Add ZPA credentials to Vault:
   ```bash
   vault kv put secret/zpa/us_primary/credentials \
     client_id="..." client_secret="..." customer_id="..."
   ```

3. Create new roles following the same pattern:
   ```
   roles/
   ├── zscaler_zpa_app_segments/
   ├── zscaler_zpa_server_groups/
   └── zscaler_zpa_access_policies/
   ```

4. Add ZPA plays to `site.yml`

The common role (Vault auth, preflight, logging) works for both ZIA and ZPA.

---

## Scalability Notes

### 100+ Locations

The framework handles 100+ locations via:
- **Data-driven design**: All locations in YAML files, not hardcoded
- **Loop-based processing**: Each location processed in a loop
- **Rate limiting**: `zia_api_rate_limit_delay` prevents API throttling
- **Serial execution**: `serial: 1` prevents concurrent API conflicts
- **Filtering**: `location_filter_tag` and `target_location` for targeted runs

### Performance Tuning

```bash
# For large deployments, increase parallelism (if ZIA API allows):
# In site.yml: serial: 3  (process 3 tenants simultaneously)

# Reduce rate limit delay for faster execution:
--extra-vars "zia_api_rate_limit_delay=0.5"

# Process only changed locations (use git diff to identify):
--extra-vars "location_filter_tag=changed-today"
```

### Recommended Limits

| Resource | Recommended Batch Size | Notes |
|----------|----------------------|-------|
| Locations | 50 per run | Split large batches |
| Sub-locations | 100 per run | Faster than locations |
| GRE Tunnels | 50 per run | Validate IPs first |
| Domains | 500 per run | ZIA category limit |
