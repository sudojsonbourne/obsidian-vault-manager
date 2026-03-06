# =============================================================================
# Makefile — ZIA Ansible Automation Framework
# =============================================================================
# PURPOSE:
#   Provides convenient shorthand targets for common operations.
#   This Makefile serves as the primary interface for:
#     - Developers running playbooks locally
#     - CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins)
#     - Operations teams following runbooks
#
# USAGE:
#   make help                    — Show all available targets
#   make install                 — Install all dependencies
#   make validate                — Run pre-flight validation only
#   make plan                    — Dry-run (check mode) all playbooks
#   make apply                   — Apply all changes (production)
#   make onboard                 — Bulk onboard locations
#   make block-domains           — Apply malicious domain blocklist
#   make test                    — Run Molecule tests
#   make lint                    — Run ansible-lint
#
# ENVIRONMENT VARIABLES:
#   INVENTORY    — Override inventory (default: inventories/production)
#   TAGS         — Ansible tags to run (e.g., TAGS=create)
#   LIMIT        — Limit to specific hosts (e.g., LIMIT=zia_tenant_1)
#   EXTRA_VARS   — Additional extra vars (e.g., EXTRA_VARS="force=true")
#   VAULT_ADDR   — HashiCorp Vault address (required)
#   VAULT_TOKEN  — HashiCorp Vault token (required, or use AppRole)
#
# EXAMPLE CI/CD USAGE (GitHub Actions):
#   - name: Validate ZIA Configuration
#     run: make validate
#     env:
#       VAULT_ADDR: ${{ secrets.VAULT_ADDR }}
#       VAULT_TOKEN: ${{ secrets.VAULT_TOKEN }}
#
#   - name: Apply ZIA Configuration (dry-run)
#     run: make plan
#
#   - name: Apply ZIA Configuration
#     run: make apply
#     if: github.ref == 'refs/heads/main'
# =============================================================================

# ---------------------------------------------------------------------------
# VARIABLES
# ---------------------------------------------------------------------------
# Default inventory — override with: make apply INVENTORY=inventories/staging
INVENTORY ?= inventories/production

# Ansible playbook binary
ANSIBLE_PLAYBOOK := ansible-playbook

# Ansible galaxy binary
ANSIBLE_GALAXY := ansible-galaxy

# Ansible lint binary
ANSIBLE_LINT := ansible-lint

# Molecule binary (for testing)
MOLECULE := molecule

# Default verbosity (0=quiet, 1=-v, 2=-vv, 3=-vvv)
VERBOSITY ?= 0

# Build verbosity flag
ifeq ($(VERBOSITY),1)
  VERBOSE_FLAG := -v
else ifeq ($(VERBOSITY),2)
  VERBOSE_FLAG := -vv
else ifeq ($(VERBOSITY),3)
  VERBOSE_FLAG := -vvv
else
  VERBOSE_FLAG :=
endif

# Tags filter (empty = run all tags)
ifdef TAGS
  TAGS_FLAG := --tags $(TAGS)
else
  TAGS_FLAG :=
endif

# Host limit filter
ifdef LIMIT
  LIMIT_FLAG := --limit $(LIMIT)
else
  LIMIT_FLAG :=
endif

# Extra variables
ifdef EXTRA_VARS
  EXTRA_VARS_FLAG := --extra-vars "$(EXTRA_VARS)"
else
  EXTRA_VARS_FLAG :=
endif

# Common flags used across all playbook runs
COMMON_FLAGS := -i $(INVENTORY) $(VERBOSE_FLAG) $(TAGS_FLAG) $(LIMIT_FLAG) $(EXTRA_VARS_FLAG)

# ---------------------------------------------------------------------------
# PHONY TARGETS
# ---------------------------------------------------------------------------
# Declare all targets as phony to prevent conflicts with files of same name
.PHONY: help install install-pip validate plan apply onboard teardown \
        block-domains test lint clean check-vault check-env \
        molecule-test molecule-lint docs

