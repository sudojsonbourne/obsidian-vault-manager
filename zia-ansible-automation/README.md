# ZIA Ansible Automation Framework

> **Production-grade Ansible automation for Zscaler ZIA — managing 100+ locations with HashiCorp Vault credential management, full safety guardrails, and GitOps-ready CI/CD integration.**

---

## Quick Start

```bash
# 1. Install dependencies
pip install ansible hvac netaddr jmespath
ansible-galaxy collection install -r requirements.yml

# 2. Configure Vault
export VAULT_ADDR=https://vault.corp.example.com:8200
export VAULT_TOKEN=<your-token>
vault kv put secret/zia/us_primary/credentials \
  api_key="..." username="..." password="..."

# 3. Validate configuration (read-only, safe)
ansible-playbook -i inventories/production validate_only.yml

# 4. Dry run (preview changes)
ansible-playbook -i inventories/production onboard_locations.yml --check --diff

# 5. Deploy
ansible-playbook -i inventories/production onboard_locations.yml \
  --extra-vars "change_ticket=CHG0001234"
```

---

## Playbooks

| Playbook | Purpose | Destructive? |
|----------|---------|-------------|
| `site.yml` | Full stack deployment | No (unless state=absent) |
| `onboard_locations.yml` | Bulk location onboarding | No |
| `teardown_locations.yml` | Location removal | **YES** — requires `force=true` |
| `block_malicious_domains.yml` | Domain blocking | No |
| `validate_only.yml` | Pre-flight validation | **Never** |

---

## Roles

| Role | Manages | Key Safety Feature |
|------|---------|-------------------|
| `common` | Vault auth, preflight, logging | Credential never logged |
| `zscaler_zia_locations` | ZIA locations CRUD | force=true required for delete |
| `zscaler_zia_sub_locations` | Sub-locations with parent validation | Parent existence check |
| `zscaler_zia_gre_tunnels` | GRE tunnels with IP/ASN validation | Python IP validation |
| `zscaler_zia_domain_blocking` | Malicious domain blocking | FQDN format validation |

---

## Safety Controls

```bash
# ALWAYS run check mode first:
ansible-playbook -i inventories/production site.yml --check --diff

# Deletion requires explicit force flag:
ansible-playbook -i inventories/production teardown_locations.yml \
  --extra-vars "force=true"

# Bulk deletion is limited (default: max 5 at once):
--extra-vars "max_bulk_delete=10"

# Target single location for testing:
--extra-vars "target_location=NYC-HQ-01"

# Target region:
--extra-vars "location_filter_tag=us-east"
```

---

## Project Structure

```
zia-ansible-automation/
├── site.yml                          # Master playbook
├── onboard_locations.yml             # Bulk onboarding
├── teardown_locations.yml            # Safe teardown
├── block_malicious_domains.yml       # Domain blocking
├── validate_only.yml                 # Read-only validation
├── ansible.cfg                       # Ansible configuration
├── requirements.yml                  # Collection dependencies
├── Makefile                          # Convenience commands
│
├── inventories/
│   ├── production/hosts.yml          # Production ZIA tenants
│   └── staging/hosts.yml             # Staging ZIA tenants
│
├── group_vars/all/
│   ├── vault_config.yml              # Vault connection settings
│   ├── zia_defaults.yml              # ZIA API defaults & naming rules
│   └── logging.yml                   # Structured logging config
│
├── vars/
│   ├── locations/
│   │   ├── bulk_locations.yml        # 100+ location definitions
│   │   ├── sub_locations.yml         # Sub-location definitions
│   │   └── gre_tunnels.yml           # GRE tunnel definitions
│   ├── domains/
│   │   └── malicious_domains.yml     # Domains to block
│   └── tenants/
│       └── tenant_map.yml            # Multi-tenant configuration
│
├── roles/
│   ├── common/                       # Vault auth + preflight + logging
│   │   ├── tasks/vault_auth.yml      # HashiCorp Vault credential retrieval
│   │   ├── tasks/preflight_summary.yml
│   │   ├── tasks/logging.yml
│   │   └── defaults/main.yml
│   │
│   ├── zscaler_zia_locations/
│   │   ├── tasks/main.yml            # Orchestration
│   │   ├── tasks/validate.yml        # Pre-flight validation
│   │   ├── tasks/create.yml          # Create/update locations
│   │   └── tasks/delete.yml          # Safe deletion with guards
│   │
│   ├── zscaler_zia_sub_locations/
│   │   ├── tasks/validate.yml        # Parent existence check
│   │   └── tasks/create.yml          # Dynamic parent ID resolution
│   │
│   ├── zscaler_zia_gre_tunnels/
│   │   ├── tasks/validate.yml        # Python IP/ASN validation
│   │   └── tasks/create.yml          # Primary + secondary tunnels
│   │
│   └── zscaler_zia_domain_blocking/
│       ├── tasks/validate.yml        # Python FQDN validation
│       └── tasks/main.yml            # URL category management
│
├── molecule/default/                 # Unit testing
│   ├── molecule.yml
│   ├── converge.yml
│   └── verify.yml
│
└── docs/
    └── RUNBOOK.md                    # Full operational runbook
```

---

## Vault Credential Structure

```
secret/
└── zia/
    ├── us_primary/credentials
    │   ├── api_key
    │   ├── username
    │   └── password
    ├── eu_primary/credentials
    └── apac_primary/credentials
```

---

## Multi-Tenant Support

```bash
# All tenants:
ansible-playbook -i inventories/production site.yml

# Single tenant:
ansible-playbook -i inventories/production site.yml \
  --limit zia_tenant_us_primary

# EU tenants only:
ansible-playbook -i inventories/production site.yml \
  --limit zia_tenants_eu
```

---

## Testing

```bash
# Run Molecule tests:
molecule test

# Lint only:
ansible-lint && yamllint .

# Syntax check:
ansible-playbook site.yml --syntax-check
```

---

## Documentation

See [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for:
- Full setup instructions
- Vault configuration
- Day 1 onboarding workflow
- Day 2 operations
- CI/CD integration (GitLab + GitHub Actions)
- GitOps workflow
- Multi-tenant operations
- Extending to ZPA
- Troubleshooting guide

---

## Makefile Commands

```bash
make install        # Install all dependencies
make validate       # Run validation only (read-only)
make check          # Dry run with --check --diff
make deploy-staging # Deploy to staging
make deploy-prod    # Deploy to production (requires CHANGE_TICKET)
make block-domains  # Run domain blocking
make test           # Run Molecule tests
make lint           # Run ansible-lint + yamllint
```
