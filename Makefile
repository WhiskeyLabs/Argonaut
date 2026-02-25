ES_URL ?= http://localhost:9200
KIBANA_URL ?= http://localhost:5601
DEMO_ENV ?= cloud

.PHONY: demo-up demo-down demo-bootstrap demo-smoke demo-live

# demo-up:
# - requires docker
# - valid only when DEMO_ENV=local
demo-up:
	@if [ "$(DEMO_ENV)" = "cloud" ]; then echo "demo-up is disabled for DEMO_ENV=cloud. Use Elastic Cloud bootstrap/smoke commands instead."; exit 1; fi
	@if ! command -v docker >/dev/null 2>&1; then echo "docker is required for demo-up in local mode"; exit 1; fi
	docker compose -f infra/docker-compose.elastic.yml up -d

demo-down:
	@if [ "$(DEMO_ENV)" = "cloud" ]; then echo "demo-down is disabled for DEMO_ENV=cloud."; exit 1; fi
	@if ! command -v docker >/dev/null 2>&1; then echo "docker is required for demo-down in local mode"; exit 1; fi
	docker compose -f infra/docker-compose.elastic.yml down -v

demo-bootstrap:
	@if [ -z "$(ES_URL)" ]; then echo "ES_URL is required"; exit 1; fi
	@if [ -z "$(KIBANA_URL)" ]; then echo "KIBANA_URL is required"; exit 1; fi
	cd argus_core && ES_URL=$(ES_URL) KIBANA_URL=$(KIBANA_URL) ./node_modules/.bin/ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' ../scripts/bootstrap_es.ts
	cd argus_core && ES_URL=$(ES_URL) KIBANA_URL=$(KIBANA_URL) ./node_modules/.bin/ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' ../scripts/bootstrap_kibana.ts

# demo-smoke:
# - no docker dependency
# - requires ES/Kibana endpoints and auth
# - validates connectivity + templates + indices + Kibana data views/dashboard
demo-smoke:
	@if [ -z "$(ES_URL)" ]; then echo "ES_URL is required"; exit 1; fi
	@if [ -z "$(KIBANA_URL)" ]; then echo "KIBANA_URL is required"; exit 1; fi
	@if [ -z "$(ES_API_KEY)" ] && [ -z "$(ELASTIC_API_KEY)" ] && ( [ -z "$(ES_USERNAME)" ] || [ -z "$(ES_PASSWORD)" ] ); then echo "ES auth required: set ES_API_KEY (or ELASTIC_API_KEY) or ES_USERNAME/ES_PASSWORD"; exit 1; fi
	@if [ -z "$(KIBANA_API_KEY)" ] && ( [ -z "$(KIBANA_USERNAME)" ] || [ -z "$(KIBANA_PASSWORD)" ] ); then echo "Kibana auth required: set KIBANA_API_KEY or KIBANA_USERNAME/KIBANA_PASSWORD"; exit 1; fi
	cd argus_core && ES_URL=$(ES_URL) KIBANA_URL=$(KIBANA_URL) ./node_modules/.bin/ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' ../scripts/demo_smoke.ts

# demo-live:
# - cloud-first one-command rehearsal path
# - requires ES/Kibana endpoints + auth already exported
demo-live:
	@if [ -z "$(ES_URL)" ]; then echo "ES_URL is required"; exit 1; fi
	@if [ -z "$(KIBANA_URL)" ]; then echo "KIBANA_URL is required"; exit 1; fi
	@if [ -z "$(ES_API_KEY)" ] && [ -z "$(ELASTIC_API_KEY)" ] && ( [ -z "$(ES_USERNAME)" ] || [ -z "$(ES_PASSWORD)" ] ); then echo "ES auth required: set ES_API_KEY (or ELASTIC_API_KEY) or ES_USERNAME/ES_PASSWORD"; exit 1; fi
	@if [ -z "$(KIBANA_API_KEY)" ] && ( [ -z "$(KIBANA_USERNAME)" ] || [ -z "$(KIBANA_PASSWORD)" ] ); then echo "Kibana auth required: set KIBANA_API_KEY or KIBANA_USERNAME/KIBANA_PASSWORD"; exit 1; fi
	cd argus_core && npm run -s bootstrap:es
	cd argus_core && npm run -s bootstrap:kibana
	cd argus_core && npm run -s demo:smoke
	cd argus_core && npm run -s demo:judge -- --execution es --clean --bundle "$${DEMO_BUNDLE_PATH:-./demo_bundles/payment-service_build-128}" --repo "$${DEMO_REPO:-payment-service}" --build-id "$${DEMO_BUILD_ID:-build-128}"