# ---------------------------------------------------------------------------
# DEFAULT TARGET
# ---------------------------------------------------------------------------
.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# HELP TARGET
# ---------------------------------------------------------------------------
# Generates help text from target comments (## prefix)
help: ## Show this help message
	@echo ""
	@echo "╔══════════════════════════════════════════════════════════════╗"
	@echo "║         ZIA Ansible Automation Framework — Makefile          ║"
	@echo "╚══════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "USAGE: make [target] [VARIABLE=value ...]"
	@echo ""
	@echo "VARIABLES:"
	@echo "  INVENTORY    Override inventory path (default: inventories/production)"
	@echo "  TAGS         Run specific tags (e.g., TAGS=create)"
	@echo "  LIMIT        Limit to specific hosts (e.g., LIMIT=zia_tenant_1)"
	@echo "  EXTRA_VARS   Additional variables (e.g., EXTRA_VARS=\"force=true\")"
	@echo "  VERBOSITY    Output verbosity 0-3 (default: 0)"
	@echo ""
	@echo "TARGETS:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "EXAMPLES:"
	@echo "  make install                          # Install all dependencies"
	@echo "  make validate                         # Run pre-flight checks"
	@echo "  make plan                             # Dry-run (check mode)"
	@echo "  make apply                            # Apply all changes"
	@echo "  make onboard EXTRA_VARS=\"env=prod\"    # Bulk onboard locations"
	@echo "  make block-domains                    # Apply domain blocklist"
	@echo "  make teardown EXTRA_VARS=\"force=true\" # Teardown with force flag"
	@echo "  make test                             # Run all Molecule tests"
	@echo "  make lint                             # Run ansible-lint"
	@echo ""

# ---------------------------------------------------------------------------
# DEPENDENCY INSTALLATION
# ---------------------------------------------------------------------------
install: install-pip install-collections ## Install all dependencies (pip + collections)
	@echo "✅ All dependencies installed successfully"

install-pip: ## Install required Python packages
	@echo "📦 Installing Python dependencies..."
	pip install \
		ansible \
		ansible-lint \
		molecule \
		molecule-plugins \
		hvac \
		netaddr \
		jsonschema \
		zscaler-sdk-python \
		requests \
		jmespath
	@echo "✅ Python packages installed"

install-collections: ## Install Ansible Galaxy collections
	@echo "📦 Installing Ansible collections from requirements.yml..."
	$(ANSIBLE_GALAXY) collection install -r requirements.yml
	@echo "✅ Collections installed"

# ---------------------------------------------------------------------------
# ENVIRONMENT VALIDATION
# ---------------------------------------------------------------------------
check-env: ## Verify required environment variables are set
	@echo "🔍 Checking required environment variables..."
	@test -n "$(VAULT_ADDR)" || (echo "❌ ERROR: VAULT_ADDR is not set" && exit 1)
	@echo "  ✅ VAULT_ADDR = $(VAULT_ADDR)"
	@test -n "$(VAULT_TOKEN)" || test -n "$(VAULT_ROLE_ID)" || \
		(echo "❌ ERROR: Neither VAULT_TOKEN nor VAULT_ROLE_ID is set" && exit 1)
	@echo "  ✅ Vault authentication configured"
	@echo "✅ Environment check passed"

check-vault: check-env ## Verify HashiCorp Vault connectivity
	@echo "🔍 Testing Vault connectivity..."
	@curl -sf -H "X-Vault-Token: $(VAULT_TOKEN)" \
		$(VAULT_ADDR)/v1/sys/health > /dev/null || \
		(echo "❌ ERROR: Cannot connect to Vault at $(VAULT_ADDR)" && exit 1)
	@echo "✅ Vault is reachable and healthy"

# ---------------------------------------------------------------------------
# VALIDATION (PRE-FLIGHT)
# ---------------------------------------------------------------------------
validate: check-env ## Run pre-flight environment validation playbook
	@echo "🔍 Running pre-flight validation..."
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) validate_environment.yml
	@echo "✅ Validation complete"

# ---------------------------------------------------------------------------
# DRY-RUN (CHECK MODE)
# ---------------------------------------------------------------------------
plan: check-env ## Dry-run all playbooks in check mode (no changes made)
	@echo "📋 Running in CHECK MODE (no changes will be made)..."
	@echo "   This is equivalent to 'terraform plan'"
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) --check --diff site.yml
	@echo "✅ Dry-run complete — review output before running 'make apply'"

plan-locations: check-env ## Dry-run location management only
	@echo "📋 Dry-run: Location management..."
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) --check --diff onboard_locations.yml

plan-domains: check-env ## Dry-run domain blocking only
	@echo "📋 Dry-run: Domain blocking..."
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) --check --diff block_malicious_domains.yml

# ---------------------------------------------------------------------------
# APPLY (PRODUCTION CHANGES)
# ---------------------------------------------------------------------------
apply: check-env ## Apply all ZIA configuration changes
	@echo "⚠️  WARNING: This will make REAL changes to ZIA production!"
	@echo "   Run 'make plan' first to review changes."
	@read -p "   Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || exit 1
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) site.yml
	@echo "✅ All changes applied successfully"

# ---------------------------------------------------------------------------
# LOCATION MANAGEMENT
# ---------------------------------------------------------------------------
onboard: check-env ## Bulk onboard locations from vars/locations/bulk_locations.yml
	@echo "🏢 Starting bulk location onboarding..."
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) onboard_locations.yml
	@echo "✅ Location onboarding complete"

onboard-dry-run: check-env ## Dry-run bulk location onboarding
	@echo "📋 Dry-run: Bulk location onboarding..."
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) --check --diff onboard_locations.yml

teardown: check-env ## Teardown locations (DESTRUCTIVE — requires force=true)
	@echo "⚠️  DANGER: This will DELETE locations from ZIA!"
	@echo "   This action is IRREVERSIBLE."
	@echo "   Required: EXTRA_VARS=\"force=true location_names=['loc1','loc2']\""
	@test -n "$(EXTRA_VARS)" || (echo "❌ ERROR: EXTRA_VARS must be set for teardown" && exit 1)
	@read -p "   Type 'DELETE' to confirm teardown: " confirm && [ "$$confirm" = "DELETE" ] || exit 1
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) teardown_locations.yml
	@echo "✅ Teardown complete"

# ---------------------------------------------------------------------------
# DOMAIN BLOCKING
# ---------------------------------------------------------------------------
block-domains: check-env ## Apply malicious domain blocklist
	@echo "🛡️  Applying malicious domain blocklist..."
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) block_malicious_domains.yml
	@echo "✅ Domain blocklist applied"

block-domains-dry-run: check-env ## Dry-run domain blocking
	@echo "📋 Dry-run: Domain blocking..."
	$(ANSIBLE_PLAYBOOK) $(COMMON_FLAGS) --check --diff block_malicious_domains.yml

# ---------------------------------------------------------------------------
# TESTING
# ---------------------------------------------------------------------------
test: lint molecule-test ## Run all tests (lint + molecule)
	@echo "✅ All tests passed"

lint: ## Run ansible-lint on all playbooks and roles
	@echo "🔍 Running ansible-lint..."
	$(ANSIBLE_LINT) --profile production .
	@echo "✅ Lint passed"

molecule-test: ## Run Molecule tests for all roles
	@echo "🧪 Running Molecule tests..."
	cd molecule/default && $(MOLECULE) test
	@echo "✅ Molecule tests passed"

molecule-converge: ## Run Molecule converge (apply without verify/destroy)
	@echo "🧪 Running Molecule converge..."
	cd molecule/default && $(MOLECULE) converge

molecule-verify: ## Run Molecule verify only
	@echo "🧪 Running Molecule verify..."
	cd molecule/default && $(MOLECULE) verify

# ---------------------------------------------------------------------------
# DOCUMENTATION
# ---------------------------------------------------------------------------
docs: ## Generate documentation (requires ansible-doc)
	@echo "📚 Generating documentation..."
	@mkdir -p docs/generated
	ansible-doc -t module zscaler.ziacloud.zia_location_management > docs/generated/zia_location_management.txt 2>/dev/null || true
	ansible-doc -t module zscaler.ziacloud.zia_traffic_forwarding_gre_tunnels > docs/generated/zia_gre_tunnels.txt 2>/dev/null || true
	@echo "✅ Documentation generated in docs/generated/"

# ---------------------------------------------------------------------------
# CLEANUP
# ---------------------------------------------------------------------------
clean: ## Clean temporary files, retry files, and fact cache
	@echo "🧹 Cleaning temporary files..."
	rm -rf .retry/
	rm -rf /tmp/ansible_fact_cache/
	find . -name "*.retry" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	@echo "✅ Cleanup complete"

# ---------------------------------------------------------------------------
# SYNTAX CHECK
# ---------------------------------------------------------------------------
syntax-check: ## Run syntax check on all playbooks
	@echo "🔍 Running syntax check..."
	$(ANSIBLE_PLAYBOOK) --syntax-check site.yml
	$(ANSIBLE_PLAYBOOK) --syntax-check onboard_locations.yml
	$(ANSIBLE_PLAYBOOK) --syntax-check teardown_locations.yml
	$(ANSIBLE_PLAYBOOK) --syntax-check block_malicious_domains.yml
	$(ANSIBLE_PLAYBOOK) --syntax-check validate_environment.yml
	@echo "✅ Syntax check passed"
